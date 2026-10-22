import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema';

/** Genérico no driver: node-postgres em produção e PGlite nos testes têm a mesma interface. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function criarDb(databaseUrl: string): Db {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}
