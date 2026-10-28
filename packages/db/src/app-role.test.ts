import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ErroPapelIncompativel, PAPEL_APLICACAO, provisionarPapelAplicacao } from './app-role';
import { executarProvisionamento } from './provision-app-role';

const executar = promisify(execFile);
const prefixoPapel = 'lumens_test_role_';
const nomePapelSeguro = /^lumens_test_role_[a-f0-9]{32}$/;
const nomeEsquemaSeguro = /^lumens_test_owned_[a-f0-9]{32}$/;
const papeisCriados = new Set<string>();
let administrador: Pool;
let urlAdministrativa: string;

type EstadoPapel = {
  oid: number;
  rolcanlogin: boolean;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolinherit: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
};

function novoPapel() {
  return `${prefixoPapel}${randomUUID().replaceAll('-', '')}`;
}

function novaSenha(rotulo: string) {
  return `${rotulo}-Aa1!-${randomUUID()}`;
}

function identificadorPapel(nome: string) {
  if (!nomePapelSeguro.test(nome)) throw new Error('Cleanup recusou nome de papel inseguro.');
  return `"${nome}"`;
}

function identificadorEsquema(nome: string) {
  if (!nomeEsquemaSeguro.test(nome)) throw new Error('Cleanup recusou nome de esquema inseguro.');
  return `"${nome}"`;
}

async function executarFormatado(formato: string, ...valores: string[]) {
  const { rows } = await administrador.query<{ comando: string }>(
    'SELECT format($1::text, VARIADIC $2::text[]) AS comando',
    [formato, valores],
  );
  const comando = rows[0]?.comando;
  if (!comando) throw new Error('PostgreSQL não produziu o comando da fixture.');
  await administrador.query(comando);
}

async function criarPapelPermissivo(nome: string, senha: string) {
  if (!nomePapelSeguro.test(nome)) throw new Error('Fixture recusou nome de papel inseguro.');
  await executarFormatado(
    'CREATE ROLE %I WITH LOGIN SUPERUSER CREATEDB CREATEROLE INHERIT REPLICATION BYPASSRLS PASSWORD %L',
    nome,
    senha,
  );
  papeisCriados.add(nome);
}

async function criarPapelSemLogin(nome: string) {
  if (!nomePapelSeguro.test(nome)) throw new Error('Fixture recusou nome de papel inseguro.');
  await executarFormatado('CREATE ROLE %I NOLOGIN', nome);
  papeisCriados.add(nome);
}

async function estadoDoPapel(nome: string) {
  const { rows } = await administrador.query<EstadoPapel>(
    `SELECT oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit,
            rolreplication, rolbypassrls
     FROM pg_roles WHERE rolname = $1`,
    [nome],
  );
  return rows[0];
}

async function autenticar(nome: string, senha: string) {
  const url = new URL(urlAdministrativa);
  url.username = nome;
  url.password = senha;
  const pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 2000 });
  try {
    const { rows } = await pool.query<{ session_user: string; current_user: string }>(
      'SELECT session_user, current_user',
    );
    return rows[0];
  } finally {
    await pool.end();
  }
}

async function autenticarPelaUrl(connectionString: string) {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 2000 });
  try {
    const { rows } = await pool.query<{ session_user: string; current_user: string }>(
      'SELECT session_user, current_user',
    );
    return rows[0];
  } finally {
    await pool.end();
  }
}

function ambienteSem(...chaves: string[]) {
  const removidas = new Set(chaves);
  return Object.fromEntries(Object.entries(process.env).filter(([chave]) => !removidas.has(chave)));
}

