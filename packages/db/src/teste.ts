import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Db } from './cliente';
import { PASTA_MIGRACOES } from './migrar';
import * as schema from './schema';

/**
 * Postgres em memória (PGlite) com as MESMAS migrações do banco real. Para testes que
 * precisam de SQL de verdade sem depender do Docker. Cada chamada é um banco novo e vazio.
 */
export async function criarBancoEmMemoria(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: PASTA_MIGRACOES });
  return db;
}
