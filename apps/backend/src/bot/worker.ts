import type { Db } from '@lumens/db';
import type { JobResult, PgBoss, Queue } from 'pg-boss';
import { cifrar, decifrar, type Chaves } from '../cripto';
import { resumoDoErro, type Logger } from '../logger';
import { JOBS, StaleJobError, type JobAttempt, type JobQueue } from '../queue';
import type { HandlerRegistry, IncomingMessage } from './conversation/handlers';
import { handleIncoming } from './conversation/router';
import { InvalidTransitionError } from './conversation/steps';
import type { ConversationStore } from './conversation/store';
import { conteudoDoJob, type ConteudoMensagem, type IncomingMessageJob } from './webhook/process';

/** Respostas a entregar para uma conversa (fila JOBS.outgoingReplies). */
export interface OutgoingReplies {
  /** Correlação nos logs e chave da conversa; o telefone em si vai cifrado. */
  phoneHmac: string;
  phoneCifrado: string;
  phoneNumberId: string;
  /** O wamid da mensagem respondida, para correlacionar. */
  wamidHmac: string;
  /**
   * As respostas (`string[]` em JSON), cifradas com a CHAVE_CIFRA: uma resposta pode repetir o
   * que a pessoa escreveu. Leia com `respostasDoJob`.
   */
  repliesCifradas: string;
}

export function respostasDoJob(message: OutgoingReplies, chaves: Chaves): string[] {
  return JSON.parse(decifrar(message.repliesCifradas, chaves.cifra)) as string[];
}

/** Quem entrega as respostas ao usuário. */
export interface ReplySender {
  send(message: OutgoingReplies): Promise<void>;
}

export interface WorkerDeps {
  db: Db;
  store: ConversationStore;
  queue: JobQueue;
  logger: Logger;
  chaves: Chaves;
  handlers?: HandlerRegistry;
  /** Espera antes de cada nova tentativa de uma mensagem que falhou (veja INCOMING_RETRY_DELAYS_MS). */
  retryDelaysMs?: readonly number[];
}

/**
 * Uma mensagem que falha é tentada de novo ali mesmo, antes da próxima, e não devolvida para o
 * retry do pg-boss: lá ela voltaria depois, com mensagens mais novas do mesmo telefone já
 * aplicadas na frente dela. Esgotadas as tentativas, vai para a fila de mortas e a conversa segue.
 */
export const INCOMING_RETRY_DELAYS_MS = [250, 1000] as const;

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
 *
 * `perJobResults`: cada job do lote é concluído ou falha sozinho. Sem isso, um erro em um job
 * fazia o pg-boss falhar o lote inteiro, e os outros nove gastavam tentativa junto com ele.
 * `includeMetadata`: traz o `createdOn`. O pg-boss escolhe o lote pelos mais antigos, mas o
 * devolve em ordem qualquer; o worker reordena (veja `emOrdemDeChegada`).
 *
 * Sem `groupConcurrency`: o pg-boss escolhe o job de cada grupo pelo id (UUID aleatório), não
 * pela data, e trocaria a ordem das mensagens do mesmo telefone.
 */
export const BOT_WORK_OPTIONS = {
  batchSize: 10,
  burstWhenBatchFull: true,
  pollingIntervalSeconds: 0.5,
  perJobResults: true,
  includeMetadata: true,
} as const;

/** Ordena o lote pela criação do job, que é a ordem em que o webhook recebeu as mensagens. */
export function emOrdemDeChegada<T extends { createdOn: Date }>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => a.createdOn.getTime() - b.createdOn.getTime());
}

/**
 * O que a conversa entende da mensagem. Respostas de botão e de lista valem pelo id (é o que o
 * bot vai definir ao montar os botões). Imagem vai com texto vazio: a legenda não é resposta a
 * pergunta nenhuma. Áudio, vídeo, documento e o resto ainda não são entendidos (null).
 */
export function inputOf(content: ConteudoMensagem): IncomingMessage | null {
  if (content.text) return { text: content.text.body };
  const reply = content.interactive?.button_reply ?? content.interactive?.list_reply;
  if (reply) return { text: reply.id };
  if (content.button) return { text: content.button.payload ?? content.button.text };
  if (content.image) {
    return { text: '', image: { id: content.image.id, mimeType: content.image.mime_type } };
  }
  return null;
}

/**
 * Roda uma mensagem da fila pela conversa. Tudo numa transação só: o novo estado da conversa,
 * o job com as respostas (outbox — o envio só existe se a conversa andou) e a conclusão do
 * próprio job. Se o processo cair antes do commit, nada aconteceu e o pg-boss reentrega; depois
 * do commit, o job já está concluído e não volta. A mensagem é aplicada exatamente uma vez.
 */
export async function processIncomingJob(
  job: JobAttempt & { data: IncomingMessageJob },
  deps: WorkerDeps,
): Promise<string[]> {
  const { data } = job;
  const input = inputOf(conteudoDoJob(data, deps.chaves));
  return deps.db.transaction(async (tx) => {
    const replies =
      input === null
        ? [UNSUPPORTED_TEXT]
        : await handleIncoming(
            { phoneHmac: data.phoneHmac, ...input },
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
      repliesCifradas: cifrar(JSON.stringify(replies), deps.chaves.cifra),
    };
    await deps.queue.send(JOBS.outgoingReplies, outgoing, tx);
    await deps.queue.complete(JOBS.incomingMessage, job, tx);
    return replies;
  });
}

type Boss = Pick<PgBoss, 'getQueue' | 'createQueue' | 'updateQueue' | 'work'>;

