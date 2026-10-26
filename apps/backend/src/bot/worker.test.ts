import type { Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { JOBS } from '../queue';
import { FakeQueue, jobsConcluidos, prepararFilaFalsa, respostasNaFila } from '../queue.fake';
import { GREETING_TEXT, MENU_TEXT, type HandlerRegistry } from './conversation/handlers';
import { ConversationStore } from './conversation/store';
import type { ConteudoMensagem, IncomingMessageJob } from './webhook/process';
import {
  BOT_QUEUE_OPTIONS,
  BOT_WORK_OPTIONS,
  logSender,
  processIncomingJob,
  registerIncomingWorker,
  registerReplyWorker,
  textOf,
  UNSUPPORTED_TEXT,
  type OutgoingReplies,
  type WorkerDeps,
} from './worker';

const PHONE_HMAC = 'a'.repeat(64);
let contador = 0;

function job(content: ConteudoMensagem, type = 'text'): { id: string; data: IncomingMessageJob } {
  contador++;
  return {
    id: `job-${String(contador)}`,
    data: {
      wamidHmac: `w${String(contador)}`,
      wamidCifrado: 'x',
      phoneHmac: PHONE_HMAC,
      phoneCifrado: 'telefone-cifrado',
      phoneNumberId: 'PNID',
      type,
      timestamp: '1700000000',
      content,
    },
  };
}

const texto = (body: string) => job({ text: { body } });

let db: Db;
let queue: FakeQueue;
let deps: WorkerDeps;
const respostas = () => respostasNaFila(db);
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
    retryDelaysMs: [0, 0],
  };
}, 20_000);

describe('textOf', () => {
  it.each([
    ['texto', texto('oi').data, 'oi'],
    [
      'botão',
      job({ interactive: { type: 'button_reply', button_reply: { id: '2', title: 'Nova' } } }).data,
      '2',
    ],
    [
      'lista',
      job({ interactive: { type: 'list_reply', list_reply: { id: '3', title: 'Verificar' } } })
        .data,
      '3',
    ],
    ['botão de template', job({ button: { text: 'Sim', payload: 'sim' } }, 'button').data, 'sim'],
    [
      'imagem',
      job({ image: { id: '1', mime_type: 'image/jpeg', sha256: 's' } }, 'image').data,
      null,
    ],
    ['áudio', job({}, 'audio').data, null],
  ])('%s', (_, entrada, esperado) => {
    expect(textOf(entrada)).toBe(esperado);
  });
});

