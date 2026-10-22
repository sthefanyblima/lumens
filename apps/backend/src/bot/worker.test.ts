import type { Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { JOBS } from '../queue';
import { FakeQueue, jobsConcluidos, prepararFilaFalsa, respostasNaFila } from '../queue.fake';
import { GREETING_TEXT, MENU_TEXT } from './conversation/handlers';
import { ConversationStore } from './conversation/store';
import type { ConteudoMensagem, IncomingMessageJob } from './webhook/process';
import {
  BOT_QUEUE_OPTIONS,
  BOT_WORK_OPTIONS,
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
  deps = { db, store: new ConversationStore(db), queue };
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
  it('cria a fila com notify e expiração curta, e busca em lotes com rajada', async () => {
    const { boss, chamadas } = bossFalso();
    await registerIncomingWorker(boss, deps);

    expect(chamadas).toEqual([
      ['createQueue', JOBS.incomingMessage, BOT_QUEUE_OPTIONS],
      ['work', JOBS.incomingMessage, BOT_WORK_OPTIONS],
    ]);
    expect(BOT_QUEUE_OPTIONS).toMatchObject({ notify: true, expireInSeconds: 60 });
    expect(BOT_WORK_OPTIONS.batchSize).toBeGreaterThan(1);
    expect(BOT_WORK_OPTIONS.burstWhenBatchFull).toBe(true);
    expect(BOT_WORK_OPTIONS.pollingIntervalSeconds).toBeLessThanOrEqual(0.5);
  });

  it('fila criada antes com as opções padrão é atualizada', async () => {
    const { boss, chamadas } = bossFalso([JOBS.incomingMessage]);
    await registerIncomingWorker(boss, deps);
    expect(chamadas[0]).toEqual(['updateQueue', JOBS.incomingMessage, BOT_QUEUE_OPTIONS]);
  });

  it('processa o lote em ordem de chegada', async () => {
    const { boss, handler } = bossFalso();
    await registerIncomingWorker(boss, deps);

    await handler(JOBS.incomingMessage)([texto('oi'), texto('2'), texto('Bebedouro')]);
    expect(await passo()).toBe('NEW_ASK_PLACE');
    expect(await jobsConcluidos(db)).toHaveLength(3);
  });
});

describe('registerReplyWorker', () => {
  it('entrega cada lote de respostas pelo sender', async () => {
    const { boss, chamadas, handler } = bossFalso();
    const entregues: OutgoingReplies[] = [];
    await registerReplyWorker(boss, {
      send: (mensagem) => {
        entregues.push(mensagem);
        return Promise.resolve();
      },
    });
    expect(chamadas[0]).toEqual(['createQueue', JOBS.outgoingReplies, BOT_QUEUE_OPTIONS]);

    const saida: OutgoingReplies = {
      phoneHmac: PHONE_HMAC,
      phoneCifrado: 'c',
      phoneNumberId: 'PNID',
      wamidHmac: 'w',
      replies: ['oi'],
    };
    await handler(JOBS.outgoingReplies)([{ id: 'j', data: saida }]);
    expect(entregues).toEqual([saida]);
  });
});
