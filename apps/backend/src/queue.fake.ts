import { sql, type Db, type Tx } from '@lumens/db';
import type { IncomingMessageJob } from './bot/webhook/process';
import type { OutgoingReplies } from './bot/worker';
import { JOBS, type JobQueue } from './queue';

/**
 * Fila falsa para os testes. Grava na MESMA transação, em tabelas do próprio PGlite, como o
 * pg-boss com `fromDrizzle` faz em produção: o rollback desfaz os jobs junto, e o jsonb
 * recusa o que o Postgres recusaria.
 */
export class FakeQueue implements JobQueue {
  /** Falha DEPOIS de gravar o job: prova que a transação desfaz tudo junto. */
  failSend = false;
  /** Falha numa query com o job nos parâmetros, como um erro real do banco faria. */
  failSendInQuery = false;

  async send(name: string, data: object, tx: Tx) {
    const json = JSON.stringify(data);
    await tx.execute(sql`insert into fake_job (name, data) values (${name}, ${json}::jsonb)`);
    if (this.failSend) throw new Error('fila fora do ar');
    if (this.failSendInQuery) await tx.execute(sql`select ${json}::int`);
    return 'job';
  }

  async complete(name: string, id: string, tx: Tx) {
    await tx.execute(sql`insert into fake_done (name, id) values (${name}, ${id})`);
  }
}

export async function prepararFilaFalsa(db: Db): Promise<void> {
  await db.execute(
    sql`create table fake_job (id serial primary key, name text not null, data jsonb not null)`,
  );
  await db.execute(sql`create table fake_done (name text not null, id text not null)`);
}

// O Db é genérico no driver, então o `execute` volta `unknown`; no PGlite é `{ rows }`.
async function linhas<T>(db: Db, consulta: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(consulta)) as { rows: T[] }).rows;
}

function consultaDaFila(name: string) {
  return sql`select data from fake_job where name = ${name} order by id`;
}

export function mensagensNaFila(db: Db): Promise<{ data: IncomingMessageJob }[]> {
  return linhas(db, consultaDaFila(JOBS.incomingMessage));
}

export function respostasNaFila(db: Db): Promise<{ data: OutgoingReplies }[]> {
  return linhas(db, consultaDaFila(JOBS.outgoingReplies));
}

export function jobsConcluidos(db: Db): Promise<{ name: string; id: string }[]> {
  return linhas(db, sql`select name, id from fake_done`);
}
