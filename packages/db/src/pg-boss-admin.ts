import { PgBoss } from 'pg-boss';
import type { Pool } from 'pg';
import { PAPEL_APLICACAO } from './app-role';

/**
 * Instala ou atualiza o schema do pg-boss com a conexão administrativa e concede à aplicação
 * somente os privilégios necessários para operar as filas. O runtime usa `migrate: false`.
 */
export async function prepararPgBoss(connectionString: string, pool: Pool): Promise<void> {
  const boss = new PgBoss({ connectionString, supervise: false, schedule: false });
  boss.on('error', () => undefined);

  await boss.start();
  await boss.stop({ graceful: false });

  await pool.query(`
    GRANT USAGE ON SCHEMA pgboss TO ${PAPEL_APLICACAO};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO ${PAPEL_APLICACAO};
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA pgboss TO ${PAPEL_APLICACAO};
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO ${PAPEL_APLICACAO};

    ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${PAPEL_APLICACAO};
    ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
      GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${PAPEL_APLICACAO};
    ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
      GRANT EXECUTE ON FUNCTIONS TO ${PAPEL_APLICACAO};
  `);
}
