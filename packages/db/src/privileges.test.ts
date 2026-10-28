import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PAPEL_APLICACAO } from './app-role';

const executar = promisify(execFile);
const nomeBancoSeguro = /^lumens_test_(priv|script|upgrade)_[a-f0-9]{32}$/;
const nomeTabelaSegura = /^lumens_test_future_[a-f0-9]{32}$/;
const nomeSequenciaSegura = /^lumens_test_future_[a-f0-9]{32}_seq$/;
const hashesMigracoesHistoricas = {
  '0000_fantastic_ulik.sql': '333c233c241e74f54c8ac1c983ff99bac409f5c05283cee0bbc06ae2e52687c5',
  '0001_evento_append_only.sql': 'df67248b36f260ad80269cb25acab485d49458795b3bc5a1f6c8e70285930aaa',
} as const;
const bancosCriados = new Set<string>();
const poolsDeBanco: Pool[] = [];
const poolsAdministrativos: Pool[] = [];
const pastaMigracoes = fileURLToPath(new URL('../migrations', import.meta.url));
const executavelTsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
const scriptMigracao = fileURLToPath(new URL('./migrate.ts', import.meta.url));
let administrador: Pool;
let poolOwner: Pool;
let poolAplicacao: Pool;
let urlAdministrativaBase: string;
let urlAplicacaoBase: string;
let nomeBancoPrincipal: string;

type EventoPersistido = {
  id: string;
  pauta_id: string;
  tipo: string;
  dados: Record<string, unknown>;
  origem: string;
  publico: boolean;
  criado_em: Date;
};

function novoBanco(tipo: 'priv' | 'script' | 'upgrade') {
  return `lumens_test_${tipo}_${randomUUID().replaceAll('-', '')}`;
}

function urlNoBanco(urlBase: string, banco: string) {
  if (!nomeBancoSeguro.test(banco)) throw new Error('Fixture recusou nome de banco inseguro.');
  const url = new URL(urlBase);
  url.pathname = `/${banco}`;
  return url.toString();
}

function ambienteSem(...chaves: string[]) {
  const removidas = new Set(chaves);
  return Object.fromEntries(Object.entries(process.env).filter(([chave]) => !removidas.has(chave)));
}

async function criarBanco(tipo: 'priv' | 'script' | 'upgrade') {
  const nome = novoBanco(tipo);
  if (!nomeBancoSeguro.test(nome)) throw new Error('Fixture recusou nome de banco inseguro.');
  await administrador.query(`CREATE DATABASE "${nome}"`);
  bancosCriados.add(nome);
  return nome;
}

async function removerBanco(nome: string) {
  if (!nomeBancoSeguro.test(nome)) throw new Error('Cleanup recusou nome de banco inseguro.');
  await administrador.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [nome],
  );
  await administrador.query(`DROP DATABASE IF EXISTS "${nome}"`);
  bancosCriados.delete(nome);
}

async function migrarPorProcesso(urlMigracao: string) {
  return executar(process.execPath, [executavelTsx, scriptMigracao], {
    env: {
      ...ambienteSem('DATABASE_URL', 'DATABASE_URL_MIGRACAO'),
      DATABASE_URL_MIGRACAO: urlMigracao,
    },
    timeout: 30_000,
  });
}

