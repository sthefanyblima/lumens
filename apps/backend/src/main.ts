import { criarDb } from '@lumens/db';
import { PgBoss } from 'pg-boss';
import { registerCleanupJob } from './agendador/limpeza-conversas';
import { buildApp } from './app';
import { ConversationStore } from './bot/conversation/store';
import { carregarEnv, type Env } from './config/env';
import { criarLogger } from './logger';
import { JOBS, type JobQueue } from './queue';

/**
 * Entrada executável do back-end (`pnpm --filter @lumens/backend dev`).
 *
 * Valida o ambiente antes de tudo: ambiente incompleto derruba a inicialização com
 * uma mensagem que diz o que falta. Com `--so-validar` (o `env:check` do CI) para aí.
 */
let env: Env;
try {
  env = carregarEnv();
} catch (erro) {
  // Mensagem limpa: quem está configurando a máquina não precisa do stack trace.
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
}

if (process.argv.includes('--so-validar')) {
  console.log(`Ambiente validado. Banco: ${new URL(env.DATABASE_URL).host}`);
} else {
  await iniciar(env);
}

async function iniciar(env: Env): Promise<void> {
  const logger = criarLogger(env.LOG_LEVEL);

  try {
    const db = criarDb(env.DATABASE_URL);

    // O pg-boss cria o próprio schema (`pgboss`) no primeiro start.
    const boss = new PgBoss(env.DATABASE_URL);
    boss.on('error', (err) => {
      logger.error({ err }, 'pg-boss error');
    });
    await boss.start();
    // pg-boss v10+ exige que a fila exista antes do send.
    for (const name of Object.values(JOBS)) {
      if (!(await boss.getQueue(name))) await boss.createQueue(name);
    }
    const queue: JobQueue = { send: (name, data) => boss.send(name, data) };
    await registerCleanupJob(boss, new ConversationStore(db));

    const app = await buildApp({
      config: { verifyToken: env.META_VERIFY_TOKEN, appSecret: env.META_APP_SECRET },
      db,
      queue,
      logger,
    });
    await app.listen({ port: env.PORT, host: '0.0.0.0' });

    let closing = false;
    const shutdown = async (signal: string) => {
      if (closing) return;
      closing = true;
      logger.info({ signal }, 'encerrando');
      try {
        await app.close();
        await boss.stop({ graceful: true });
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'erro no encerramento');
        process.exit(1);
      }
    };
    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
  } catch (err) {
    logger.fatal({ err }, 'falha ao iniciar');
    process.exit(1);
  }
}
