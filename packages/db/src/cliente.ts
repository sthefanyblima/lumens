import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema';

/** Genérico no driver: node-postgres em produção e PGlite nos testes têm a mesma interface. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Transação aberta por `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Pool do node-postgres. `aoErro` é obrigatório: quando o Postgres derruba uma conexão
 * ociosa (restart, failover, proxy que mata conexão parada), o pool emite 'error'; sem
 * listener, o Node relança o evento e o processo inteiro cai.
 */
export function criarPool(databaseUrl: string, aoErro: (erro: Error) => void): pg.Pool {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  pool.on('error', aoErro);
  return pool;
}

export function criarDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}
