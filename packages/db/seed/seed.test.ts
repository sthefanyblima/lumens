import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarDb } from '../src/client';
import { executarSeed } from './index';

const executar = promisify(execFile);
const nomeSeguro = /^lumens_test_seed_[a-f0-9]{32}$/;
const bancosCriados = new Set<string>();
const executavelTsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
const scriptMigracao = fileURLToPath(new URL('../src/migrate.ts', import.meta.url));
const scriptSeed = fileURLToPath(new URL('./run.ts', import.meta.url));
const tabelasAdministradas = [
  'apoio',
  'bloco',
  'caminho',
  'curador',
  'estudante',
  'evento',
  'papel_pauta',
  'pauta',
  'promessa',
  'proposta',
  'relato',
  'resposta_conferencia',
  'voluntario',
] as const;
let administrador: Pool | undefined;
let urlBase: string;
let bancoModelo: string;
let bancoAtual: string | undefined;
let urlTeste: string;
let pool: Pool;
let poolAtual: Pool | undefined;
let conexoesEncerradas: Promise<void>[] = [];

function novoNome() {
  return `lumens_test_seed_${randomUUID().replaceAll('-', '')}`;
}

function conferirNome(nome: string) {
  if (!nomeSeguro.test(nome)) throw new Error('Fixture recusou nome de banco inseguro.');
}

function urlNoBanco(nome: string) {
  conferirNome(nome);
  const destino = new URL(urlBase);
  destino.pathname = `/${nome}`;
  return destino.toString();
}

function ambienteSemUrls() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([chave]) => chave !== 'DATABASE_URL' && chave !== 'DATABASE_URL_MIGRACAO',
    ),
  );
}

async function criarBanco(modelo?: string) {
  const nome = novoNome();
  conferirNome(nome);
  if (modelo) conferirNome(modelo);
  await administrador?.query(`CREATE DATABASE "${nome}"${modelo ? ` TEMPLATE "${modelo}"` : ''}`);
  bancosCriados.add(nome);
  return nome;
}

async function removerBanco(nome: string) {
  conferirNome(nome);
  await administrador?.query(`DROP DATABASE IF EXISTS "${nome}"`);
  bancosCriados.delete(nome);
}

