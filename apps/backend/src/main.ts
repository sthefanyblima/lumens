import { criarDb, criarPool, sql, type Tx } from '@lumens/db';
import { fromDrizzle, PgBoss } from 'pg-boss';
import { registerCleanupJob } from './agendador/limpeza-conversas';
import { buildApp } from './app';
import { ConversationStore } from './bot/conversation/store';
import { logSender, registerIncomingWorker, registerReplyWorker } from './bot/worker';
import { carregarEnv, type Env } from './config/env';
import { chavesDoEnv } from './cripto';
import { criarLogger, resumoDoErro } from './logger';
import { StaleJobError, type JobQueue } from './queue';

/**
 * Sem limite, um banco travado deixaria a transação de uma mensagem pendurada além dos 60 s do
 * `expireInSeconds`: o job expira e é pego de novo enquanto a primeira tentativa ainda roda.
 * Com estes limites a tentativa falha antes disso (e o `complete` amarrado à tentativa cobre o
 * resto).
 */
const POOL_TIMEOUTS = { conexaoMs: 5_000, consultaMs: 15_000 } as const;

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
    const pool = criarPool(env.DATABASE_URL, POOL_TIMEOUTS, (erro) => {
      // Conexão ociosa derrubada pelo Postgres: o pool descarta e abre outra na próxima query.
      logger.error({ erro: resumoDoErro(erro) }, 'conexão do banco caiu');
    });
    const db = criarDb(pool);

    // O pg-boss cria o próprio schema (`pgboss`) no primeiro start. O LISTEN/NOTIFY acorda os
    // workers das filas com `notify` assim que o job é criado.
    const boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      useListenNotify: true,
      connectionTimeoutMillis: POOL_TIMEOUTS.conexaoMs,
    });
    boss.on('error', (erro) => {
      logger.error({ erro: resumoDoErro(erro) }, 'pg-boss error');
    });
    await boss.start();

    // O Tx é genérico no driver (PGlite nos testes), então o tipo do `execute` não sabe que
    // devolve `{ rows }`. Aqui o driver é sempre o node-postgres, que devolve.
    const naTransacao = (tx: Tx) => ({
      db: fromDrizzle(tx as unknown as Parameters<typeof fromDrizzle>[0], sql),
    });
    const queue: JobQueue = {
      send: (name, data, tx) => boss.send(name, data, naTransacao(tx)),
      complete: async (name, job, tx) => {
        // O tipo declara CommandResponse vazio, mas o pg-boss devolve `{ jobs, requested, affected }`
        // (mapCommandResponse); com a tentativa no argumento, `affected` é 0 se ela não vale mais.
        const resposta = (await boss.complete(name, job, null, naTransacao(tx))) as {
          affected?: number;
        };
        if (resposta.affected !== 1) throw new StaleJobError();
      },
    };
    const chaves = chavesDoEnv(env);
    const store = new ConversationStore(db);
    // As filas são criadas aqui, antes do servidor aceitar o primeiro webhook.
    await registerCleanupJob(boss, { store, db });
    await registerIncomingWorker(boss, { db, store, queue, logger, chaves });
    await registerReplyWorker(boss, logSender(logger, chaves), logger);

    const app = await buildApp({
      config: { verifyToken: env.META_VERIFY_TOKEN, appSecret: env.META_APP_SECRET },
      db,
      queue,
      logger,
      chaves,
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
        await pool.end();
        process.exit(0);
      } catch (err) {
        logger.error({ erro: resumoDoErro(err) }, 'erro no encerramento');
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
    logger.fatal({ erro: resumoDoErro(err) }, 'falha ao iniciar');
    process.exit(1);
  }
}
