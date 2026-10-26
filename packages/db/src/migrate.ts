import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { criarCliente } from './client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Defina DATABASE_URL no ambiente ou no .env da raiz para executar db:migrate.');
}

const { db, pool } = criarCliente(connectionString);
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
  console.log('Migrações aplicadas.');
} catch (erro) {
  const causa = erro instanceof Error && erro.cause ? erro.cause : erro;
  const codigo =
    typeof causa === 'object' &&
    causa !== null &&
    'code' in causa &&
    typeof causa.code === 'string' &&
    /^[A-Z0-9_]{1,32}$/.test(causa.code)
      ? causa.code
      : 'indisponível';
  console.error(
    `Falha ao aplicar migrações (código: ${codigo}). Confira a conexão e a compatibilidade do esquema.`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
