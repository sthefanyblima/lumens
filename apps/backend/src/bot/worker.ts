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
}

/** Job da fila de entrada como o worker o recebe (`includeMetadata` traz o `retryLimit`). */
export type JobDeEntrada = JobAttempt & { retryLimit: number; data: IncomingMessageJob };

/** O job não decifra ou não tem o formato esperado: tentar de novo não muda nada. */
export class MensagemIlegivelError extends Error {
  constructor(causa: unknown) {
    super('O conteúdo do job não pôde ser lido.', { cause: causa });
    this.name = 'MensagemIlegivelError';
  }
}

export const UNSUPPORTED_TEXT = 'Por enquanto eu só entendo mensagens de texto.';

/**
 * Configuração das filas do bot. `notify` acorda o worker na hora em que o job é criado (com o
 * `useListenNotify` do PgBoss); sem isso ele só vê o job no próximo polling.
 *
 * Processo caído é detectado pelo heartbeat: o worker renova os jobs que segura a cada 15 s, e um
 * job sem renovação há 30 s volta para a fila. O `expireInSeconds` fica só como teto para um
 * processo vivo mas travado. Ele conta desde a busca, para o lote inteiro: com 10 jobs em
 * sequência e até ~75 s por transação no pior caso (5 consultas × 15 s do `consultaMs`), um teto
 * de 60 s expirava o fim do lote sem ninguém ter caído.
 *
 * Falha passageira volta pelo retry do pg-boss, com backoff (~5, ~10, ~20 s). Numa fila
 * `key_strict_fifo` o job em `retry` continua sendo a cabeça da conversa, então as mensagens
 * seguintes do mesmo telefone esperam por ele.
 */
