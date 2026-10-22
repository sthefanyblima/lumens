import type { Db } from '@lumens/db';
import type { FastifyPluginCallback } from 'fastify';
import type { Logger } from '../../logger';
import type { JobQueue } from '../../queue';
import { verifySignature } from '../whatsapp/signature';
import { isWebhookPayload } from '../whatsapp/types';
import { processWebhookPayload, type ProcessResult } from './process';

/** O que o webhook precisa do ambiente (META_VERIFY_TOKEN e META_APP_SECRET). */
export interface WebhookConfig {
  verifyToken: string;
  appSecret: string;
}

export interface WebhookPluginOptions {
  config: WebhookConfig;
  db: Db;
  queue: JobQueue;
  logger: Logger;
}

/**
 * Rotas do webhook da Meta. Este plugin NÃO usa fastify-plugin de propósito: fica encapsulado,
 * então o parser de corpo bruto (Buffer) abaixo vale só aqui e o resto do app mantém o parser JSON.
 */
export const webhookPlugin: FastifyPluginCallback<WebhookPluginOptions> = (app, opts, done) => {
  const { config, db, queue, logger } = opts;

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, parsed) => {
    parsed(null, body);
  });

  // Verificação do webhook (handshake da Meta).
  app.get<{ Querystring: Record<string, string | undefined> }>('/webhook', (req, reply) => {
    const q = req.query;
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === config.verifyToken) {
      return reply
        .code(200)
        .type('text/plain')
        .send(q['hub.challenge'] ?? '');
    }
    logger.warn({ mode: q['hub.mode'] }, 'verificação do webhook recusada');
    return reply.code(403).send();
  });

  app.post('/webhook', async (req, reply) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const sig = req.headers['x-hub-signature-256'];
    if (!verifySignature(raw, typeof sig === 'string' ? sig : undefined, config.appSecret)) {
      logger.warn({ hasSignature: Boolean(sig) }, 'assinatura do webhook inválida');
      return reply.code(401).send();
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      logger.warn('corpo do webhook não é JSON válido');
      return reply.code(400).send();
    }
    if (!isWebhookPayload(payload)) {
      // Assinado pela Meta, mas sem `entry`: não há o que processar. 200 para a Meta não reenviar.
      logger.warn('payload do webhook sem entry, ignorado');
      return reply.code(200).send();
    }

    // Decisão: fazemos dedup + enqueue ANTES de responder 200. São só um INSERT e um
    // send no pg-boss (milissegundos), bem dentro do prazo da Meta. Responder antes e
    // processar depois arriscaria perder a mensagem num crash entre o 200 e o enqueue.
    // Se o enqueue falhar, process.ts remove a linha de dedup e respondemos 500 → Meta reenvia.
    let result: ProcessResult;
    try {
      result = await processWebhookPayload(payload, { db, queue, logger });
    } catch (err) {
      logger.error({ err }, 'falha ao processar webhook');
      return reply.code(500).send();
    }
    logger.debug(result, 'webhook processado');
    return reply.code(200).send();
  });

  done();
};
