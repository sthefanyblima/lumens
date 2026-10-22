import { carregarEnv } from './config/env';

/**
 * Entrada executável do back-end (`pnpm --filter @lumens/backend dev`).
 *
 * Hoje só valida o ambiente e encerra — o servidor Fastify entra numa task
 * futura. Serve para provar que ambiente incompleto derruba a inicialização
 * com uma mensagem que diz o que falta.
 */
try {
  const env = carregarEnv();
  console.log(`Ambiente validado. Banco: ${new URL(env.DATABASE_URL).host}`);
} catch (erro) {
  // Mensagem limpa: quem está configurando a máquina não precisa do stack trace.
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
}
