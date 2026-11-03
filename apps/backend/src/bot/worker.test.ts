import { sql, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { cifrar, type Chaves } from '../cripto';
import { JOBS, StaleJobError } from '../queue';
import {
  FakeQueue,
  jobsConcluidos,
  mortasNaFila,
  prepararFilaFalsa,
  respostasNaFila,
} from '../queue.fake';
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
  INCOMING_QUEUE_POLICY,
  inputOf,
  logSender,
  processIncomingJob,
  registerIncomingWorker,
  registerReplyWorker,
  respostasDoJob,
  UNSUPPORTED_TEXT,
  UNBLOCK_CRON,
  type OutgoingReplies,
  type WorkerDeps,
} from './worker';

const PHONE_HMAC = 'a'.repeat(64);
const chaves: Chaves = { cifra: Buffer.alloc(32, 7), hmac: Buffer.alloc(32, 8) };
let contador = 0;

interface JobDeTeste {
  id: string;
  retryCount: number;
  retryLimit: number;
  createdOn: Date;
  data: IncomingMessageJob;
}

function job(content: ConteudoMensagem, type = 'text', phoneHmac = PHONE_HMAC): JobDeTeste {
  contador++;
  return {
    id: `job-${String(contador)}`,
    retryCount: 0,
    retryLimit: BOT_QUEUE_OPTIONS.retryLimit,
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

interface FilaExistente {
  policy?: string;
  queuedCount?: number;
  activeCount?: number;
}

/** pg-boss falso: guarda as filas criadas e o handler registrado. */
function bossFalso(filasExistentes: string[] | Record<string, FilaExistente> = []) {
  const existentes: Record<string, FilaExistente> = Array.isArray(filasExistentes)
    ? Object.fromEntries(filasExistentes.map((nome) => [nome, {}]))
    : filasExistentes;
  const chamadas: unknown[][] = [];
  const handlers = new Map<string, HandlerFalso>();
  const registrar =
    (nome: string) =>
    (...a: unknown[]) => {
      chamadas.push([nome, ...a]);
      return Promise.resolve();
    };
  const boss = {
    getQueue: (nome: string) => {
      const fila = existentes[nome];
      return Promise.resolve(fila ? { queuedCount: 0, activeCount: 0, ...fila } : null);
    },
    createQueue: registrar('createQueue'),
    updateQueue: registrar('updateQueue'),
    deleteQueue: registrar('deleteQueue'),
    schedule: registrar('schedule'),
    work: (nome: string, opcoes: unknown, h?: HandlerFalso) => {
      chamadas.push(['work', nome, opcoes]);
      handlers.set(nome, h ?? (opcoes as HandlerFalso));
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
  const opcoesDaEntrada = {
    ...BOT_QUEUE_OPTIONS,
    deadLetter: JOBS.incomingMessageDead,
  };

  it('cria a fila de mortas e a fila com ordem por conversa, e busca em lotes com metadados', async () => {
    const { boss, chamadas } = bossFalso();
    await registerIncomingWorker(boss, deps);

    expect(chamadas.slice(0, 2)).toEqual([
      ['createQueue', JOBS.incomingMessageDead],
      ['createQueue', JOBS.incomingMessage, { ...opcoesDaEntrada, policy: INCOMING_QUEUE_POLICY }],
    ]);
    expect(INCOMING_QUEUE_POLICY).toBe('key_strict_fifo');
    expect(chamadas).toContainEqual(['work', JOBS.incomingMessage, BOT_WORK_OPTIONS]);
    expect(chamadas).toContainEqual(['schedule', JOBS.unblockConversations, UNBLOCK_CRON]);
    expect(BOT_QUEUE_OPTIONS).toMatchObject({ notify: true, retryBackoff: true });
    // Processo caído volta rápido pelo heartbeat; o teto do expire cobre o lote inteiro no pior
    // caso (~75 s por transação), senão o fim de um lote lento expira sem ninguém ter caído.
    expect(BOT_QUEUE_OPTIONS.heartbeatSeconds).toBeLessThanOrEqual(30);
    expect(BOT_QUEUE_OPTIONS.expireInSeconds).toBeGreaterThanOrEqual(
      BOT_WORK_OPTIONS.batchSize * 75,
    );
    expect(BOT_WORK_OPTIONS).toMatchObject({
      burstWhenBatchFull: true,
      perJobResults: true,
      includeMetadata: true,
    });
    // groupConcurrency faria o pg-boss escolher o job de cada telefone pelo UUID, fora de ordem.
    expect(BOT_WORK_OPTIONS).not.toHaveProperty('groupConcurrency');
    expect(BOT_WORK_OPTIONS.batchSize).toBeGreaterThan(1);
    expect(BOT_WORK_OPTIONS.pollingIntervalSeconds).toBeLessThanOrEqual(0.5);
    // A 2ª mensagem de uma rajada não pode esperar o polling de 30 s do modo NOTIFY.
    expect(BOT_WORK_OPTIONS.notifyPollingIntervalSeconds).toBeLessThanOrEqual(0.5);
  });

  it('fila já criada com ordem por conversa só tem as opções atualizadas', async () => {
    const { boss, chamadas } = bossFalso({
      [JOBS.incomingMessage]: { policy: INCOMING_QUEUE_POLICY },
      [JOBS.incomingMessageDead]: {},
    });
    await registerIncomingWorker(boss, deps);
    expect(chamadas[0]).toEqual(['updateQueue', JOBS.incomingMessage, opcoesDaEntrada]);
  });

  it('fila antiga vazia com outra política é recriada com ordem por conversa', async () => {
    const { boss, chamadas } = bossFalso({
      [JOBS.incomingMessage]: { policy: 'standard' },
      [JOBS.incomingMessageDead]: {},
    });
    await registerIncomingWorker(boss, deps);
    expect(chamadas.slice(0, 2)).toEqual([
      ['deleteQueue', JOBS.incomingMessage],
      ['createQueue', JOBS.incomingMessage, { ...opcoesDaEntrada, policy: INCOMING_QUEUE_POLICY }],
    ]);
  });

  it('fila antiga com outra política e mensagens pendentes impede a subida', async () => {
    const { boss, chamadas } = bossFalso({
      [JOBS.incomingMessage]: { policy: 'standard', queuedCount: 2 },
      [JOBS.incomingMessageDead]: {},
    });
    await expect(registerIncomingWorker(boss, deps)).rejects.toThrow(/jobs pendentes/);
    expect(chamadas).not.toContainEqual(['deleteQueue', JOBS.incomingMessage]);
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

  it('falha passageira volta para o retry do pg-boss, sem ir para as mortas', async () => {
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, deps);

    let falhas = 1;
    const enviar = queue.send.bind(queue);
    queue.send = (...args) => {
      if (falhas-- > 0) return Promise.reject(new Error('banco piscou'));
      return enviar(...args);
    };
    const pisca = texto('oi');
    const outra = texto('oi', 'b'.repeat(64));
    const resultados = await handler(JOBS.incomingMessage)([pisca, outra]);

    // Falhado com tentativa sobrando: o pg-boss o põe em `retry`, e na fila key_strict_fifo ele
    // segue na frente da conversa. A outra conversa do lote não é afetada.
    expect(statuses(resultados)).toEqual(['failed', 'completed']);
    expect(await mortasNaFila(db)).toHaveLength(0);
    expect(await passo()).toBeUndefined();

    // A tentativa seguinte aplica a mensagem.
    queue.tentativas.set(pisca.id, 1);
    const retry = { ...pisca, retryCount: 1 };
    expect(statuses(await handler(JOBS.incomingMessage)([retry]))).toEqual(['completed']);
    expect(await passo()).toBe('MENU');
  });

  it('na última tentativa, a falha passageira vai para a fila de mortas e libera a conversa', async () => {
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, deps);

    const enviar = queue.send.bind(queue);
    queue.send = (name, ...resto) =>
      name === JOBS.outgoingReplies
        ? Promise.reject(new Error('banco fora'))
        : enviar(name, ...resto);
    const ultima = { ...texto('oi'), retryCount: BOT_QUEUE_OPTIONS.retryLimit };
    const resultados = (await handler(JOBS.incomingMessage)([ultima])) as {
      status: string;
      output?: unknown;
    }[];

    expect(statuses(resultados)).toEqual(['completed']);
    expect(resultados[0]?.output).toEqual({ descartada: true });
    expect(await mortasNaFila(db)).toHaveLength(1);
  });

  it('sem conseguir mover para as mortas, falha comum: nada de deadletter, que pula o retry', async () => {
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, deps);

    queue.send = () => Promise.reject(new Error('banco fora'));
    const ultima = { ...texto('oi'), retryCount: BOT_QUEUE_OPTIONS.retryLimit };

    expect(statuses(await handler(JOBS.incomingMessage)([ultima]))).toEqual(['failed']);
  });

  it('mensagem que sempre falha vai para a fila de mortas sozinha; o resto do lote segue', async () => {
    const handlers: HandlerRegistry = {
      ...defaultHandlers,
      // Transição inválida: bug do handler, não adianta tentar de novo.
      MENU: () => ({ next: 'NEW_ASK_PHOTO', replies: [] }),
    };
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, { ...deps, handlers });

    // Criados na ordem de chegada: o worker ordena o lote pelo createdOn.
    const oi = texto('oi');
    const qualquer = texto('qualquer');
    const lote = [oi, qualquer, texto('oi', 'b'.repeat(64))];
    const resultados = (await handler(JOBS.incomingMessage)(lote)) as {
      status: string;
      output?: unknown;
    }[];
    // Concluída e copiada para a fila de mortas: um job falhado travaria a conversa
    // (key_strict_fifo) até alguém resolvê-lo.
    expect(statuses(resultados)).toEqual(['completed', 'completed', 'completed']);
    expect(resultados[1]?.output).toEqual({ descartada: true });
    expect((await jobsConcluidos(db)).map((j) => j.id)).toContain(qualquer.id);
    const mortas = await mortasNaFila(db);
    expect(mortas).toHaveLength(1);
    expect(mortas[0]?.data.job).toMatchObject({ wamidHmac: qualquer.data.wamidHmac });
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

    expect(statuses(resultados)).toEqual(['completed', 'completed']);
    expect(await mortasNaFila(db)).toHaveLength(1);
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