async function executarEmLayoutTemporario(conteudoEnvDatabase: string) {
  const raiz = await mkdtemp(join(tmpdir(), 'lumens-migrate-env-'));
  const cwd = join(raiz, 'packages', 'db');
  await mkdir(cwd, { recursive: true });
  await writeFile(join(raiz, '.env.database'), conteudoEnvDatabase, 'utf8');
  try {
    return await executar(
      process.execPath,
      [executavelTsx, '--env-file-if-exists=../../.env.database', scriptMigracao],
      {
        cwd,
        env: ambienteSem('DATABASE_URL', 'DATABASE_URL_MIGRACAO'),
        timeout: 30_000,
      },
    );
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
}

async function capturarFalha(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (erro) {
    return erro as Error & { stdout?: string; stderr?: string };
  }
  throw new Error('O processo deveria ter falhado.');
}

function primeiroId(rows: { id: string }[]) {
  const registro = rows[0];
  if (!registro) throw new Error('INSERT de fixture não retornou id.');
  return registro.id;
}

async function criarPauta(pool: Pool) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pauta (slug, titulo, descricao, categoria, meta)
     VALUES ($1, 'Bibliotecas abertas', 'Melhorar iluminação', 'infraestrutura', 30)
     RETURNING id`,
    [randomUUID()],
  );
  return primeiroId(rows);
}

async function criarEvento(pool: Pool, pautaId: string) {
  const fixture = {
    pauta_id: pautaId,
    tipo: 'pauta_criada',
    dados: { titulo: 'Bibliotecas abertas' },
    origem: 'curadoria',
    publico: false,
    criado_em: new Date('2026-10-27T12:00:00.123Z'),
  };
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO evento (pauta_id, tipo, dados, origem, publico, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      fixture.pauta_id,
      fixture.tipo,
      fixture.dados,
      fixture.origem,
      fixture.publico,
      fixture.criado_em,
    ],
  );
  return { id: primeiroId(rows), ...fixture };
}

async function buscarEvento(pool: Pool, id: string) {
  const { rows } = await pool.query<EventoPersistido>(
    `SELECT id, pauta_id, tipo, dados, origem, publico, criado_em
     FROM evento WHERE id = $1`,
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  const origemAdmin = process.env.DATABASE_URL_TESTE;
  const origemAplicacao = process.env.DATABASE_URL;
  if (!origemAdmin || !origemAplicacao) {
    throw new Error('Defina DATABASE_URL_TESTE e DATABASE_URL e suba o Postgres com pnpm db:up.');
  }
  const urlAdmin = new URL(origemAdmin);
  const urlApp = new URL(origemAplicacao);
  if (!urlAdmin.pathname.endsWith('_test') || !urlAdmin.hostname) {
    throw new Error('DATABASE_URL_TESTE deve apontar por TCP para um banco terminado em _test.');
  }
  if (decodeURIComponent(urlApp.username) !== PAPEL_APLICACAO || !urlApp.hostname) {
    throw new Error(`DATABASE_URL deve autenticar ${PAPEL_APLICACAO} por TCP.`);
  }
  urlAdministrativaBase = urlAdmin.toString();
  urlAplicacaoBase = urlApp.toString();
  administrador = new Pool({
    connectionString: urlAdministrativaBase,
    connectionTimeoutMillis: 5000,
  });
  poolsAdministrativos.push(administrador);
  nomeBancoPrincipal = await criarBanco('priv');
  const urlOwner = urlNoBanco(urlAdministrativaBase, nomeBancoPrincipal);
  await migrarPorProcesso(urlOwner);
  poolOwner = new Pool({ connectionString: urlOwner, connectionTimeoutMillis: 5000 });
  poolAplicacao = new Pool({
    connectionString: urlNoBanco(urlAplicacaoBase, nomeBancoPrincipal),
    connectionTimeoutMillis: 5000,
  });
  poolsDeBanco.push(poolAplicacao, poolOwner);
}, 40_000);

afterAll(async () => {
  for (const pool of poolsDeBanco) await pool.end();
  for (const banco of [...bancosCriados]) await removerBanco(banco);
  for (const pool of poolsAdministrativos) await pool.end();
});

describe('privilégios do login real da aplicação', () => {
  it('autentica como lumens_app e permite INSERT e SELECT de evento', async () => {
    const { rows: identidade } = await poolAplicacao.query<{
      session_user: string;
      current_user: string;
    }>('SELECT session_user, current_user');
    const pautaId = await criarPauta(poolOwner);

    const registro = await criarEvento(poolAplicacao, pautaId);

    expect(identidade[0]).toEqual({
      session_user: PAPEL_APLICACAO,
      current_user: PAPEL_APLICACAO,
    });
    expect(await buscarEvento(poolAplicacao, registro.id)).toEqual(registro);
  });

  it('expõe no catálogo somente SELECT e INSERT de evento', async () => {
    const { rows } = await poolAplicacao.query<{
      selecionar: boolean;
      inserir: boolean;
      atualizar: boolean;
      excluir: boolean;
      truncar: boolean;
    }>(
      `SELECT has_table_privilege(current_user, 'public.evento', 'SELECT') AS selecionar,
              has_table_privilege(current_user, 'public.evento', 'INSERT') AS inserir,
              has_table_privilege(current_user, 'public.evento', 'UPDATE') AS atualizar,
              has_table_privilege(current_user, 'public.evento', 'DELETE') AS excluir,
              has_table_privilege(current_user, 'public.evento', 'TRUNCATE') AS truncar`,
    );

    expect(rows[0]).toEqual({
      selecionar: true,
      inserir: true,
      atualizar: false,
      excluir: false,
      truncar: false,
    });
  });

  it.each([
    ['UPDATE', 'UPDATE evento SET publico = true WHERE id = $1', true],
    ['DELETE', 'DELETE FROM evento WHERE id = $1', true],
    ['TRUNCATE', 'TRUNCATE evento', false],
  ] as const)(
    'nega %s de evento com 42501 e preserva a linha',
    async (_operacao, comando, usaId) => {
      const registro = await criarEvento(poolOwner, await criarPauta(poolOwner));

      await expect(poolAplicacao.query(comando, usaId ? [registro.id] : [])).rejects.toMatchObject({
        code: '42501',
      });

      expect(await buscarEvento(poolOwner, registro.id)).toEqual(registro);
    },
  );

  it('permite SELECT, INSERT, UPDATE e DELETE fora de evento', async () => {
    const wamid = randomUUID();
    const instante = new Date('2026-10-27T13:00:00.000Z');

    await poolAplicacao.query('INSERT INTO mensagem_processada (wamid) VALUES ($1)', [wamid]);
    const inserido = await poolAplicacao.query<{ wamid: string }>(
      'SELECT wamid FROM mensagem_processada WHERE wamid = $1',
      [wamid],
    );
    expect(inserido.rows).toEqual([{ wamid }]);

    await poolAplicacao.query('UPDATE mensagem_processada SET recebida_em = $1 WHERE wamid = $2', [
      instante,
      wamid,
    ]);
    const atualizado = await poolAplicacao.query<{ recebida_em: Date }>(
      'SELECT recebida_em FROM mensagem_processada WHERE wamid = $1',
      [wamid],
    );
    expect(atualizado.rows[0]?.recebida_em).toEqual(instante);

    await poolAplicacao.query('DELETE FROM mensagem_processada WHERE wamid = $1', [wamid]);
    const removido = await poolAplicacao.query<{ existe: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM mensagem_processada WHERE wamid = $1) AS existe',
      [wamid],
    );
    expect(removido.rows[0]?.existe).toBe(false);
  });

  it('aplica privilégios padrão a tabela e sequência criadas depois da migração', async () => {
    const tabela = `lumens_test_future_${randomUUID().replaceAll('-', '')}`;
    const sequencia = `${tabela}_seq`;
    if (!nomeTabelaSegura.test(tabela)) throw new Error('Fixture recusou nome de tabela inseguro.');
    if (!nomeSequenciaSegura.test(sequencia)) {
      throw new Error('Fixture recusou nome de sequência inseguro.');
    }
    await poolOwner.query(`CREATE SEQUENCE "${sequencia}"`);
    await poolOwner.query(
      `CREATE TABLE "${tabela}" (
         id bigint DEFAULT nextval('"${sequencia}"'::regclass) PRIMARY KEY,
         valor text NOT NULL
       )`,
    );

    try {
      const { rows: privilegios } = await poolAplicacao.query<{ uso: boolean }>(
        `SELECT has_sequence_privilege(current_user, $1, 'USAGE') AS uso`,
        [sequencia],
      );
      expect(privilegios[0]?.uso).toBe(true);

      const inserido = await poolAplicacao.query<{ id: string; valor: string }>(
        `INSERT INTO "${tabela}" (valor) VALUES ('inicial') RETURNING id, valor`,
      );
      expect(inserido.rows).toEqual([{ id: '1', valor: 'inicial' }]);

      await poolAplicacao.query(`UPDATE "${tabela}" SET valor = 'alterado' WHERE id = 1`);
      const atualizado = await poolAplicacao.query<{ id: string; valor: string }>(
        `SELECT id, valor FROM "${tabela}"`,
      );
      expect(atualizado.rows).toEqual([{ id: '1', valor: 'alterado' }]);

      await poolAplicacao.query(`DELETE FROM "${tabela}" WHERE id = 1`);
      const removido = await poolAplicacao.query<{ total: string }>(
        `SELECT count(*) AS total FROM "${tabela}"`,
      );
      expect(removido.rows[0]?.total).toBe('0');
    } finally {
      await poolOwner.query(`DROP TABLE "${tabela}"`);
      await poolOwner.query(`DROP SEQUENCE "${sequencia}"`);
    }
  });
});

describe('separação das URLs no processo de migração', () => {
  it('exige DATABASE_URL_MIGRACAO sem aceitar DATABASE_URL como fallback', async () => {
    const falha = await capturarFalha(
      executarEmLayoutTemporario(
        `DATABASE_URL=${urlNoBanco(urlAdministrativaBase, nomeBancoPrincipal)}\n`,
      ),
    );

    expect(`${falha.stdout ?? ''}\n${falha.stderr ?? ''}`).toContain(
      'Defina DATABASE_URL_MIGRACAO',
    );
  }, 30_000);

  it('usa DATABASE_URL_MIGRACAO mesmo quando DATABASE_URL é inválida', async () => {
    const banco = await criarBanco('script');
    const urlOwner = urlNoBanco(urlAdministrativaBase, banco);

    try {
      await executarEmLayoutTemporario(
        `DATABASE_URL=postgresql://invalido:invalido@127.0.0.1:1/invalido\nDATABASE_URL_MIGRACAO=${urlOwner}\n`,
      );
      const pool = new Pool({ connectionString: urlOwner, connectionTimeoutMillis: 5000 });
      try {
        const { rows } = await pool.query<{ total: string }>(
          'SELECT count(*) AS total FROM drizzle.__drizzle_migrations',
        );
        expect(rows[0]?.total).toBe('3');
      } finally {
        await pool.end();
      }
    } finally {
      await removerBanco(banco);
    }
  }, 30_000);
});

