import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';
import type { Db } from './client';
import * as schema from './schema';

const PASTA_MIGRACOES = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Postgres em memória (PGlite) com as MESMAS migrações do banco real. Para testes que
 * precisam de SQL de verdade sem depender do Docker. Cada chamada é um banco novo e vazio.
 */
export async function criarBancoEmMemoria(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: PASTA_MIGRACOES });
  return db;
}

/**
 * Banco Postgres de verdade, novo e migrado, para testes que precisam de várias conexões ao
 * mesmo tempo (o PGlite tem uma só). Criado ao lado do banco de `DATABASE_URL_TESTE`, que tem
 * de terminar em `_test`; `apagar` remove o banco no fim do teste.
 */
export async function criarBancoTemporario(
  urlTeste: string,
): Promise<{ url: string; apagar: () => Promise<void> }> {
  const destino = new URL(urlTeste);
  if (!destino.pathname.endsWith('_test')) {
    throw new Error('DATABASE_URL_TESTE deve apontar para um banco terminado em _test.');
  }
  const nome = `lumens_test_tmp_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: urlTeste, connectionTimeoutMillis: 5000 });
  await admin.query(`CREATE DATABASE "${nome}"`);
  destino.pathname = `/${nome}`;
  const url = destino.toString();

  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await migratePg(drizzlePg(pool), { migrationsFolder: PASTA_MIGRACOES });
  } finally {
    await pool.end();
  }

  return {
    url,
    apagar: async () => {
      try {
        await admin.query(`DROP DATABASE "${nome}" WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    },
  };
}