async function contagens() {
  const resultados = await Promise.all(
    tabelasAdministradas.map(async (tabela) => {
      const { rows } = await pool.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM "${tabela}"`,
      );
      return [tabela, rows[0]?.total] as const;
    }),
  );
  return Object.fromEntries(resultados);
}

async function capturarFalha(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (erro) {
    return erro as Error & { code?: number; stdout?: string; stderr?: string };
  }
  throw new Error('O processo deveria ter falhado.');
}

beforeAll(async () => {
  const origem = process.env.DATABASE_URL_TESTE;
  if (!origem) throw new Error('Defina DATABASE_URL_TESTE e suba o Postgres com pnpm db:up.');
  const url = new URL(origem);
  if (!url.pathname.endsWith('_test') || !url.hostname) {
    throw new Error('DATABASE_URL_TESTE deve apontar por TCP para um banco terminado em _test.');
  }
  urlBase = url.toString();
  administrador = new Pool({ connectionString: urlBase, connectionTimeoutMillis: 5000 });
  bancoModelo = await criarBanco();
  await executar(process.execPath, [executavelTsx, scriptMigracao], {
    env: { ...ambienteSemUrls(), DATABASE_URL_MIGRACAO: urlNoBanco(bancoModelo) },
    timeout: 30_000,
  });
}, 40_000);

beforeEach(async () => {
  bancoAtual = await criarBanco(bancoModelo);
  urlTeste = urlNoBanco(bancoAtual);
  pool = new Pool({ connectionString: urlTeste, connectionTimeoutMillis: 5000 });
  poolAtual = pool;
  conexoesEncerradas = [];
  pool.on('connect', (cliente) => {
    conexoesEncerradas.push(
      new Promise<void>((resolve) => {
        cliente.once('end', resolve);
      }),
    );
  });
}, 30_000);

afterEach(async () => {
  await poolAtual?.end();
  // Pool.end() pode resolver antes do encerramento efetivo dos sockets dos clientes.
  await Promise.all(conexoesEncerradas);
  poolAtual = undefined;
  if (bancoAtual) await removerBanco(bancoAtual);
  bancoAtual = undefined;
});

afterAll(async () => {
  try {
    for (const banco of [...bancosCriados]) await removerBanco(banco);
  } finally {
    await administrador?.end();
  }
});

describe('seed completo em Postgres real', () => {
  beforeEach(async () => {
    await executarSeed(criarDb(pool));
  });

  it('mantém os aliases públicos alinhados ao runner do seed e à sequência de recriação', async () => {
    const raiz = JSON.parse(
      await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    const pacote = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(raiz.scripts['db:seed']).toBe('pnpm --filter @lumens/db db:seed');
    expect(raiz.scripts['db:fresh']).toBe('pnpm db:reset && pnpm db:migrate && pnpm db:seed');
    expect(pacote.scripts['db:seed']).toBe('tsx --env-file-if-exists=../../.env seed/run.ts');
  });

  it('popula o banco vazio com uma pauta em cada um dos nove status', async () => {
    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM pauta ORDER BY status',
    );

    expect(rows.map((pauta) => pauta.status)).toEqual([
      'em_curadoria',
      'recusada',
      'juntando_apoios',
      'meta_batida',
      'cobrando',
      'prometido',
      'entregue_em_parte',
      'descumprida',
      'conquistada',
    ]);
  });

  it('cria seis blocos e pautas com as metas das três escalas da RN04', async () => {
    const blocos = await pool.query<{ total: number }>('SELECT count(*)::int AS total FROM bloco');
    const { rows } = await pool.query<{ base: number; meta: number }>(
      `SELECT DISTINCT b.base_estudantes AS base, p.meta
       FROM pauta p JOIN bloco b ON b.id = p.bloco_id
       WHERE b.base_estudantes IN (120, 1200, 5000) ORDER BY base, meta`,
    );

    expect(blocos.rows[0]?.total).toBe(6);
    expect(rows).toEqual([
      { base: 120, meta: 30 },
      { base: 1200, meta: 120 },
      { base: 5000, meta: 300 },
    ]);
  });

  it('cria pauta de campus sem bloco com meta 300', async () => {
    const { rows } = await pool.query<{ bloco_id: null; meta: number }>(
      'SELECT bloco_id, meta FROM pauta WHERE bloco_id IS NULL',
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((pauta) => pauta.meta === 300)).toBe(true);
  });

  it('mantém os apoios abaixo da meta nos estados iniciais e suficientes nos avançados', async () => {
    const { rows } = await pool.query<{ status: string; coerente: boolean }>(
      `SELECT p.status,
              CASE WHEN p.status IN ('em_curadoria', 'recusada', 'juntando_apoios')
                   THEN count(a.estudante_id) < p.meta
                   ELSE count(a.estudante_id) >= p.meta END AS coerente
       FROM pauta p LEFT JOIN apoio a ON a.pauta_id = p.id
       GROUP BY p.id ORDER BY p.status`,
    );

    expect(rows).toHaveLength(9);
    expect(rows.filter((pauta) => !pauta.coerente)).toEqual([]);
  });

  it('não duplica apoio do mesmo estudante na mesma pauta', async () => {
    const quantidade = await pool.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM apoio',
    );
    const duplicados = await pool.query(
      `SELECT pauta_id, estudante_id FROM apoio GROUP BY pauta_id, estudante_id HAVING count(*) > 1`,
    );

    expect(quantidade.rows[0]?.total).toBeGreaterThan(0);
    expect(duplicados.rows).toEqual([]);
  });

  it('limita a três a soma de owners e co-owners ativos de cada pauta', async () => {
    const papeis = await pool.query<{ papel: string }>(
      'SELECT DISTINCT papel FROM papel_pauta WHERE ate IS NULL ORDER BY papel',
    );
    const excedidas = await pool.query(
      `SELECT pauta_id FROM papel_pauta WHERE ate IS NULL
       GROUP BY pauta_id HAVING count(*) > 3`,
    );

    expect(papeis.rows).toEqual([{ papel: 'owner' }, { papel: 'co_owner' }]);
    expect(excedidas.rows).toEqual([]);
  });

  it.each([
    ['em_curadoria', []],
    ['recusada', [{ de: 'em_curadoria', para: 'recusada' }]],
    ['juntando_apoios', [{ de: 'em_curadoria', para: 'juntando_apoios' }]],
    [
      'meta_batida',
      [
        { de: 'em_curadoria', para: 'juntando_apoios' },
        { de: 'juntando_apoios', para: 'meta_batida' },
      ],
    ],
    [
      'cobrando',
      [
        { de: 'em_curadoria', para: 'juntando_apoios' },
        { de: 'juntando_apoios', para: 'meta_batida' },
        { de: 'meta_batida', para: 'cobrando' },
      ],
    ],
    [
      'prometido',
      [
        { de: 'em_curadoria', para: 'juntando_apoios' },
        { de: 'juntando_apoios', para: 'meta_batida' },
        { de: 'meta_batida', para: 'cobrando' },
        { de: 'cobrando', para: 'prometido' },
      ],
    ],
    [
      'entregue_em_parte',
      [
        { de: 'em_curadoria', para: 'juntando_apoios' },
        { de: 'juntando_apoios', para: 'meta_batida' },
        { de: 'meta_batida', para: 'cobrando' },
        { de: 'cobrando', para: 'prometido' },
        { de: 'prometido', para: 'entregue_em_parte' },
      ],
    ],
    [
      'descumprida',
      [
        { de: 'em_curadoria', para: 'juntando_apoios' },
        { de: 'juntando_apoios', para: 'meta_batida' },
        { de: 'meta_batida', para: 'cobrando' },
        { de: 'cobrando', para: 'prometido' },
        { de: 'prometido', para: 'descumprida' },
      ],
    ],
    [
      'conquistada',
      [
        { de: 'em_curadoria', para: 'juntando_apoios' },
        { de: 'juntando_apoios', para: 'meta_batida' },
        { de: 'meta_batida', para: 'cobrando' },
        { de: 'cobrando', para: 'prometido' },
        { de: 'prometido', para: 'conquistada' },
      ],
    ],
  ] as const)('mantém a linha do tempo contínua até %s', async (status, transicoes) => {
    const { rows } = await pool.query<{
      tipo: string;
      de: string | null;
      para: string | null;
    }>(
      `SELECT e.tipo, e.dados->>'de' AS de, e.dados->>'para' AS para
       FROM evento e JOIN pauta p ON p.id = e.pauta_id
       WHERE p.status = $1 ORDER BY e.criado_em, e.id`,
      [status],
    );

    expect(rows[0]?.tipo).toBe('pauta_criada');
    expect(rows.slice(1)).toEqual(
      transicoes.map((transicao) => ({ tipo: 'status_alterado', ...transicao })),
    );
  });

  it('registra os três resultados finais somente após o fechamento das conferências', async () => {
    const { rows } = await pool.query<{ status: string; apos_fechamento: boolean }>(
      `SELECT p.status, e.criado_em > pr.conferencia_fecha_em AS apos_fechamento
       FROM pauta p JOIN promessa pr ON pr.pauta_id = p.id
       JOIN evento e ON e.pauta_id = p.id
         AND e.tipo = 'status_alterado' AND e.dados->>'para' = p.status::text
       WHERE p.status IN ('entregue_em_parte', 'descumprida', 'conquistada')
       ORDER BY p.status`,
    );

    expect(rows).toEqual([
      { status: 'entregue_em_parte', apos_fechamento: true },
      { status: 'descumprida', apos_fechamento: true },
      { status: 'conquistada', apos_fechamento: true },
    ]);
  });

  it('inclui relatos relacionados a pauta e autor nas três moderações', async () => {
    const { rows } = await pool.query<{ moderacao: string }>(
      `SELECT DISTINCT r.moderacao FROM relato r
       JOIN pauta p ON p.id = r.pauta_id JOIN estudante e ON e.id = r.estudante_id
       ORDER BY r.moderacao`,
    );

    expect(rows).toEqual([
      { moderacao: 'pendente' },
      { moderacao: 'aprovado' },
      { moderacao: 'recusado' },
    ]);
  });

  it('inclui caminhos Fala.BR com protocolo e prazo e caminhos da comunidade', async () => {
    const { rows } = await pool.query<{
      falabr: boolean;
      comunidade: boolean;
      incompletos: number;
    }>(
      `SELECT bool_or(c.tipo = 'falabr') AS falabr,
              bool_or(c.tipo = 'comunidade') AS comunidade,
              count(*) FILTER (WHERE c.tipo = 'falabr' AND
                (nullif(trim(c.protocolo), '') IS NULL OR c.prazo IS NULL))::int AS incompletos
       FROM caminho c JOIN pauta p ON p.id = c.pauta_id`,
    );

    expect(rows).toEqual([{ falabr: true, comunidade: true, incompletos: 0 }]);
  });

  it('disponibiliza proposta ligada a pauta com estudante voluntário', async () => {
    const { rows } = await pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM proposta pr
       JOIN pauta p ON p.id = pr.pauta_id JOIN voluntario v ON v.proposta_id = pr.id
       JOIN estudante e ON e.id = v.estudante_id`,
    );

    expect(rows[0]?.total).toBeGreaterThan(0);
  });

  it('disponibiliza promessa ligada a pauta e curador com resposta de estudante', async () => {
    const { rows } = await pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM promessa pr
       JOIN pauta p ON p.id = pr.pauta_id JOIN curador c ON c.id = pr.registrada_por
       JOIN resposta_conferencia r ON r.promessa_id = pr.id
       JOIN estudante e ON e.id = r.estudante_id`,
    );

    expect(rows[0]?.total).toBeGreaterThan(0);
  });

  it('inclui estudantes de cursos variados e curador ativo', async () => {
    const cursos = await pool.query<{ total: number }>(
      `SELECT count(DISTINCT nullif(trim(curso), ''))::int AS total FROM estudante`,
    );
    const curadores = await pool.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM curador WHERE ativo',
    );

    expect(cursos.rows[0]?.total).toBeGreaterThan(1);
    expect(curadores.rows[0]?.total).toBeGreaterThan(0);
  });

  it('persiste contatos somente como HMAC SHA-256 e placeholders reservados do seed', async () => {
    const { rows } = await pool.query<{ total: number; invalidos: number }>(
      `WITH contatos AS (
         SELECT telefone_hmac AS hmac, telefone_cifrado AS cifra,
                'seed:v1:telefone:' AS prefixo FROM estudante
         UNION ALL
         SELECT email_hmac, email_cifrado, 'seed:v1:email:' FROM estudante
         UNION ALL
         SELECT email_hmac, email_cifrado, 'seed:v1:email:' FROM curador
       )
       SELECT count(*)::int AS total, count(*) FILTER (
         WHERE hmac IS NULL OR hmac !~ '^[a-f0-9]{64}$'
            OR cifra IS NULL OR left(cifra, length(prefixo)) <> prefixo
       )::int AS invalidos FROM contatos`,
    );

    expect(rows[0]?.total).toBeGreaterThan(0);
    expect(rows[0]?.invalidos).toBe(0);
  });

  it('reaplica sem aumentar contagens nem alterar uma linha externa ao seed', async () => {
    const id = randomUUID();
    const sentinela = { id, slug: 'sentinela-externa', nome: 'Bloco externo', base_estudantes: 42 };
    await pool.query(
      'INSERT INTO bloco (id, slug, nome, base_estudantes) VALUES ($1, $2, $3, $4)',
      [sentinela.id, sentinela.slug, sentinela.nome, sentinela.base_estudantes],
    );
    const antes = await contagens();

    await executarSeed(criarDb(pool));

    const externo = await pool.query(
      'SELECT id, slug, nome, base_estudantes FROM bloco WHERE id = $1',
      [id],
    );
    expect(await contagens()).toEqual(antes);
    expect(externo.rows).toEqual([sentinela]);
  });

  it('persiste os mesmos IDs, contatos e datas em execuções independentes em bancos vazios', async () => {
    const segundoBanco = await criarBanco(bancoModelo);
    const segundaUrl = urlNoBanco(segundoBanco);
    const segundoPool = new Pool({ connectionString: segundaUrl, connectionTimeoutMillis: 5000 });
    const encerramentos: Promise<void>[] = [];
    segundoPool.on('connect', (cliente) => {
      encerramentos.push(
        new Promise<void>((resolve) => {
          cliente.once('end', resolve);
        }),
      );
    });

    async function registrosPersistidos(origem: Pool) {
      const registros = await Promise.all(
        tabelasAdministradas.map(async (tabela) => {
          const { rows } = await origem.query<{ registros: Record<string, unknown>[] }>(
            `SELECT coalesce(jsonb_agg(to_jsonb(registro) ORDER BY to_jsonb(registro)::text),
                             '[]'::jsonb) AS registros FROM "${tabela}" registro`,
          );
          return [tabela, rows[0]?.registros] as const;
        }),
      );
      return Object.fromEntries(registros);
    }

    try {
      // Outro processo também reavalia os geradores executados na importação do seed.
      await executar(process.execPath, [executavelTsx, scriptSeed], {
        env: { ...ambienteSemUrls(), DATABASE_URL: segundaUrl },
        timeout: 30_000,
      });
      const primeiro = await registrosPersistidos(pool);
      const segundo = await registrosPersistidos(segundoPool);

      expect(Object.keys(primeiro)).toHaveLength(13);
      expect(Object.values(primeiro).every((registros) => (registros?.length ?? 0) > 0)).toBe(true);
      expect(segundo).toEqual(primeiro);
    } finally {
      await segundoPool.end();
      await Promise.all(encerramentos);
      await removerBanco(segundoBanco);
    }
  }, 40_000);
});

describe('falhas do seed', () => {
  it('desfaz todas as inserções quando uma gravação tardia de evento falha', async () => {
    await pool.query(`
      CREATE FUNCTION recusar_evento_seed() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha tardia induzida pelo teste'; END;
      $$;
      CREATE TRIGGER recusar_evento_seed BEFORE INSERT ON evento
      FOR EACH ROW EXECUTE FUNCTION recusar_evento_seed();
    `);

    await expect(executarSeed(criarDb(pool))).rejects.toMatchObject({
      cause: { code: 'P0001', message: 'falha tardia induzida pelo teste' },
    });

    expect(await contagens()).toEqual({
      apoio: 0,
      bloco: 0,
      caminho: 0,
      curador: 0,
      estudante: 0,
      evento: 0,
      papel_pauta: 0,
      pauta: 0,
      promessa: 0,
      proposta: 0,
      relato: 0,
      resposta_conferencia: 0,
      voluntario: 0,
    });
  });

  it('recusa o CLI sem DATABASE_URL mesmo com URL administrativa disponível', async () => {
    const falha = await capturarFalha(
      executar(process.execPath, [executavelTsx, scriptSeed], {
        env: { ...ambienteSemUrls(), DATABASE_URL_MIGRACAO: urlTeste },
        timeout: 15_000,
      }),
    );

    expect(falha.code).toBe(1);
    expect(`${falha.stdout ?? ''}\n${falha.stderr ?? ''}`).toContain('Defina DATABASE_URL');
    expect(await contagens()).toEqual({
      apoio: 0,
      bloco: 0,
      caminho: 0,
      curador: 0,
      estudante: 0,
      evento: 0,
      papel_pauta: 0,
      pauta: 0,
      promessa: 0,
      proposta: 0,
      relato: 0,
      resposta_conferencia: 0,
      voluntario: 0,
    });
  }, 20_000);

  it('não expõe usuário nem senha no diagnóstico de erro de conexão do CLI', async () => {
    const urlInvalida = new URL(urlBase);
    urlInvalida.username = 'usuario_sentinela_seed';
    urlInvalida.password = 'senha_sentinela_seed';
    const falha = await capturarFalha(
      executar(process.execPath, [executavelTsx, scriptSeed], {
        env: {
          ...ambienteSemUrls(),
          DATABASE_URL: urlInvalida.toString(),
        },
        timeout: 15_000,
      }),
    );
    const saida = `${falha.stdout ?? ''}\n${falha.stderr ?? ''}`;

    expect(falha.code).toBe(1);
    expect(saida).toContain('Falha ao aplicar o seed');
    expect(saida).not.toContain('usuario_sentinela_seed');
    expect(saida).not.toContain('senha_sentinela_seed');
    expect(saida).not.toContain('postgresql://');
  }, 20_000);
});
