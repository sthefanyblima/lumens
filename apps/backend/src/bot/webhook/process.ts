import { lt, processedMessages, type Db } from '@lumens/db';
import { z } from 'zod';
import { cifrar, hmacHex, type Chaves } from '../../cripto';
import type { Logger } from '../../logger';
import { JOBS, type JobQueue } from '../../queue';
import { hashPhone } from '../conversation/phone';

export interface ProcessDeps {
  db: Db;
  queue: JobQueue;
  logger: Logger;
  chaves: Chaves;
}

export interface ProcessResult {
  enqueued: number;
  duplicates: number;
  statusesIgnored: number;
  /** Partes fora do formato esperado: ignoradas com 200, porque reenviar não as conserta. */
  invalid: number;
}

/** A Meta reenvia um webhook por até 7 dias; o dedup guarda 1 dia de folga. */
export const DEDUP_TTL_MS = 8 * 24 * 60 * 60 * 1000;

/**
 * O jsonb do Postgres recusa \u0000 e surrogate UTF-16 solto. Um texto assim faria o enqueue
 * falhar sempre — 500 em todo reenvio da Meta, por dias.
 */
function paraJsonb(texto: string): string {
  return texto
    .replaceAll('\u0000', '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
}

const texto = z.string().transform(paraJsonb);

/**
 * O que vai para a fila, além dos identificadores. O `z.object` descarta campo desconhecido,
 * então o job leva só isto — sem o `context.from`, que é telefone de outra pessoa.
 */
const conteudoSchema = z.object({
  text: z.object({ body: texto }).optional(),
  image: z
    .object({
      id: z.string(),
      mime_type: z.string(),
      sha256: z.string(),
      caption: texto.optional(),
    })
    .optional(),
  interactive: z
    .object({
      type: z.string(),
      button_reply: z.object({ id: texto, title: texto }).optional(),
      list_reply: z.object({ id: texto, title: texto, description: texto.optional() }).optional(),
    })
    .optional(),
  button: z.object({ text: texto, payload: texto.optional() }).optional(),
  context: z
    .object({ forwarded: z.boolean().optional(), frequently_forwarded: z.boolean().optional() })
    .optional(),
});

const mensagemSchema = conteudoSchema.extend({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string(),
  type: z.string().min(1),
});

const envelopeSchema = z.object({ entry: z.array(z.unknown()) });
const entradaSchema = z.object({ changes: z.array(z.unknown()) });
const mudancaSchema = z.object({
  value: z.object({
    metadata: z.object({ phone_number_id: z.string().min(1) }),
    messages: z.array(z.unknown()).optional(),
    statuses: z.array(z.unknown()).optional(),
  }),
});
const statusSchema = z.object({ status: z.string() });

export type ConteudoMensagem = z.infer<typeof conteudoSchema>;

/**
 * Dados do job JOBS.incomingMessage consumidos pelo worker da conversa.
 *
 * Nada que identifique a pessoa vai em claro para a fila (RNF01): o pg-boss guarda o job por
 * até 14 dias. Telefone e wamid — o wamid da Meta codifica o telefone — vão como HMAC (para
 * achar a conversa e deduplicar) e cifrados (para o worker responder).
 */
export interface IncomingMessageJob {
  wamidHmac: string;
  wamidCifrado: string;
  /** Mesmo hash do `hashPhone`: a chave da conversa em conversation_state. */
  phoneHmac: string;
  phoneCifrado: string;
  phoneNumberId: string;
  type: string;
  timestamp: string;
  content: ConteudoMensagem;
}

/**
 * Processa um payload já autenticado: valida, deduplica por wamid e enfileira.
 *
 * Garantia: o INSERT do dedup e o job entram na MESMA transação. Se o enqueue falhar, ou o
 * processo cair no meio, nenhum dos dois fica — a rota responde 500 e a Meta reenvia. Um
 * wamid nunca fica "marcado como processado" sem job na fila.
 *
 * Parte fora do formato é ignorada (conta em `invalid`) em vez de virar erro: a Meta reenviaria
 * o mesmo payload por dias e o 500 nunca passaria.
 */
export async function processWebhookPayload(
  payload: unknown,
  deps: ProcessDeps,
): Promise<ProcessResult> {
  const result: ProcessResult = { enqueued: 0, duplicates: 0, statusesIgnored: 0, invalid: 0 };
  const invalida = (parte: string, erro: z.ZodError) => {
    // Só o caminho dos campos, nunca os valores: o payload tem telefone e texto da pessoa.
    const campos = erro.issues.map((problema) => problema.path.join('.'));
    deps.logger.warn({ parte, campos }, 'parte do webhook fora do formato, ignorada');
    result.invalid++;
  };

  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) {
    deps.logger.warn('payload do webhook sem entry, ignorado');
    return result;
  }

  for (const entradaBruta of envelope.data.entry) {
    const entrada = entradaSchema.safeParse(entradaBruta);
    if (!entrada.success) {
      invalida('entry', entrada.error);
      continue;
    }
    for (const mudancaBruta of entrada.data.changes) {
      const mudanca = mudancaSchema.safeParse(mudancaBruta);
      if (!mudanca.success) {
        invalida('change', mudanca.error);
        continue;
      }
      const { metadata, messages = [], statuses = [] } = mudanca.data.value;

      for (const statusBruto of statuses) {
        // Status (sent/delivered/read/failed): apenas log, nunca vai para a fila.
        const status = statusSchema.safeParse(statusBruto);
        deps.logger.info(
          { status: status.success ? status.data.status : null },
          'status recebido (ignorado)',
        );
        result.statusesIgnored++;
      }

      for (const mensagemBruta of messages) {
        const mensagem = mensagemSchema.safeParse(mensagemBruta);
        if (!mensagem.success) {
          invalida('message', mensagem.error);
          continue;
        }
        const nova = await enfileirar(mensagem.data, metadata.phone_number_id, deps);
        if (nova) result.enqueued++;
        else result.duplicates++;
      }
    }
  }
  return result;
}

