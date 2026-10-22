import type { Db } from '@lumens/db';
import type { PgBoss, Queue } from 'pg-boss';
import type { Logger } from '../logger';
import { JOBS, type JobQueue } from '../queue';
import type { HandlerRegistry } from './conversation/handlers';
import { handleIncoming } from './conversation/router';
import type { ConversationStore } from './conversation/store';
import type { IncomingMessageJob } from './webhook/process';

/** Respostas a entregar para uma conversa (fila JOBS.outgoingReplies). */
export interface OutgoingReplies {
  /** Correlação nos logs e chave da conversa; o telefone em si vai cifrado. */
  phoneHmac: string;
  phoneCifrado: string;
  phoneNumberId: string;
  /** O wamid da mensagem respondida, para correlacionar. */
  wamidHmac: string;
  replies: string[];
}

/** Quem entrega as respostas ao usuário. */
export interface ReplySender {
  send(message: OutgoingReplies): Promise<void>;
}

export interface WorkerDeps {
  db: Db;
  store: ConversationStore;
  queue: JobQueue;
  handlers?: HandlerRegistry;
}

export const UNSUPPORTED_TEXT = 'Por enquanto eu só entendo mensagens de texto.';

/**
 * Configuração das filas do bot. `notify` acorda o worker na hora em que o job é criado (com o
 * `useListenNotify` do PgBoss); sem isso ele só vê o job no próximo polling. `expireInSeconds`
 * curto: um job que ficou 'active' porque o processo caiu volta para a fila em 1 minuto, não
 * nos 15 do padrão — o processamento de uma mensagem leva milissegundos.
 */
export const BOT_QUEUE_OPTIONS = {
  notify: true,
  expireInSeconds: 60,
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
} as const satisfies Omit<Queue, 'name'>;

/**
 * Lotes de até 10 e, enquanto vierem cheios, busca o próximo sem esperar (rajada). O polling de
 * 0,5 s só vale quando o NOTIFY não está disponível.
 */
export const BOT_WORK_OPTIONS = {
  batchSize: 10,
  burstWhenBatchFull: true,
  pollingIntervalSeconds: 0.5,
} as const;

/**
 * O texto que a conversa entende. Respostas de botão e de lista valem pelo id (é o que o
 * bot vai definir ao montar os botões); imagem, áudio e o resto ainda não têm texto.
 */
export function textOf(job: IncomingMessageJob): string | null {
  const { content } = job;
  if (content.text) return content.text.body;
  const reply = content.interactive?.button_reply ?? content.interactive?.list_reply;
  if (reply) return reply.id;
  if (content.button) return content.button.payload ?? content.button.text;
  return null;
}

/**
 * Roda uma mensagem da fila pela conversa. Tudo numa transação só: o novo estado da conversa,
 * o job com as respostas (outbox — o envio só existe se a conversa andou) e a conclusão do
 * próprio job. Se o processo cair antes do commit, nada aconteceu e o pg-boss reentrega; depois
 * do commit, o job já está concluído e não volta. A mensagem é aplicada exatamente uma vez.
 */
export async function processIncomingJob(
  job: { id: string; data: IncomingMessageJob },
  deps: WorkerDeps,
): Promise<string[]> {
  const { data } = job;
  const text = textOf(data);
  return deps.db.transaction(async (tx) => {
    const replies =
      text === null
        ? [UNSUPPORTED_TEXT]
        : await handleIncoming(
            { phoneHmac: data.phoneHmac, text },
            {
              store: deps.store.withDb(tx),
              ...(deps.handlers ? { handlers: deps.handlers } : {}),
            },
          );
    const outgoing: OutgoingReplies = {
      phoneHmac: data.phoneHmac,
      phoneCifrado: data.phoneCifrado,
      phoneNumberId: data.phoneNumberId,
      wamidHmac: data.wamidHmac,
      replies,
    };
    await deps.queue.send(JOBS.outgoingReplies, outgoing, tx);
    await deps.queue.complete(JOBS.incomingMessage, job.id, tx);
    return replies;
  });
}

type Boss = Pick<PgBoss, 'getQueue' | 'createQueue' | 'updateQueue' | 'work'>;

/** Cria a fila com as opções do bot, ou atualiza uma criada antes com outras opções. */
async function prepareQueue(boss: Boss, name: string): Promise<void> {
  if (await boss.getQueue(name)) await boss.updateQueue(name, BOT_QUEUE_OPTIONS);
  else await boss.createQueue(name, BOT_QUEUE_OPTIONS);
}

/** Consome JOBS.incomingMessage, em ordem de chegada, um job por transação. */
export async function registerIncomingWorker(boss: Boss, deps: WorkerDeps): Promise<void> {
  await prepareQueue(boss, JOBS.incomingMessage);
  await boss.work<IncomingMessageJob>(JOBS.incomingMessage, BOT_WORK_OPTIONS, async (jobs) => {
    // Em sequência: mensagens do mesmo telefone precisam ser aplicadas na ordem.
    for (const job of jobs) await processIncomingJob(job, deps);
  });
}

/**
 * Consome JOBS.outgoingReplies. Entrega pelo menos uma vez: se o processo cair entre o envio e
 * a conclusão, a resposta sai de novo — melhor que a pessoa ficar sem resposta.
 */
export async function registerReplyWorker(boss: Boss, sender: ReplySender): Promise<void> {
  await prepareQueue(boss, JOBS.outgoingReplies);
  await boss.work<OutgoingReplies>(JOBS.outgoingReplies, BOT_WORK_OPTIONS, async (jobs) => {
    for (const job of jobs) await sender.send(job.data);
  });
}

/**
 * Sender provisório: só registra as respostas no log. O envio pela API da Meta ainda não
 * existe; até lá é assim que se vê a conversa andando (`pnpm dev` + `pnpm sim`).
 */
export function logSender(logger: Logger): ReplySender {
  return {
    send: (message) => {
      logger.info(
        { conversa: message.phoneHmac.slice(0, 12), replies: message.replies },
        'respostas do bot (envio pela Meta ainda não implementado)',
      );
      return Promise.resolve();
    },
  };
}
