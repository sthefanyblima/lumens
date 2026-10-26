import { sql, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { cifrar, type Chaves } from '../cripto';
import { JOBS, StaleJobError } from '../queue';
import { FakeQueue, jobsConcluidos, prepararFilaFalsa, respostasNaFila } from '../queue.fake';
import {
  defaultHandlers,
  GREETING_TEXT,
  MENU_TEXT,
  type HandlerRegistry,
} from './conversation/handlers';
import { ConversationStore } from './conversation/store';
import type { ConteudoMensagem, IncomingMessageJob } from './webhook/process';
import {
  BOT_QUEUE_OPTIONS,
  BOT_WORK_OPTIONS,
  inputOf,
  logSender,
  processIncomingJob,
  registerIncomingWorker,
  registerReplyWorker,
  respostasDoJob,
  UNSUPPORTED_TEXT,
  type OutgoingReplies,
  type WorkerDeps,
} from './worker';

const PHONE_HMAC = 'a'.repeat(64);
const chaves: Chaves = { cifra: Buffer.alloc(32, 7), hmac: Buffer.alloc(32, 8) };
let contador = 0;

interface JobDeTeste {
  id: string;
  retryCount: number;
  createdOn: Date;
  data: IncomingMessageJob;
}

function job(content: ConteudoMensagem, type = 'text', phoneHmac = PHONE_HMAC): JobDeTeste {
  contador++;
  return {
    id: `job-${String(contador)}`,
    retryCount: 0,
    createdOn: new Date(1_700_000_000_000 + contador),
    data: {
      wamidHmac: `w${String(contador)}`,
      wamidCifrado: 'x',
      phoneHmac,
      phoneCifrado: 'telefone-cifrado',
      phoneNumberId: 'PNID',
      type,
      timestamp: '1700000000',
      contentCifrado: cifrar(JSON.stringify(content), chaves.cifra),
    },
  };
}

const texto = (body: string, phoneHmac?: string) => job({ text: { body } }, 'text', phoneHmac);

let db: Db;
let queue: FakeQueue;
let deps: WorkerDeps;
const respostas = async () =>
  (await respostasNaFila(db)).map((linha) => respostasDoJob(linha.data, chaves));
const passo = async () => (await deps.store.get(PHONE_HMAC))?.step;

// PGlite leva alguns segundos para subir no primeiro teste.
beforeEach(async () => {
  db = await criarBancoEmMemoria();
  await prepararFilaFalsa(db);
  queue = new FakeQueue();
  deps = {
    db,
    store: new ConversationStore(db),
    queue,
    logger: pino({ level: 'silent' }),
    chaves,
    retryDelaysMs: [0, 0],
  };
}, 20_000);

describe('inputOf', () => {
  it.each<[string, ConteudoMensagem, ReturnType<typeof inputOf>]>([
    ['texto', { text: { body: 'oi' } }, { text: 'oi' }],
    [
      'botão',
      { interactive: { type: 'button_reply', button_reply: { id: '2', title: 'Nova' } } },
      { text: '2' },
    ],
    [
      'lista',
      { interactive: { type: 'list_reply', list_reply: { id: '3', title: 'Verificar' } } },
      { text: '3' },
    ],
    ['botão de template', { button: { text: 'Sim', payload: 'sim' } }, { text: 'sim' }],
    [
      'imagem (a legenda não vira resposta)',
      { image: { id: 'm1', mime_type: 'image/jpeg', sha256: 's', caption: 'legenda' } },
      { text: '', image: { id: 'm1', mimeType: 'image/jpeg' } },
    ],
    ['áudio', {}, null],
  ])('%s', (_, conteudo, esperado) => {
    expect(inputOf(conteudo)).toEqual(esperado);
  });
});

describe('processIncomingJob', () => {
  it('anda a conversa, põe as respostas na fila de saída e conclui o job, tudo junto', async () => {
    const entrada = texto('oi');
    expect(await processIncomingJob(entrada, deps)).toEqual([GREETING_TEXT, MENU_TEXT]);

    expect(await passo()).toBe('MENU');
    const [saida] = await respostasNaFila(db);
    expect(saida?.data).toMatchObject({
      phoneHmac: PHONE_HMAC,
      phoneCifrado: 'telefone-cifrado',
      phoneNumberId: 'PNID',
      wamidHmac: entrada.data.wamidHmac,
    });
    expect(await respostas()).toEqual([[GREETING_TEXT, MENU_TEXT]]);
    expect(await jobsConcluidos(db)).toEqual([{ name: JOBS.incomingMessage, id: entrada.id }]);
  });

  it('o texto da pessoa e as respostas não ficam em claro na fila', async () => {
    const email = 'meu.email@ufal.br';
    await processIncomingJob(texto('2'), deps);
    await processIncomingJob(texto(email), deps);
    const linhas = (await db.execute(sql`select data::text as data from fake_job`)) as {
      rows: { data: string }[];
    };
    for (const { data } of linhas.rows) {
      expect(data).not.toContain('Qual o título');
      expect(data).not.toContain(email);
    }
  });

  it('tipo sem texto responde que ainda não entende e não mexe na conversa', async () => {
    await processIncomingJob(job({}, 'audio'), deps);
    expect(await respostas()).toEqual([[UNSUPPORTED_TEXT]]);
    expect(await passo()).toBeUndefined();
  });

  it('crash antes do commit: nada fica, e a reentrega aplica a mensagem uma vez só', async () => {
    await processIncomingJob(texto('oi'), deps);
    const dois = texto('2');

    queue.failSend = true;
    await expect(processIncomingJob(dois, deps)).rejects.toThrow('fila fora do ar');
    // O estado novo foi gravado e desfeito junto com o resto da transação.
    expect(await passo()).toBe('MENU');
    expect(await respostas()).toHaveLength(1);
    expect(await jobsConcluidos(db)).toHaveLength(1);

    queue.failSend = false;
    await processIncomingJob(dois, deps);
    // Um passo só: o "2" não foi aplicado duas vezes.
    expect(await passo()).toBe('NEW_ASK_TITLE');
    expect(await jobsConcluidos(db)).toHaveLength(2);
  });

  it('job que expirou e foi pego de novo: esta tentativa desfaz tudo', async () => {
    await processIncomingJob(texto('oi'), deps);
    const dois = texto('2');
    // Enquanto esta tentativa rodava, o job expirou e voltou como tentativa 1.
    queue.tentativas.set(dois.id, 1);

    await expect(processIncomingJob(dois, deps)).rejects.toBeInstanceOf(StaleJobError);
    expect(await passo()).toBe('MENU');
    expect(await respostas()).toHaveLength(1);
  });
});

type HandlerFalso = (jobs: JobDeTeste[] | { id: string; data: unknown }[]) => Promise<unknown>;

/** pg-boss falso: guarda as filas criadas e o handler registrado. */
function bossFalso(filasExistentes: string[] = []) {
  const chamadas: unknown[][] = [];
  const handlers = new Map<string, HandlerFalso>();
  const boss = {
    getQueue: (nome: string) => Promise.resolve(filasExistentes.includes(nome) ? {} : null),
    createQueue: (...a: unknown[]) => {
      chamadas.push(['createQueue', ...a]);
      return Promise.resolve();
    },
    updateQueue: (...a: unknown[]) => {
      chamadas.push(['updateQueue', ...a]);
      return Promise.resolve();
    },
    work: (nome: string, opcoes: unknown, h: HandlerFalso) => {
      chamadas.push(['work', nome, opcoes]);
      handlers.set(nome, h);
      return Promise.resolve('w1');
    },
  };
  return {
    boss: boss as unknown as Parameters<typeof registerIncomingWorker>[0],
    chamadas,
    handler: (nome: string) => {
      const h = handlers.get(nome);
      if (!h) throw new Error(`nenhum worker em ${nome}`);
      return h;
    },
  };
}

const statuses = (resultados: unknown) => (resultados as { status: string }[]).map((r) => r.status);

describe('registerIncomingWorker', () => {
  it('cria a fila de mortas e a fila, e busca em lotes com rajada e metadados', async () => {
    const { boss, chamadas } = bossFalso();
    await registerIncomingWorker(boss, deps);

    expect(chamadas).toEqual([
      ['createQueue', JOBS.incomingMessageDead],
      [
        'createQueue',
        JOBS.incomingMessage,
        { ...BOT_QUEUE_OPTIONS, deadLetter: JOBS.incomingMessageDead },
      ],
      ['work', JOBS.incomingMessage, BOT_WORK_OPTIONS],
    ]);
    expect(BOT_QUEUE_OPTIONS).toMatchObject({ notify: true, expireInSeconds: 60 });
    expect(BOT_WORK_OPTIONS).toMatchObject({
      burstWhenBatchFull: true,
      perJobResults: true,
      includeMetadata: true,
    });
    // groupConcurrency faria o pg-boss escolher o job de cada telefone pelo UUID, fora de ordem.
    expect(BOT_WORK_OPTIONS).not.toHaveProperty('groupConcurrency');
    expect(BOT_WORK_OPTIONS.batchSize).toBeGreaterThan(1);
    expect(BOT_WORK_OPTIONS.pollingIntervalSeconds).toBeLessThanOrEqual(0.5);
  });

  it('fila criada antes com as opções padrão é atualizada', async () => {
    const { boss, chamadas } = bossFalso([JOBS.incomingMessage, JOBS.incomingMessageDead]);
    await registerIncomingWorker(boss, deps);
    expect(chamadas[0]).toEqual([
      'updateQueue',
      JOBS.incomingMessage,
      { ...BOT_QUEUE_OPTIONS, deadLetter: JOBS.incomingMessageDead },
    ]);
  });

  it('aplica o lote na ordem de chegada, mesmo que o pg-boss o devolva embaralhado', async () => {
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, deps);

    const [oi, dois, titulo] = [texto('oi'), texto('2'), texto('Bebedouro')];
    const resultados = await handler(JOBS.incomingMessage)([titulo, oi, dois]);
    expect(statuses(resultados)).toEqual(['completed', 'completed', 'completed']);
    expect(await passo()).toBe('NEW_ASK_PLACE');
    expect((await jobsConcluidos(db)).map((j) => j.id)).toEqual([oi.id, dois.id, titulo.id]);
  });

  it('falha passageira é tentada de novo antes da próxima mensagem, mantendo a ordem', async () => {
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, deps);
    await processIncomingJob(texto('oi'), deps);

    let falhas = 1;
    const enviar = queue.send.bind(queue);
    queue.send = (...args) => {
      if (falhas-- > 0) return Promise.reject(new Error('banco piscou'));
      return enviar(...args);
    };
    const resultados = await handler(JOBS.incomingMessage)([texto('2'), texto('Bebedouro')]);

    expect(statuses(resultados)).toEqual(['completed', 'completed']);
    // "2" foi aplicado antes de "Bebedouro": a conversa passou por NEW_ASK_TITLE.
    expect(await passo()).toBe('NEW_ASK_PLACE');
  });

  it('mensagem que sempre falha vai para a fila de mortas sozinha; o resto do lote segue', async () => {
    const handlers: HandlerRegistry = {
      ...defaultHandlers,
      // Transição inválida: bug do handler, não adianta tentar de novo.
      MENU: () => ({ next: 'NEW_ASK_PHOTO', replies: [] }),
    };
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, { ...deps, handlers });

    const lote = [texto('oi'), texto('qualquer'), texto('oi', 'b'.repeat(64))];
    expect(statuses(await handler(JOBS.incomingMessage)(lote))).toEqual([
      'completed',
      'deadletter',
      'completed',
    ]);
    expect(await jobsConcluidos(db)).toHaveLength(2);
  });

  it('job em formato antigo vai para a fila de mortas sem derrubar o lote', async () => {
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, deps);

    const antigo = {
      id: 'antigo',
      retryCount: 0,
      createdOn: new Date(0),
      data: { from: '5582999990000', text: 'oi' },
    };
    const resultados = await handler(JOBS.incomingMessage)([antigo, texto('oi')] as JobDeTeste[]);

    expect(statuses(resultados)).toEqual(['deadletter', 'completed']);
    expect(await passo()).toBe('MENU');
  });

  it('job que expirou durante o processamento não é tentado de novo nem vai para as mortas', async () => {
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, deps);
    const velho = texto('oi');
    queue.tentativas.set(velho.id, 1);

    expect(statuses(await handler(JOBS.incomingMessage)([velho]))).toEqual(['failed']);
    expect(await passo()).toBeUndefined();
  });
});

