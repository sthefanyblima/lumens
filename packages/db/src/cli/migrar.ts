import { migrar } from '../migrar';

/**
 * `pnpm db:migrate`. Lê só o DATABASE_URL: a validação completa do ambiente é do
 * back-end, e migrar não precisa das chaves da Meta nem do e-mail.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida. Se este é um ambiente novo: cp .env.example .env');
  process.exit(1);
}

try {
  await migrar(url);
  console.log(`Migrações aplicadas em ${new URL(url).host}.`);
} catch (erro) {
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
}