async function limparPapeis() {
  for (const nome of [...papeisCriados].reverse()) {
    const identificador = identificadorPapel(nome);
    await administrador.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE usename = $1 AND pid <> pg_backend_pid()`,
      [nome],
    );
    await administrador.query(`DROP OWNED BY ${identificador}`).catch(() => undefined);
    await administrador.query(`DROP ROLE IF EXISTS ${identificador}`);
    papeisCriados.delete(nome);
  }
}

beforeAll(() => {
  const origem = process.env.DATABASE_URL_TESTE;
  if (!origem) throw new Error('Defina DATABASE_URL_TESTE e suba o Postgres com pnpm db:up.');
  const url = new URL(origem);
  if (!url.pathname.endsWith('_test') || !url.hostname) {
    throw new Error('DATABASE_URL_TESTE deve apontar por TCP para um banco terminado em _test.');
  }
  urlAdministrativa = url.toString();
  administrador = new Pool({ connectionString: urlAdministrativa, connectionTimeoutMillis: 5000 });
});

afterEach(limparPapeis);

afterAll(async () => {
  await limparPapeis();
  await administrador.end();
});

describe('provisionamento seguro de papel da aplicação', () => {
  it('cria login restrito e autentica a senha fornecida por TCP', async () => {
    const nome = novoPapel();
    const senha = novaSenha('criacao');
    papeisCriados.add(nome);

    await provisionarPapelAplicacao(administrador, nome, senha);

    expect(await estadoDoPapel(nome)).toMatchObject({
      rolcanlogin: true,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolinherit: false,
      rolreplication: false,
      rolbypassrls: false,
    });
    expect(await autenticar(nome, senha)).toEqual({ session_user: nome, current_user: nome });
  });

  it('endurece o login existente e troca a senha sem recriar o papel', async () => {
    const nome = novoPapel();
    const senhaAntiga = novaSenha('antiga');
    const senhaNova = novaSenha('nova');
    await criarPapelPermissivo(nome, senhaAntiga);
    const antes = await estadoDoPapel(nome);

    await provisionarPapelAplicacao(administrador, nome, senhaNova);

    const depois = await estadoDoPapel(nome);
    expect(depois).toMatchObject({
      oid: antes?.oid,
      rolcanlogin: true,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolinherit: false,
      rolreplication: false,
      rolbypassrls: false,
    });
    expect(await autenticar(nome, senhaNova)).toEqual({ session_user: nome, current_user: nome });
    await expect(autenticar(nome, senhaAntiga)).rejects.toMatchObject({ code: '28P01' });
  });

  it('reaplica o provisionamento preservando a identidade e os atributos', async () => {
    const nome = novoPapel();
    const senha = novaSenha('idempotente');
    papeisCriados.add(nome);

    await provisionarPapelAplicacao(administrador, nome, senha);
    const primeiraAplicacao = await estadoDoPapel(nome);
    await provisionarPapelAplicacao(administrador, nome, senha);

    expect(await estadoDoPapel(nome)).toEqual(primeiraAplicacao);
    expect(await autenticar(nome, senha)).toEqual({ session_user: nome, current_user: nome });
  });

  it('não revela credenciais no provisionamento bem-sucedido pela CLI', async () => {
    const nome = novoPapel();
    const senhaAplicacao = novaSenha('cli-sucesso');
    const senhaAdministrativa = decodeURIComponent(new URL(urlAdministrativa).password);
    const sucessos: string[] = [];
    const falhas: string[] = [];
    papeisCriados.add(nome);

    const codigo = await executarProvisionamento({
      ambiente: {
        DATABASE_URL_MIGRACAO: urlAdministrativa,
        POSTGRES_APP_PASSWORD: senhaAplicacao,
      },
      nomePapel: nome,
      escreverSucesso: (mensagem) => sucessos.push(mensagem),
      escreverFalha: (mensagem) => falhas.push(mensagem),
    });

    const saida = [...sucessos, ...falhas].join('\n');
    expect(codigo).toBe(0);
    expect(sucessos).toEqual(['Papel da aplicação provisionado.']);
    expect(falhas).toEqual([]);
    expect(await autenticar(nome, senhaAplicacao)).toEqual({
      session_user: nome,
      current_user: nome,
    });
    for (const segredo of [senhaAdministrativa, senhaAplicacao, urlAdministrativa]) {
      expect(saida).not.toContain(segredo);
      expect(saida).not.toContain(encodeURIComponent(segredo));
    }
  });

  it('recusa membership preexistente sem endurecer nem trocar a senha', async () => {
    const nome = novoPapel();
    const grupo = novoPapel();
    const senhaOriginal = novaSenha('membership-original');
    const senhaRecusada = novaSenha('membership-recusada');
    await criarPapelPermissivo(nome, senhaOriginal);
    await criarPapelSemLogin(grupo);
    await administrador.query(`GRANT ${identificadorPapel(grupo)} TO ${identificadorPapel(nome)}`);
    const antes = await estadoDoPapel(nome);

    await expect(
      provisionarPapelAplicacao(administrador, nome, senhaRecusada),
    ).rejects.toMatchObject({
      name: 'ErroPapelIncompativel',
      code: 'PAPEL_MEMBERSHIP_INCOMPATIVEL',
      message: 'O papel da aplicação possui vínculos incompatíveis com o provisionamento seguro.',
    } satisfies Partial<ErroPapelIncompativel>);

    expect(await estadoDoPapel(nome)).toEqual(antes);
    const { rows: memberships } = await administrador.query<{ preservado: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_auth_members AS vinculo
         JOIN pg_roles AS grupo ON grupo.oid = vinculo.roleid
         JOIN pg_roles AS membro ON membro.oid = vinculo.member
         WHERE grupo.rolname = $1 AND membro.rolname = $2
       ) AS preservado`,
      [grupo, nome],
    );
    expect(memberships[0]?.preservado).toBe(true);
    expect(await autenticar(nome, senhaOriginal)).toEqual({
      session_user: nome,
      current_user: nome,
    });
    await expect(autenticar(nome, senhaRecusada)).rejects.toMatchObject({ code: '28P01' });
  });

  it('recusa ownership preexistente sem alterar objeto, atributos ou senha', async () => {
    const nome = novoPapel();
    const esquema = `lumens_test_owned_${randomUUID().replaceAll('-', '')}`;
    const senhaOriginal = novaSenha('ownership-original');
    const senhaRecusada = novaSenha('ownership-recusada');
    await criarPapelPermissivo(nome, senhaOriginal);
    await administrador.query(
      `CREATE SCHEMA ${identificadorEsquema(esquema)} AUTHORIZATION ${identificadorPapel(nome)}`,
    );
    const antes = await estadoDoPapel(nome);

    await expect(
      provisionarPapelAplicacao(administrador, nome, senhaRecusada),
    ).rejects.toMatchObject({
      name: 'ErroPapelIncompativel',
      code: 'PAPEL_OWNERSHIP_INCOMPATIVEL',
      message: 'O papel da aplicação possui vínculos incompatíveis com o provisionamento seguro.',
    } satisfies Partial<ErroPapelIncompativel>);

    const { rows } = await administrador.query<{ dono: string }>(
      `SELECT pg_get_userbyid(nspowner) AS dono FROM pg_namespace WHERE nspname = $1`,
      [esquema],
    );
    expect(rows[0]?.dono).toBe(nome);
    expect(await estadoDoPapel(nome)).toEqual(antes);
    expect(await autenticar(nome, senhaOriginal)).toEqual({
      session_user: nome,
      current_user: nome,
    });
    await expect(autenticar(nome, senhaRecusada)).rejects.toMatchObject({ code: '28P01' });
  });

  it('rejeita senha ausente antes de criar o papel', async () => {
    const nome = novoPapel();

    await expect(provisionarPapelAplicacao(administrador, nome, '')).rejects.toThrow(
      'Senha do papel da aplicação não definida.',
    );

    expect(await estadoDoPapel(nome)).toBeUndefined();
  });

  it('rejeita POSTGRES_APP_PASSWORD ausente sem alterar o papel fixo', async () => {
    const urlAplicacao = process.env.DATABASE_URL;
    if (!urlAplicacao || decodeURIComponent(new URL(urlAplicacao).username) !== PAPEL_APLICACAO) {
      throw new Error(`DATABASE_URL deve autenticar ${PAPEL_APLICACAO}.`);
    }
    const antes = await estadoDoPapel(PAPEL_APLICACAO);
    const raiz = await mkdtemp(join(tmpdir(), 'lumens-provision-env-'));
    const cwd = join(raiz, 'packages', 'db');
    await mkdir(cwd, { recursive: true });
    const falha = await (async () => {
      try {
        try {
          await executar(
            process.execPath,
            [
              fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)),
              '--env-file-if-exists=../../.env.database',
              fileURLToPath(new URL('./provision-app-role.ts', import.meta.url)),
            ],
            {
              cwd,
              env: {
                ...ambienteSem('POSTGRES_APP_PASSWORD'),
                DATABASE_URL_MIGRACAO: urlAdministrativa,
              },
              timeout: 10_000,
            },
          );
        } catch (erro) {
          return erro as Error & { stdout?: string; stderr?: string };
        }
        throw new Error('O provisionamento deveria rejeitar a senha ausente.');
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    })();

    expect(`${falha.stdout ?? ''}\n${falha.stderr ?? ''}`).toContain(
      'Falha ao provisionar o papel da aplicação (código: CONFIG_SENHA_AUSENTE).',
    );
    expect(await estadoDoPapel(PAPEL_APLICACAO)).toEqual(antes);
    expect(await autenticarPelaUrl(urlAplicacao)).toEqual({
      session_user: PAPEL_APLICACAO,
      current_user: PAPEL_APLICACAO,
    });
  });

  it('não revela a URL nem as senhas quando a autenticação administrativa falha', async () => {
    const urlInvalida = new URL(urlAdministrativa);
    const senhaAdmin = novaSenha('admin-invalida');
    const senhaAplicacao = novaSenha('app-sentinela');
    urlInvalida.password = senhaAdmin;
    let falha: (Error & { stdout?: string; stderr?: string }) | undefined;

    try {
      await executar(
        process.execPath,
        [
          fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)),
          '--env-file-if-exists=../../.env.database',
          'src/provision-app-role.ts',
        ],
        {
          cwd: fileURLToPath(new URL('..', import.meta.url)),
          env: {
            ...process.env,
            DATABASE_URL_MIGRACAO: urlInvalida.toString(),
            POSTGRES_APP_PASSWORD: senhaAplicacao,
          },
          timeout: 10_000,
        },
      );
    } catch (erro) {
      falha = erro as Error & { stdout?: string; stderr?: string };
    }

    expect(falha).toBeDefined();
    const saida = `${falha?.stdout ?? ''}\n${falha?.stderr ?? ''}`;
    expect(saida).toContain('Falha ao provisionar o papel da aplicação (código: 28P01).');
    for (const segredo of [senhaAdmin, senhaAplicacao, urlInvalida.toString()]) {
      expect(saida).not.toContain(segredo);
      expect(saida).not.toContain(encodeURIComponent(segredo));
    }
  });
});
