import { PgBoss, type ConstructorOptions } from 'pg-boss';

type OpcoesRuntime = Pick<
  ConstructorOptions,
  'connectionTimeoutMillis' | 'schedule' | 'supervise' | 'useListenNotify'
>;

/** Cria o PgBoss do runtime sem permitir que a role da aplicação execute DDL. */
export function criarPgBossRuntime(connectionString: string, opcoes: OpcoesRuntime = {}): PgBoss {
  return new PgBoss({
    connectionString,
    migrate: false,
    reindex: false,
    ...opcoes,
  });
}
