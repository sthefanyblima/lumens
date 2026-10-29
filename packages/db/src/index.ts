export const PACOTE_DB = '@lumens/db' as const;

export * from './schema';
export { criarCliente, criarDb, criarPool, type Db, type Tx } from './client';
export type * from './types';

// Operadores do Drizzle reexportados daqui para que os outros pacotes não dependam do
// drizzle-orm direto: com o pnpm, duas instâncias dele (resolvidas com peers diferentes)
// não reconhecem as tabelas uma da outra. O `sql` é o que o fromDrizzle do pg-boss pede.
export { and, eq, gt, lt, sql } from 'drizzle-orm';
