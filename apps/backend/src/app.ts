import Fastify, { type FastifyInstance } from 'fastify';
import { webhookPlugin, type WebhookPluginOptions } from './bot/webhook/routes';

export type AppDeps = WebhookPluginOptions;

/**
 * Monta o servidor HTTP único do back-end. Hoje só tem o webhook do bot; a API
 * (partes 1 e 5) registra os plugins dela aqui.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: deps.logger }) as unknown as FastifyInstance;
  app.get('/health', () => ({ ok: true }));
  await app.register(webhookPlugin, deps);
  return app;
}