describe('processIncomingJob', () => {
  it('anda a conversa, põe as respostas na fila de saída e conclui o job, tudo junto', async () => {
    const entrada = texto('oi');
    expect(await processIncomingJob(entrada, deps)).toEqual([GREETING_TEXT, MENU_TEXT]);

    expect(await passo()).toBe('MENU');
    expect(await respostas()).toEqual([
      {
        data: {
          phoneHmac: PHONE_HMAC,
          phoneCifrado: 'telefone-cifrado',
          phoneNumberId: 'PNID',
          wamidHmac: entrada.data.wamidHmac,
          replies: [GREETING_TEXT, MENU_TEXT],
        },
        grupo: PHONE_HMAC,
      },
    ]);
    expect(await jobsConcluidos(db)).toEqual([{ name: JOBS.incomingMessage, id: entrada.id }]);
  });

  it('tipo sem texto responde que ainda não entende e não mexe na conversa', async () => {
    await processIncomingJob(job({}, 'audio'), deps);
    expect((await respostas())[0]?.data.replies).toEqual([UNSUPPORTED_TEXT]);
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
});

/** pg-boss falso: guarda as filas criadas e o handler registrado. */
function bossFalso(filasExistentes: string[] = []) {
  const chamadas: unknown[][] = [];
  const handlers = new Map<string, (jobs: { id: string; data: unknown }[]) => Promise<unknown>>();
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
    work: (
      nome: string,
      opcoes: unknown,
      h: (jobs: { id: string; data: unknown }[]) => Promise<unknown>,
    ) => {
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

describe('registerIncomingWorker', () => {
  it('cria a fila de mortas e a fila, e busca em lotes com rajada, um job ativo por telefone', async () => {
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
      groupConcurrency: 1,
    });
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

  it('processa o lote em ordem de chegada e conclui cada job', async () => {
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, deps);

    const lote = [texto('oi'), texto('2'), texto('Bebedouro')];
    const resultados = await handler(JOBS.incomingMessage)(lote);
    expect(resultados).toEqual(lote.map((j) => ({ id: j.id, status: 'completed' })));
    expect(await passo()).toBe('NEW_ASK_PLACE');
    expect(await jobsConcluidos(db)).toHaveLength(3);
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
    const lote = [texto('2'), texto('Bebedouro')];
    const resultados = await handler(JOBS.incomingMessage)(lote);

    expect(resultados).toEqual(lote.map((j) => ({ id: j.id, status: 'completed' })));
    // "2" foi aplicado antes de "Bebedouro": a conversa passou por NEW_ASK_TITLE.
    expect(await passo()).toBe('NEW_ASK_PLACE');
  });

  it('mensagem que sempre falha vai para a fila de mortas sozinha; o resto do lote segue', async () => {
    const handlers: HandlerRegistry = {
      ...(await import('./conversation/handlers')).defaultHandlers,
      // Transição inválida: bug do handler, não adianta tentar de novo.
      MENU: () => ({ next: 'NEW_ASK_PHOTO', replies: [] }),
    };
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, { ...deps, handlers });

    const outro = { ...texto('oi'), data: { ...texto('oi').data, phoneHmac: 'b'.repeat(64) } };
    const lote = [texto('oi'), texto('qualquer'), outro];
    const resultados = (await handler(JOBS.incomingMessage)(lote)) as { status: string }[];

    expect(resultados.map((r) => r.status)).toEqual(['completed', 'deadletter', 'completed']);
    expect(await jobsConcluidos(db)).toHaveLength(2);
  });

  it('job em formato antigo vai para a fila de mortas sem derrubar o lote', async () => {
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, deps);

    const antigo = { id: 'antigo', data: { from: '5582999990000', text: 'oi' } };
    const lote = [antigo, texto('oi')];
    const resultados = (await handler(JOBS.incomingMessage)(lote)) as { status: string }[];

    expect(resultados.map((r) => r.status)).toEqual(['deadletter', 'completed']);
    expect(await passo()).toBe('MENU');
  });
});

describe('registerReplyWorker', () => {
  const saida = (replies: string[]): OutgoingReplies => ({
    phoneHmac: PHONE_HMAC,
    phoneCifrado: 'c',
    phoneNumberId: 'PNID',
    wamidHmac: 'w',
    replies,
  });

  it('entrega cada lote de respostas pelo sender', async () => {
    const { boss, chamadas, handler } = bossFalso();
    const entregues: OutgoingReplies[] = [];
    await registerReplyWorker(
      boss,
      {
        send: (mensagem) => {
          entregues.push(mensagem);
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

    await handler(JOBS.outgoingReplies)([{ id: 'j', data: saida(['oi']) }]);
    expect(entregues).toEqual([saida(['oi'])]);
  });

  it('um envio que falha não derruba os outros do lote', async () => {
    const { boss, handler } = bossFalso();
    await registerReplyWorker(
      boss,
      {
        send: (mensagem) =>
          mensagem.replies[0] === 'falha'
            ? Promise.reject(new Error('Meta fora'))
            : Promise.resolve(),
      },
      deps.logger,
    );
    const resultados = (await handler(JOBS.outgoingReplies)([
      { id: 'a', data: saida(['falha']) },
      { id: 'b', data: saida(['ok']) },
    ])) as { id: string; status: string }[];
    expect(resultados.map((r) => [r.id, r.status])).toEqual([
      ['a', 'failed'],
      ['b', 'completed'],
    ]);
  });
});

describe('logSender', () => {
  it('não põe o texto das respostas no log', async () => {
    const logs: string[] = [];
    const logger = pino({ level: 'info' }, { write: (linha: string) => logs.push(linha) });
    await logSender(logger).send(saidaComTexto('meu.email@ufal.br'));
    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toContain('meu.email@ufal.br');
    expect(JSON.parse(logs[0] ?? '{}')).toMatchObject({ respostas: 1 });
  });
});

function saidaComTexto(texto: string): OutgoingReplies {
  return {
    phoneHmac: PHONE_HMAC,
    phoneCifrado: 'c',
    phoneNumberId: 'P',
    wamidHmac: 'w',
    replies: [texto],
  };
}