/** Cria a fila com as opções do bot, ou atualiza uma criada antes com outras opções. */
async function prepareQueue(boss: Boss, name: string, deadLetter: string): Promise<void> {
  // A fila de mortas precisa existir antes da fila que aponta para ela.
  if (!(await boss.getQueue(deadLetter))) await boss.createQueue(deadLetter);
  const options = { ...BOT_QUEUE_OPTIONS, deadLetter };
  if (await boss.getQueue(name)) await boss.updateQueue(name, options);
  else await boss.createQueue(name, options);
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Prefixo do HMAC para correlacionar os logs. Não confia no formato do job: um job antigo ou
 * malformado não pode fazer o log lançar, ou o handler cai e o pg-boss falha o lote inteiro.
 */
function conversaDoLog(data: unknown): string | null {
  const phoneHmac = (data as { phoneHmac?: unknown } | null | undefined)?.phoneHmac;
  return typeof phoneHmac === 'string' ? phoneHmac.slice(0, 12) : null;
}

/**
 * Roda a mensagem até dar certo, tentando de novo depois de cada espera de `retryDelaysMs`.
 * Transição inválida é bug do handler, não falha passageira: não adianta tentar de novo.
 */
async function processWithRetries(
  job: JobAttempt & { data: IncomingMessageJob },
  deps: WorkerDeps,
): Promise<JobResult> {
  const delays = deps.retryDelaysMs ?? INCOMING_RETRY_DELAYS_MS;
  for (let tentativa = 0; ; tentativa++) {
    try {
      await processIncomingJob(job, deps);
      return { id: job.id, status: 'completed' };
    } catch (erro) {
      const delay = delays[tentativa];
      const log = deps.logger.child({ conversa: conversaDoLog(job.data) });
      if (erro instanceof StaleJobError) {
        // Outra tentativa é dona do job agora e vai aplicá-lo; o resultado desta não vale mais.
        log.warn('job expirou durante o processamento; fica para a tentativa nova');
        return { id: job.id, status: 'failed', output: resumoDoErro(erro) };
      }
      if (delay === undefined || erro instanceof InvalidTransitionError) {
        log.error({ erro: resumoDoErro(erro) }, 'mensagem descartada para a fila de mortas');
        return { id: job.id, status: 'deadletter', output: resumoDoErro(erro) };
      }
      log.warn({ erro: resumoDoErro(erro), tentativa: tentativa + 1 }, 'mensagem falhou');
      await esperar(delay);
    }
  }
}

/**
 * Consome JOBS.incomingMessage, em ordem de chegada, um job por transação. Em sequência, e cada
 * job resolvido (aplicado ou descartado) antes do próximo: mensagens do mesmo telefone precisam
 * ser aplicadas na ordem. A exceção é um job que expira com o processo caído: ele volta pelo
 * retry do pg-boss, depois das mensagens que chegaram enquanto isso.
 */
export async function registerIncomingWorker(boss: Boss, deps: WorkerDeps): Promise<void> {
  await prepareQueue(boss, JOBS.incomingMessage, JOBS.incomingMessageDead);
  await boss.work<IncomingMessageJob, unknown, typeof BOT_WORK_OPTIONS>(
    JOBS.incomingMessage,
    BOT_WORK_OPTIONS,
    async (jobs) => {
      const results: JobResult[] = [];
      for (const job of emOrdemDeChegada(jobs)) results.push(await processWithRetries(job, deps));
      return results;
    },
  );
}

/**
 * Consome JOBS.outgoingReplies. Entrega pelo menos uma vez: se o processo cair entre o envio e
 * a conclusão, a resposta sai de novo — melhor que a pessoa ficar sem resposta. Um envio que
 * falha volta pelo retry do pg-boss sem levar junto os outros do lote.
 */
export async function registerReplyWorker(
  boss: Boss,
  sender: ReplySender,
  logger: Logger,
): Promise<void> {
  await prepareQueue(boss, JOBS.outgoingReplies, JOBS.outgoingRepliesDead);
  await boss.work<OutgoingReplies, unknown, typeof BOT_WORK_OPTIONS>(
    JOBS.outgoingReplies,
    BOT_WORK_OPTIONS,
    async (jobs) => {
      const results: JobResult[] = [];
      for (const job of emOrdemDeChegada(jobs)) {
        try {
          await sender.send(job.data);
          results.push({ id: job.id, status: 'completed' });
        } catch (erro) {
          logger
            .child({ conversa: conversaDoLog(job.data) })
            .warn({ erro: resumoDoErro(erro) }, 'envio das respostas falhou');
          results.push({ id: job.id, status: 'failed', output: resumoDoErro(erro) });
        }
      }
      return results;
    },
  );
}

/**
 * Sender provisório: só registra que houve resposta. O envio pela API da Meta ainda não existe;
 * até lá é assim que se vê a conversa andando (`pnpm dev` + `pnpm sim`).
 *
 * O texto das respostas só entra com `mostrarTexto`, que o main liga apenas com `--dev` (o
 * script `dev`; o `start` de produção não passa a flag). Fora disso, não: uma resposta pode
 * repetir o que a pessoa escreveu, e o log de produção não guarda dado pessoal.
 */
export function logSender(
  logger: Logger,
  chaves: Chaves,
  opcoes: { mostrarTexto: boolean } = { mostrarTexto: false },
): ReplySender {
  return {
    send: (message) => {
      const replies = respostasDoJob(message, chaves);
      logger.info(
        {
          conversa: conversaDoLog(message),
          respostas: replies.length,
          caracteres: replies.reduce((total, r) => total + r.length, 0),
          // Só no `pnpm dev`: é o que deixa testar a conversa pelo simulador sem celular.
          ...(opcoes.mostrarTexto ? { texto: replies } : {}),
        },
        'respostas do bot (envio pela Meta ainda não implementado)',
      );
      return Promise.resolve();
    },
  };
}