export const BOT_QUEUE_OPTIONS = {
  notify: true,
  heartbeatSeconds: 30,
  expireInSeconds: 15 * 60,
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
  // Com NOTIFY ativo o pg-boss só faz polling a cada 30 s. Mas o NOTIFY sai quando o job é
  // criado, e com a ordem por conversa a 2ª mensagem de uma rajada ainda está atrás da 1ª
  // nessa hora: sem polling curto, ela esperaria até 30 s depois que a 1ª terminasse.
  notifyPollingIntervalSeconds: 0.5,
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
  let conteudo: ConteudoMensagem;
  try {
    conteudo = conteudoDoJob(data, deps.chaves);
  } catch (erro) {
    throw new MensagemIlegivelError(erro);
  }
  const input = inputOf(conteudo);
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

type Boss = Pick<
  PgBoss,
  | 'getQueue'
  | 'createQueue'
  | 'updateQueue'
  | 'deleteQueue'
  | 'work'
  | 'schedule'
  | 'getBlockedKeys'
  | 'findJobs'
  | 'deleteJob'
>;

/**
 * Política da fila de entrada. `key_strict_fifo` com a chave = `phoneHmac` (veja o `chave` no
 * envio do webhook): o pg-boss só entrega a mensagem mais antiga de cada conversa, e só depois
 * que a anterior terminou, mesmo com várias instâncias do servidor. Uma em `retry` (expirou com
 * o processo caído) segura as seguintes, em vez de ser passada para trás. Ordenar o lote numa
 * instância só (o que havia antes) não impedia outra instância de pegar as mais novas.
 */
export const INCOMING_QUEUE_POLICY = 'key_strict_fifo' as const;

/**
 * Cria a fila com as opções do bot, ou atualiza uma criada antes com outras opções. A política
 * não muda depois de criada: uma fila antiga com outra política é recriada se estiver vazia; com
 * job pendente, o servidor não sobe (apagar a fila perderia mensagens).
 */
async function prepareQueue(
  boss: Boss,
  name: string,
  deadLetter: string,
  policy: 'standard' | typeof INCOMING_QUEUE_POLICY = 'standard',
): Promise<void> {
  // A fila de mortas precisa existir antes da fila que aponta para ela.
  if (!(await boss.getQueue(deadLetter))) await boss.createQueue(deadLetter);
  const options = { ...BOT_QUEUE_OPTIONS, deadLetter };
  const atual = await boss.getQueue(name);
  if (atual && (atual.policy ?? 'standard') !== policy) {
    if (atual.queuedCount + atual.activeCount > 0) {
      throw new Error(
        `A fila ${name} tem a política ${String(atual.policy)} e jobs pendentes; esvazie-a antes de subir esta versão.`,
      );
    }
    await boss.deleteQueue(name);
  } else if (atual) {
    await boss.updateQueue(name, options);
    return;
  }
  await boss.createQueue(name, policy === 'standard' ? options : { ...options, policy });
}

/**
 * Prefixo do HMAC para correlacionar os logs. Não confia no formato do job: um job antigo ou
 * malformado não pode fazer o log lançar, ou o handler cai e o pg-boss falha o lote inteiro.
 */
function conversaDoLog(data: unknown): string | null {
  const phoneHmac = (data as { phoneHmac?: unknown } | null | undefined)?.phoneHmac;
  return typeof phoneHmac === 'string' ? phoneHmac.slice(0, 12) : null;
}

/** Erro que se repete em qualquer tentativa: bug do handler ou job que não dá para ler. */
const erroPermanente = (erro: unknown) =>
  erro instanceof InvalidTransitionError || erro instanceof MensagemIlegivelError;

/**
 * Aplica uma mensagem. Falha passageira (banco fora, timeout) volta para o retry do pg-boss, que
 * segura a conversa até ela passar (veja BOT_QUEUE_OPTIONS). Erro permanente, ou a última
 * tentativa, tira a mensagem da frente para a conversa seguir.
 */
async function processarMensagem(job: JobDeEntrada, deps: WorkerDeps): Promise<JobResult> {
  try {
    await processIncomingJob(job, deps);
    return { id: job.id, status: 'completed' };
  } catch (erro) {
    const log = deps.logger.child({ conversa: conversaDoLog(job.data) });
    if (erro instanceof StaleJobError) {
      // Outra tentativa é dona do job agora e vai aplicá-lo; o resultado desta não vale mais.
      log.warn('job expirou durante o processamento; fica para a tentativa nova');
      return { id: job.id, status: 'failed', output: resumoDoErro(erro) };
    }
    if (erroPermanente(erro) || job.retryCount >= job.retryLimit) {
      log.error({ erro: resumoDoErro(erro) }, 'mensagem descartada para a fila de mortas');
      return descartar(job, erro, deps);
    }
    log.warn(
      { erro: resumoDoErro(erro), tentativa: job.retryCount + 1 },
      'mensagem falhou; volta pelo retry do pg-boss',
    );
    return { id: job.id, status: 'failed', output: resumoDoErro(erro) };
  }
}

/**
 * Tira a mensagem da frente da conversa: copia o job para a fila de mortas e o conclui, numa
 * transação. Não usa o `deadletter` do pg-boss porque, numa fila `key_strict_fifo`, um job
 * falhado segura a conversa inteira até alguém resolvê-lo — a pessoa ficaria sem resposta.
 */
async function descartar(
  job: JobAttempt & { data: unknown },
  erro: unknown,
  deps: WorkerDeps,
): Promise<JobResult> {
  try {
    await deps.db.transaction(async (tx) => {
      await deps.queue.send(
        JOBS.incomingMessageDead,
        { job: job.data, erro: resumoDoErro(erro) },
        tx,
      );
      await deps.queue.complete(JOBS.incomingMessage, job, tx);
    });
    return { id: job.id, status: 'completed', output: { descartada: true } };
  } catch (falha) {
    // Sem como mover agora (banco fora): falha comum. Com tentativa sobrando, o pg-boss traz o
    // job de novo e o descarte é refeito; sem, o pg-boss o copia para a fila de mortas e o
    // desbloquearConversas o tira da frente.
    deps.logger
      .child({ conversa: conversaDoLog(job.data) })
      .error({ erro: resumoDoErro(falha) }, 'não deu para mover a mensagem para a fila de mortas');
    return { id: job.id, status: 'failed', output: resumoDoErro(erro) };
  }
}

/** Cria (ou atualiza) a fila de entrada, com ordem por conversa, e a de mortas dela. */
export async function prepararFilaDeEntrada(boss: Boss): Promise<void> {
  await prepareQueue(boss, JOBS.incomingMessage, JOBS.incomingMessageDead, INCOMING_QUEUE_POLICY);
}

/** A cada minuto: o pior caso de uma conversa travada (veja `desbloquearConversas`). */
export const UNBLOCK_CRON = '* * * * *';

/**
 * Remove da frente das conversas os jobs que o próprio pg-boss deixou falhados: os que expiraram
 * mais vezes que o `retryLimit` (processo caindo sempre na mesma mensagem). Numa fila
 * `key_strict_fifo` eles seguram a conversa para sempre. O conteúdo já foi copiado para a fila de
 * mortas pelo pg-boss (a fila tem `deadLetter`), então apagar daqui não perde nada.
 *
 * @returns quantos jobs foram removidos.
 */
export async function desbloquearConversas(
  boss: Pick<PgBoss, 'getBlockedKeys' | 'findJobs' | 'deleteJob'>,
  logger: Logger,
): Promise<number> {
  let removidos = 0;
  for (const chave of await boss.getBlockedKeys(JOBS.incomingMessage)) {
    const falhados = (await boss.findJobs(JOBS.incomingMessage, { key: chave })).filter(
      (job) => job.state === 'failed',
    );
    if (falhados.length === 0) continue;
    await boss.deleteJob(
      JOBS.incomingMessage,
      falhados.map((job) => job.id),
    );
    removidos += falhados.length;
    logger
      .child({ conversa: chave.slice(0, 12) })
      .warn({ jobs: falhados.length }, 'conversa destravada: job falhado tirado da frente');
  }
  return removidos;
}

export async function registerIncomingWorker(boss: Boss, deps: WorkerDeps): Promise<void> {
  await prepararFilaDeEntrada(boss);
  if (!(await boss.getQueue(JOBS.unblockConversations))) {
    await boss.createQueue(JOBS.unblockConversations);
  }
  await boss.schedule(JOBS.unblockConversations, UNBLOCK_CRON);
  await boss.work(JOBS.unblockConversations, () => desbloquearConversas(boss, deps.logger));
  await boss.work<IncomingMessageJob, unknown, typeof BOT_WORK_OPTIONS>(
    JOBS.incomingMessage,
    BOT_WORK_OPTIONS,
    async (jobs) => {
      const results: JobResult[] = [];
      for (const job of emOrdemDeChegada(jobs)) results.push(await processarMensagem(job, deps));
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
