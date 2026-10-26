import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as schema from './schema';

/** Genérico no driver: node-postgres em produção e PGlite nos testes têm a mesma interface. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Transação aberta por `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** O chamador fornece a conexão e encerra o pool ao finalizar. */
export function criarCliente(connectionString: string) {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

/**
 * Pool do node-postgres para processos longos (o servidor). `aoErro` é obrigatório: quando o
 * Postgres derruba uma conexão ociosa (restart, failover, proxy que mata conexão parada), o
 * pool emite 'error'; sem listener, o Node relança o evento e o processo inteiro cai.
 */
export function criarPool(databaseUrl: string, aoErro: (erro: Error) => void): Pool {
  const pool = new Pool({ connectionString: databaseUrl });
  pool.on('error', aoErro);
  return pool;
}

export function criarDb(pool: Pool): Db {
  return drizzle(pool, { schema });
}