async function enfileirar(
  mensagem: z.infer<typeof mensagemSchema>,
  phoneNumberId: string,
  deps: ProcessDeps,
): Promise<boolean> {
  const { id, from, timestamp, type, ...content } = mensagem;
  const { chaves } = deps;
  const wamidHmac = hmacHex(id, chaves.hmac);
  const job: IncomingMessageJob = {
    wamidHmac,
    wamidCifrado: cifrar(id, chaves.cifra),
    phoneHmac: hashPhone(from, chaves.hmac),
    phoneCifrado: cifrar(from, chaves.cifra),
    phoneNumberId,
    type,
    timestamp,
    content,
  };

  const nova = await deps.db.transaction(async (tx) => {
    const inserida = await tx
      .insert(processedMessages)
      .values({ wamidHmac })
      .onConflictDoNothing()
      .returning();
    if (inserida.length === 0) return false;
    await deps.queue.send(JOBS.incomingMessage, job, tx);
    return true;
  });

  // Prefixo do HMAC: dá para correlacionar os logs sem expor o wamid.
  deps.logger
    .child({ mensagem: wamidHmac.slice(0, 12) })
    .info({ type }, nova ? 'mensagem enfileirada' : 'mensagem duplicada, ignorando');
  return nova;
}

/** Apaga o dedup mais velho que a janela de reenvio da Meta; retorna quantos removeu. */
export async function deleteOldDedup(db: Db, now: Date = new Date()): Promise<number> {
  const rows = await db
    .delete(processedMessages)
    .where(lt(processedMessages.receivedAt, new Date(now.getTime() - DEDUP_TTL_MS)))
    .returning({ wamidHmac: processedMessages.wamidHmac });
  return rows.length;
}