describe('upgrade histórico para a migração de privilégios', () => {
  it('aplica 0002 após 0000/0001 reais sem alterar evento nem preservar grants adversariais', async () => {
    const banco = await criarBanco('upgrade');
    const urlOwner = urlNoBanco(urlAdministrativaBase, banco);
    const pool = new Pool({ connectionString: urlOwner, connectionTimeoutMillis: 5000 });
    const pastaHistorica = await mkdtemp(join(tmpdir(), 'lumens-migrations-0001-'));
    const metaHistorica = join(pastaHistorica, 'meta');

    try {
      await mkdir(metaHistorica);
      for (const [arquivo, hashEsperado] of Object.entries(hashesMigracoesHistoricas)) {
        const conteudo = await readFile(join(pastaMigracoes, arquivo));
        expect(createHash('sha256').update(conteudo).digest('hex')).toBe(hashEsperado);
      }
      await copyFile(
        join(pastaMigracoes, '0000_fantastic_ulik.sql'),
        join(pastaHistorica, '0000_fantastic_ulik.sql'),
      );
      await copyFile(
        join(pastaMigracoes, '0001_evento_append_only.sql'),
        join(pastaHistorica, '0001_evento_append_only.sql'),
      );
      const journal = JSON.parse(
        await readFile(join(pastaMigracoes, 'meta', '_journal.json'), 'utf8'),
      ) as { version: string; dialect: string; entries: unknown[] };
      await writeFile(
        join(metaHistorica, '_journal.json'),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }),
        'utf8',
      );

      const db = drizzle(pool);
      await migrate(db, { migrationsFolder: pastaHistorica });
      const antesJournal = await pool.query<{ total: string }>(
        'SELECT count(*) AS total FROM drizzle.__drizzle_migrations',
      );
      expect(antesJournal.rows[0]?.total).toBe('2');

      const sentinela = await criarEvento(pool, await criarPauta(pool));
      await pool.query('GRANT UPDATE, DELETE, TRUNCATE ON evento TO PUBLIC');

      await migrate(db, { migrationsFolder: pastaMigracoes });

      const depoisJournal = await pool.query<{ total: string }>(
        'SELECT count(*) AS total FROM drizzle.__drizzle_migrations',
      );
      expect(depoisJournal.rows[0]?.total).toBe('3');
      expect(await buscarEvento(pool, sentinela.id)).toEqual(sentinela);

      const { rows: aplicacao } = await pool.query<{
        selecionar: boolean;
        inserir: boolean;
        atualizar: boolean;
        excluir: boolean;
        truncar: boolean;
      }>(
        `SELECT has_table_privilege($1, 'public.evento', 'SELECT') AS selecionar,
                has_table_privilege($1, 'public.evento', 'INSERT') AS inserir,
                has_table_privilege($1, 'public.evento', 'UPDATE') AS atualizar,
                has_table_privilege($1, 'public.evento', 'DELETE') AS excluir,
                has_table_privilege($1, 'public.evento', 'TRUNCATE') AS truncar`,
        [PAPEL_APLICACAO],
      );
      expect(aplicacao[0]).toEqual({
        selecionar: true,
        inserir: true,
        atualizar: false,
        excluir: false,
        truncar: false,
      });

      const { rows: privilegiosPublicos } = await pool.query<{ privilege_type: string }>(
        `SELECT privilege_type
         FROM information_schema.table_privileges
         WHERE table_schema = 'public' AND table_name = 'evento' AND grantee = 'PUBLIC'
         ORDER BY privilege_type`,
      );
      expect(privilegiosPublicos).toEqual([]);
    } finally {
      await pool.end();
      await rm(pastaHistorica, { recursive: true, force: true });
      await removerBanco(banco);
    }
  });
});
