import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { SLUG_MAX } from '@lumens/contratos';
import { apiPlugin, type ApiPluginOptions } from './api';
import { webhookPlugin, type WebhookPluginOptions } from './bot/webhook/routes';

export type AppDeps = WebhookPluginOptions & {
  /** API de leitura pública: conexão só de leitura (`lumens_site`) e origens do CORS. */
  leitura: ApiPluginOptions;
};

/**
 * O log padrão do Fastify traz a URL inteira de cada requisição — e a query do handshake
 * da Meta carrega o META_VERIFY_TOKEN. Aqui só vai o caminho.
 */
function serializarRequisicao(req: FastifyRequest) {
  return { method: req.method, url: req.url.split('?')[0], remoteAddress: req.ip };
}

/**
 * Monta o servidor HTTP único do back-end: o webhook do bot e a API de leitura pública.
 * A API da curadoria (parte 5) entra aqui também.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // O padrão (100) é menor que o slug mais longo do contrato: um slug válido de 101 a 120
    // caracteres cairia no 404 genérico do Fastify, sem passar pela validação da API.
    routerOptions: { maxParamLength: SLUG_MAX * 2 },
    loggerInstance: deps.logger,
    childLoggerFactory: (logger, bindings, opts) =>
      logger.child(bindings, {
        ...opts,
        serializers: { ...opts.serializers, req: serializarRequisicao },
      }),
  }) as unknown as FastifyInstance;
  app.get('/health', () => ({ ok: true }));
  const { leitura, ...webhook } = deps;
  await app.register(webhookPlugin, webhook);
  await app.register(apiPlugin, leitura);
  return app;
}