describe('registerReplyWorker', () => {
  const saida = (replies: string[], createdOn = new Date()) => ({
    id: replies.join(),
    retryCount: 0,
    createdOn,
    data: {
      phoneHmac: PHONE_HMAC,
      phoneCifrado: 'c',
      phoneNumberId: 'PNID',
      wamidHmac: 'w',
      repliesCifradas: cifrar(JSON.stringify(replies), chaves.cifra),
    } satisfies OutgoingReplies,
  });

  it('entrega as respostas pelo sender, na ordem de chegada', async () => {
    const { boss, chamadas, handler } = bossFalso();
    const entregues: string[][] = [];
    await registerReplyWorker(
      boss,
      {
        send: (mensagem) => {
          entregues.push(respostasDoJob(mensagem, chaves));
          return Promise.resolve();
        },
      },
      deps.logger,
    );
    expect(chamadas[0]).toEqual(['createQueue', JOBS.outgoingRepliesDead]);
    expect(chamadas[1]).toEqual([
      'createQueue',
      JOBS.outgoingReplies,
      { ...BOT_QUEUE_OPTIONS, deadLetter: JOBS.outgoingRepliesDead },
    ]);

    await handler(JOBS.outgoingReplies)([
      saida(['segunda'], new Date(2000)),
      saida(['primeira'], new Date(1000)),
    ]);
    expect(entregues).toEqual([['primeira'], ['segunda']]);
  });

  it('um envio que falha não derruba os outros do lote', async () => {
    const { boss, handler } = bossFalso();
    await registerReplyWorker(
      boss,
      {
        send: (mensagem) =>
          respostasDoJob(mensagem, chaves)[0] === 'falha'
            ? Promise.reject(new Error('Meta fora'))
            : Promise.resolve(),
      },
      deps.logger,
    );
    const resultados = (await handler(JOBS.outgoingReplies)([
      saida(['falha'], new Date(1)),
      saida(['ok'], new Date(2)),
    ])) as { id: string; status: string }[];
    expect(resultados.map((r) => [r.id, r.status])).toEqual([
      ['falha', 'failed'],
      ['ok', 'completed'],
    ]);
  });
});

