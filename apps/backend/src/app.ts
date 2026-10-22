import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { webhookPlugin, type WebhookPluginOptions } from './bot/webhook/routes';

export type AppDeps = WebhookPluginOptions;

/**
 * O log padrão do Fastify traz a URL inteira de cada requisição — e a query do handshake
 * da Meta carrega o META_VERIFY_TOKEN. Aqui só vai o caminho.
 */
function serializarRequisicao(req: FastifyRequest) {
  return { method: req.method, url: req.url.split('?')[0], remoteAddress: req.ip };
}

/**
 * Monta o servidor HTTP único do back-end. Hoje só tem o webhook do bot; a API
 * (partes 1 e 5) registra os plugins dela aqui.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: deps.logger,
    childLoggerFactory: (logger, bindings, opts) =>
      logger.child(bindings, {
        ...opts,
        serializers: { ...opts.serializers, req: serializarRequisicao },
      }),
  }) as unknown as FastifyInstance;
  app.get('/health', () => ({ ok: true }));
  await app.register(webhookPlugin, deps);
  return app;
}
