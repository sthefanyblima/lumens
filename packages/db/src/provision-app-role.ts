import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { PAPEL_APLICACAO, PAPEL_SITE, provisionarPapelAplicacao } from './app-role';

/**
 * Os dois logins restritos: o da aplicação (backend) e o só de leitura do site (SCRUM-87).
 * Cada um tem a própria senha, e o provisionamento é o mesmo.
 */
const papeis = {
  aplicacao: {
    nome: PAPEL_APLICACAO,
    variavelSenha: 'POSTGRES_APP_PASSWORD',
    descricao: 'o papel da aplicação',
    sucesso: 'Papel da aplicação provisionado.',
  },
  site: {
    nome: PAPEL_SITE,
    variavelSenha: 'POSTGRES_SITE_PASSWORD',
    descricao: 'o papel de leitura do site',
    sucesso: 'Papel de leitura do site provisionado.',
  },
} as const;

type OpcoesProvisionamento = {
  ambiente?: NodeJS.ProcessEnv;
  papel?: keyof typeof papeis;
  nomePapel?: string;
  escreverSucesso?: (mensagem: string) => void;
  escreverFalha?: (mensagem: string) => void;
};

export async function executarProvisionamento({
  ambiente = process.env,
  papel = 'aplicacao',
  nomePapel = papeis[papel].nome,
  escreverSucesso = console.log,
  escreverFalha = console.error,
}: OpcoesProvisionamento = {}) {
  const { variavelSenha, descricao, sucesso } = papeis[papel];
  let pool: Pool | undefined;
  try {
    const connectionString = ambiente.DATABASE_URL_MIGRACAO;
    const senha = ambiente[variavelSenha];
    if (!connectionString) throw Object.assign(new Error(), { code: 'CONFIG_URL_AUSENTE' });
    if (!senha) throw Object.assign(new Error(), { code: 'CONFIG_SENHA_AUSENTE' });

    pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    await provisionarPapelAplicacao(pool, nomePapel, senha);
    escreverSucesso(sucesso);
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
      `Falha ao provisionar ${descricao} (código: ${codigo}). Confira a conexão e os vínculos do papel.`,
    );
    return 1;
  } finally {
    await pool?.end();
  }
}

const entrada = process.argv[1];
if (entrada && pathToFileURL(resolve(entrada)).href === import.meta.url) {
  // O site só é provisionado se a aplicação der certo: a primeira falha encerra o comando.
  process.exitCode =
    (await executarProvisionamento()) || (await executarProvisionamento({ papel: 'site' }));
}
