import type { Db } from '@lumens/db';
import type { FastifyPluginCallback } from 'fastify';
import type { Chaves } from '../../cripto';
import type { Logger } from '../../logger';
import type { JobQueue } from '../../queue';
import { verifySignature } from '../whatsapp/signature';
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
  chaves: Chaves;
}

/** Parâmetro repetido na query chega como lista; só vale o valor único. */
type Query = Record<string, string | string[] | undefined>;

/**
 * Rotas do webhook da Meta. Este plugin NÃO usa fastify-plugin de propósito: fica encapsulado,
 * então o parser de corpo bruto (Buffer) abaixo vale só aqui e o resto do app mantém o parser JSON.
 */
export const webhookPlugin: FastifyPluginCallback<WebhookPluginOptions> = (app, opts, done) => {
  const { config, logger } = opts;

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, parsed) => {
    parsed(null, body);
  });

  // Verificação do webhook (handshake da Meta).
  app.get<{ Querystring: Query }>('/webhook', (req, reply) => {
    const q = req.query;
    const challenge = q['hub.challenge'];
    if (
      q['hub.mode'] === 'subscribe' &&
      q['hub.verify_token'] === config.verifyToken &&
      !Array.isArray(challenge)
    ) {
      return reply
        .code(200)
        .type('text/plain')
        .send(challenge ?? '');
    }
    logger.warn('verificação do webhook recusada');
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

    // Decisão: fazemos dedup + enqueue ANTES de responder 200. É uma transação curta
    // (milissegundos), bem dentro do prazo da Meta. Responder antes e processar depois
    // arriscaria perder a mensagem num crash entre o 200 e o enqueue. Se a transação
    // falhar, nada fica gravado e respondemos 500 → a Meta reenvia.
    let result: ProcessResult;
    try {
      result = await processWebhookPayload(payload, opts);
    } catch (err) {
      logger.error({ err }, 'falha ao processar webhook');
      return reply.code(500).send();
    }
    logger.debug(result, 'webhook processado');
    return reply.code(200).send();
  });

  done();
};
