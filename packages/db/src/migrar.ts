import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/** Pasta das migrações geradas pelo drizzle-kit (veja drizzle.config.ts). */
export const PASTA_MIGRACOES = fileURLToPath(new URL('../migracoes', import.meta.url));

/** Aplica as migrações pendentes. Idempotente: o drizzle guarda o que já rodou. */
export async function migrar(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder: PASTA_MIGRACOES });
  } finally {
    await pool.end();
  }
}
