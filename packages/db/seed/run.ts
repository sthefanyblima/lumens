import { criarCliente } from '../src/client';
import { executarSeed } from './index';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Defina DATABASE_URL no ambiente ou no .env da raiz para executar db:seed.');
  process.exitCode = 1;
} else {
  const { db, pool } = criarCliente(connectionString);
  try {
    await executarSeed(db);
    console.log('Seed de desenvolvimento aplicado.');
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
    console.error(`Falha ao aplicar o seed (código: ${codigo}). Confira a conexão e as migrações.`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