describe('logSender', () => {
  it('não põe o texto das respostas no log', async () => {
    const logs: string[] = [];
    const logger = pino({ level: 'info' }, { write: (linha: string) => logs.push(linha) });
    const mensagem: OutgoingReplies = {
      phoneHmac: PHONE_HMAC,
      phoneCifrado: 'c',
      phoneNumberId: 'P',
      wamidHmac: 'w',
      repliesCifradas: cifrar(JSON.stringify(['meu.email@ufal.br']), chaves.cifra),
    };
    await logSender(logger, chaves).send(mensagem);
    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toContain('meu.email@ufal.br');
    expect(JSON.parse(logs[0] ?? '{}')).toMatchObject({ respostas: 1 });
  });

  it('no modo dev mostra o texto, para testar a conversa pelo simulador', async () => {
    const logs: string[] = [];
    const logger = pino({ level: 'info' }, { write: (linha: string) => logs.push(linha) });
    const mensagem: OutgoingReplies = {
      phoneHmac: PHONE_HMAC,
      phoneCifrado: 'c',
      phoneNumberId: 'P',
      wamidHmac: 'w',
      repliesCifradas: cifrar(JSON.stringify([GREETING_TEXT, MENU_TEXT]), chaves.cifra),
    };
    await logSender(logger, chaves, { mostrarTexto: true }).send(mensagem);
    expect(JSON.parse(logs[0] ?? '{}')).toMatchObject({ texto: [GREETING_TEXT, MENU_TEXT] });
  });
});
