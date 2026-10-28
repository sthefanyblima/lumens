import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { PAPEL_APLICACAO, provisionarPapelAplicacao } from './app-role';

type OpcoesProvisionamento = {
  ambiente?: NodeJS.ProcessEnv;
  nomePapel?: string;
  escreverSucesso?: (mensagem: string) => void;
  escreverFalha?: (mensagem: string) => void;
};

export async function executarProvisionamento({
  ambiente = process.env,
  nomePapel = PAPEL_APLICACAO,
  escreverSucesso = console.log,
  escreverFalha = console.error,
}: OpcoesProvisionamento = {}) {
  let pool: Pool | undefined;
  try {
    const connectionString = ambiente.DATABASE_URL_MIGRACAO;
    const senha = ambiente.POSTGRES_APP_PASSWORD;
    if (!connectionString) throw Object.assign(new Error(), { code: 'CONFIG_URL_AUSENTE' });
    if (!senha) throw Object.assign(new Error(), { code: 'CONFIG_SENHA_AUSENTE' });

    pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    await provisionarPapelAplicacao(pool, nomePapel, senha);
    escreverSucesso('Papel da aplicação provisionado.');
    return 0;
  } catch (erro) {
    const codigo =
      typeof erro === 'object' &&
      erro !== null &&
      'code' in erro &&
      typeof erro.code === 'string' &&
      /^[A-Z0-9_]{1,40}$/.test(erro.code)
        ? erro.code
        : 'indisponível';
    escreverFalha(
      `Falha ao provisionar o papel da aplicação (código: ${codigo}). Confira a conexão e os vínculos do papel.`,
    );
    return 1;
  } finally {
    await pool?.end();
  }
}

const entrada = process.argv[1];
if (entrada && pathToFileURL(resolve(entrada)).href === import.meta.url) {
  process.exitCode = await executarProvisionamento();
}
