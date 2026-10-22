import { eq, processedMessages, type Db } from '@lumens/db';
import type { Logger } from '../../logger';
import { JOBS, type JobQueue } from '../../queue';
import type { MetaMessage, MetaWebhookPayload } from '../whatsapp/types';

export interface ProcessDeps {
  db: Db;
  queue: JobQueue;
  logger: Logger;
}

export interface ProcessResult {
  enqueued: number;
  duplicates: number;
  statusesIgnored: number;
}

/** Dados do job JOBS.incomingMessage consumidos pelo worker da conversa. */
export interface IncomingMessageJob {
  wamid: string;
  from: string;
  type: MetaMessage['type'];
  message: MetaMessage;
  contactName: string | null;
  phoneNumberId: string;
}

/**
 * Processa um payload já autenticado: dedup por wamid + enfileiramento.
 *
 * Garantia: se o enqueue falhar depois do insert de dedup, removemos a linha de dedup
 * e relançamos o erro — a rota responde 500 e a Meta reenvia. Assim um crash/falha
 * nunca deixa um wamid "marcado como processado" sem job na fila.
 * (Mensagens anteriores do mesmo payload já enfileiradas serão tratadas como duplicadas no retry.)
 */
export async function processWebhookPayload(
  payload: MetaWebhookPayload,
  deps: ProcessDeps,
): Promise<ProcessResult> {
  const result: ProcessResult = { enqueued: 0, duplicates: 0, statusesIgnored: 0 };

  for (const entry of payload.entry) {
    for (const { value } of entry.changes) {
      for (const st of value.statuses ?? []) {
        // Status (sent/delivered/read/failed): apenas log, nunca vai para a fila.
        deps.logger.info({ wamid: st.id, status: st.status }, 'status recebido (ignorado)');
        result.statusesIgnored++;
      }

      for (const msg of value.messages ?? []) {
        const log = deps.logger.child({ wamid: msg.id });

        const inserted = await deps.db
          .insert(processedMessages)
          .values({ wamid: msg.id })
          .onConflictDoNothing()
          .returning();
        if (inserted.length === 0) {
          log.info('mensagem duplicada, ignorando');
          result.duplicates++;
          continue;
        }

        const contact = value.contacts?.find((c) => c.wa_id === msg.from) ?? value.contacts?.[0];
        const job: IncomingMessageJob = {
          wamid: msg.id,
          from: msg.from,
          type: msg.type,
          message: msg,
          contactName: contact?.profile.name ?? null,
          phoneNumberId: value.metadata.phone_number_id,
        };

        try {
          await deps.queue.send(JOBS.incomingMessage, job);
        } catch (err) {
          log.error({ err }, 'falha ao enfileirar; removendo dedup para permitir retry da Meta');
          await deps.db.delete(processedMessages).where(eq(processedMessages.wamid, msg.id));
          throw err;
        }
        log.info({ type: msg.type }, 'mensagem enfileirada');
        result.enqueued++;
      }
    }
  }
  return result;
}
