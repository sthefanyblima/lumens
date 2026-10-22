/**
 * @lumens/db
 *
 * Esquema (Drizzle), migrações, views públicas e seed.
 * Implementação: T2 (Postgres local), T4 (esquema), T5 (trigger), T6 (seed), T14 (views).
 */
export const PACOTE_DB = '@lumens/db' as const;

export * from './schema';
export { criarDb, type Db } from './cliente';
export { migrar, PASTA_MIGRACOES } from './migrar';

// Operadores do Drizzle reexportados daqui para que os outros pacotes não dependam do
// drizzle-orm direto: com o pnpm, duas instâncias dele (resolvidas com peers diferentes)
// não reconhecem as tabelas uma da outra.
export { and, eq, gt, lt } from 'drizzle-orm';
