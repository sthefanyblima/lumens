import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { papeisPauta } from './schema';

const executar = promisify(execFile);
const nomeBanco = `lumens_test_scrum77_${randomUUID().replaceAll('-', '')}`;
const pastaDb = fileURLToPath(new URL('..', import.meta.url));
let administrador: Pool | undefined;
let pool: Pool;
let poolCriado = false;
let bancoCriado = false;
let urlTeste: string;

async function migrarPeloComando() {
  // Mesmo executável/argumentos de db:migrate, sem shell ou credenciais em argv.
  return executar(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)),
      '--env-file-if-exists=../../.env.database',
      'src/migrate.ts',
    ],
    {
      cwd: pastaDb,
      env: { ...process.env, DATABASE_URL_MIGRACAO: urlTeste },
      timeout: 30_000,
    },
  );
}

beforeAll(async () => {
  const origem = process.env.DATABASE_URL_TESTE;
  if (!origem) throw new Error('Defina DATABASE_URL_TESTE e suba o Postgres com pnpm db:up.');
  const destino = new URL(origem);
  if (!destino.pathname.endsWith('_test')) {
    throw new Error('DATABASE_URL_TESTE deve apontar para um banco terminado em _test.');
  }
  administrador = new Pool({ connectionString: origem, connectionTimeoutMillis: 5000 });
  await administrador.query(`CREATE DATABASE "${nomeBanco}"`);
  bancoCriado = true;
  destino.pathname = `/${nomeBanco}`;
  urlTeste = destino.toString();
  pool = new Pool({ connectionString: urlTeste, connectionTimeoutMillis: 5000 });
  poolCriado = true;
  await migrarPeloComando();
}, 40_000);

afterAll(async () => {
  if (poolCriado) await pool.end();
  try {
    if (bancoCriado && /^lumens_test_scrum77_[a-f0-9]{32}$/.test(nomeBanco)) {
      await administrador?.query(`DROP DATABASE "${nomeBanco}"`);
    }
  } finally {
    await administrador?.end();
  }
});

function idCriado(rows: { id: string }[]) {
  const registro = rows[0];
  if (!registro) throw new Error('INSERT de fixture não retornou id.');
  return registro.id;
}

async function estudante(telefone = randomUUID(), email = randomUUID()) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO estudante (telefone_hmac, telefone_cifrado, email_hmac, email_cifrado)
     VALUES ($1, 'cifra-teste', $2, 'cifra-teste') RETURNING id`,
    [telefone, email],
  );
  return idCriado(rows);
}

async function bloco(slug = randomUUID()) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO bloco (slug, nome, base_estudantes) VALUES ($1, 'Bloco teste', 300) RETURNING id`,
    [slug],
  );
  return idCriado(rows);
}

async function pauta(slug = randomUUID(), blocoId: string | null = null) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pauta (slug, titulo, descricao, categoria, meta, bloco_id)
     VALUES ($1, 'Bibliotecas abertas', 'Melhorar iluminação', 'infraestrutura', 30, $2)
     RETURNING id`,
    [slug, blocoId],
  );
  return idCriado(rows);
}

type EventoPersistido = {
  id: string;
  pauta_id: string;
  tipo: string;
  dados: Record<string, unknown>;
  origem: string;
  publico: boolean;
  criado_em: Date;
};

async function evento(pautaId: string): Promise<EventoPersistido> {
  const fixture = {
    pauta_id: pautaId,
    tipo: 'pauta_criada',
    dados: { titulo: 'Bibliotecas abertas' },
    origem: 'curadoria',
    publico: false,
    criado_em: new Date('2026-10-26T12:00:00.123Z'),
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
  return { id: idCriado(rows), ...fixture };
}

async function buscarEvento(id: string) {
  const { rows } = await pool.query<EventoPersistido>(
    `SELECT id, pauta_id, tipo, dados, origem, publico, criado_em
     FROM evento WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function curador(email = randomUUID()) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO curador (email_hmac, email_cifrado, nome)
     VALUES ($1, 'cifra-teste', 'Curadoria teste') RETURNING id`,
    [email],
  );
  return idCriado(rows);
}

async function proposta(pautaId: string) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO proposta (pauta_id, descricao, pessoas_necessarias)
     VALUES ($1, 'Mutirão', 2) RETURNING id`,
    [pautaId],
  );
  return idCriado(rows);
}

async function promessa(pautaId: string, curadorId: string, resultado: string | null = null) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO promessa
     (pauta_id, resumo, data_entrega, fonte, registrada_por, conferencia_abre_em,
      conferencia_fecha_em, resultado)
     VALUES ($1, 'Entrega', '2026-12-01', 'Ata pública', $2, now(), now() + interval '7 days', $3)
     RETURNING id`,
    [pautaId, curadorId, resultado],
  );
  return idCriado(rows);
}

describe('migração inicial em Postgres real', () => {
  it('mantém o comando público alinhado ao runner exercitado pela suíte', async () => {
    const pacote = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    const raiz = JSON.parse(
      await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(pacote.scripts['db:migrate']).toBe(
      'tsx --env-file-if-exists=../../.env.database src/migrate.ts',
    );
    expect(raiz.scripts['db:migrate']).toBe('pnpm --filter @lumens/db db:migrate');
  });

  it('instala as 16 tabelas e reaplica o comando sem duplicar objetos', async () => {
    const tabelas = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    expect(tabelas.rows.map((r) => r.tablename)).toEqual([
      'apoio',
      'bloco',
      'caminho',
      'codigo_verificacao',
      'conversa',
      'curador',
      'estudante',
      'evento',
      'mensagem_processada',
      'papel_pauta',
      'pauta',
      'promessa',
      'proposta',
      'relato',
      'resposta_conferencia',
      'voluntario',
    ]);
    await migrarPeloComando();
    const journal = await pool.query<{ total: string }>(
      'SELECT count(*) AS total FROM drizzle.__drizzle_migrations',
    );
    expect(journal.rows[0]?.total).toBe('3');
    const registro = await evento(await pauta());
    await expect(
      pool.query('UPDATE evento SET publico = true WHERE id = $1', [registro.id]),
    ).rejects.toMatchObject({ code: 'P0001', message: 'evento é somente inserção' });
  });

  it('persiste um evento válido com todos os campos da fixture', async () => {
    const registro = await evento(await pauta());

    expect(await buscarEvento(registro.id)).toEqual(registro);
  });

  it.each([
    ['dados', { correcao: true }],
    ['publico', true],
  ] as const)('rejeita alteração de %s sem modificar o evento', async (campo, valor) => {
    const registro = await evento(await pauta());

    await expect(
      pool.query(`UPDATE evento SET ${campo} = $1 WHERE id = $2`, [valor, registro.id]),
    ).rejects.toMatchObject({ code: 'P0001', message: 'evento é somente inserção' });
    expect(await buscarEvento(registro.id)).toEqual(registro);
  });

  it('rejeita exclusão de evento sem reduzir a contagem', async () => {
    const registro = await evento(await pauta());
    const antes = await pool.query<{ total: string }>('SELECT count(*) AS total FROM evento');

    await expect(
      pool.query('DELETE FROM evento WHERE id = $1', [registro.id]),
    ).rejects.toMatchObject({ code: 'P0001', message: 'evento é somente inserção' });
    const depois = await pool.query<{ total: string }>('SELECT count(*) AS total FROM evento');
    expect(depois.rows[0]?.total).toBe(antes.rows[0]?.total);
    expect(await buscarEvento(registro.id)).toEqual(registro);
  });

  it('rejeita TRUNCATE de evento e preserva as linhas', async () => {
    const registro = await evento(await pauta());
    const antes = await pool.query<{ total: string }>('SELECT count(*) AS total FROM evento');

    await expect(pool.query('TRUNCATE evento')).rejects.toMatchObject({
      code: 'P0001',
      message: 'evento é somente inserção',
    });
    const depois = await pool.query<{ total: string }>('SELECT count(*) AS total FROM evento');
    expect(depois.rows[0]?.total).toBe(antes.rows[0]?.total);
    expect(await buscarEvento(registro.id)).toEqual(registro);
  });

  it('rejeita exclusão de pauta referenciada por evento', async () => {
    const pautaId = await pauta();
    const registro = await evento(pautaId);

    await expect(pool.query('DELETE FROM pauta WHERE id = $1', [pautaId])).rejects.toMatchObject({
      code: '23503',
      constraint: 'evento_pauta_id_pauta_id_fk',
    });
    const { rows: pautas } = await pool.query<{ existe: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pauta WHERE id = $1) AS existe',
      [pautaId],
    );
    expect(pautas[0]?.existe).toBe(true);
    expect(await buscarEvento(registro.id)).toEqual(registro);
  });

  it('preserva os nove status e os demais enums definidos no contrato', async () => {
    const { rows } = await pool.query<{ nome: string; valores: string[] }>(
      `SELECT t.typname AS nome, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS valores
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
       GROUP BY t.typname ORDER BY t.typname`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.nome, r.valores]))).toEqual({
      moderacao_relato: ['pendente', 'aprovado', 'recusado'],
      origem_apoio: ['bot', 'site'],
      origem_evento: ['bot', 'curadoria', 'agendador'],
      papel_na_pauta: ['owner', 'co_owner'],
      resposta_conferencia_valor: ['sim', 'em_parte', 'nao'],
      status_pauta: [
        'em_curadoria',
        'recusada',
        'juntando_apoios',
        'meta_batida',
        'cobrando',
        'prometido',
        'entregue_em_parte',
        'descumprida',
        'conquistada',
      ],
      status_proposta: ['aberta', 'executada'],
      tipo_caminho: ['falabr', 'comunidade', 'representante'],
    });
  });

  it.each(['telefone', 'email'] as const)(
    'rejeita %s HMAC duplicado de estudante',
    async (campo) => {
      const hmac = randomUUID();
      await estudante(
        campo === 'telefone' ? hmac : randomUUID(),
        campo === 'email' ? hmac : randomUUID(),
      );
      await expect(
        estudante(
          campo === 'telefone' ? hmac : randomUUID(),
          campo === 'email' ? hmac : randomUUID(),
        ),
      ).rejects.toMatchObject({ code: '23505', constraint: `estudante_${campo}_hmac_unique` });
    },
  );

  it('rejeita email HMAC duplicado de curador', async () => {
    const email = randomUUID();
    await curador(email);
    await expect(curador(email)).rejects.toMatchObject({
      code: '23505',
      constraint: 'curador_email_hmac_unique',
    });
  });

  it.each(['bloco', 'pauta'] as const)('rejeita slug duplicado de %s', async (tabela) => {
    const inserir = tabela === 'bloco' ? bloco : pauta;
    const slug = randomUUID();
    await inserir(slug);
    await expect(inserir(slug)).rejects.toMatchObject({
      code: '23505',
      constraint: `${tabela}_slug_unique`,
    });
  });

  it('rejeita apoio duplicado, mas permite o mesmo estudante em outra pauta', async () => {
    const estudanteId = await estudante();
    const pautaId = await pauta();
    const comando = `INSERT INTO apoio (pauta_id, estudante_id, origem) VALUES ($1, $2, 'bot')`;
    await pool.query(comando, [pautaId, estudanteId]);
    await expect(pool.query(comando, [pautaId, estudanteId])).rejects.toMatchObject({
      code: '23505',
      constraint: 'apoio_pauta_id_estudante_id_pk',
    });
    await pool.query(comando, [await pauta(), estudanteId]);
  });

  it('rejeita voluntário duplicado por proposta, permitindo outra proposta', async () => {
    const estudanteId = await estudante();
    const pautaId = await pauta();
    const propostaId = await proposta(pautaId);
    const comando = `INSERT INTO voluntario (proposta_id, estudante_id) VALUES ($1, $2)`;
    await pool.query(comando, [propostaId, estudanteId]);
    await expect(pool.query(comando, [propostaId, estudanteId])).rejects.toMatchObject({
      code: '23505',
      constraint: 'voluntario_proposta_id_estudante_id_pk',
    });
    await pool.query(comando, [await proposta(pautaId), estudanteId]);
  });

  it('rejeita resposta duplicada por promessa, permitindo outra promessa', async () => {
    const curadorId = await curador();
    const estudanteId = await estudante();
    const primeira = await promessa(await pauta(), curadorId);
    const segunda = await promessa(await pauta(), curadorId);
    const comando = `INSERT INTO resposta_conferencia (promessa_id, estudante_id, resposta)
                     VALUES ($1, $2, 'sim')`;
    await pool.query(comando, [primeira, estudanteId]);
    await expect(pool.query(comando, [primeira, estudanteId])).rejects.toMatchObject({
      code: '23505',
      constraint: 'resposta_conferencia_promessa_id_estudante_id_pk',
    });
    await pool.query(comando, [segunda, estudanteId]);
  });

  it('rejeita wamid duplicado', async () => {
    const wamid = randomUUID();
    await pool.query('INSERT INTO mensagem_processada (wamid) VALUES ($1)', [wamid]);
    await expect(
      pool.query('INSERT INTO mensagem_processada (wamid) VALUES ($1)', [wamid]),
    ).rejects.toMatchObject({ code: '23505', constraint: 'mensagem_processada_pkey' });
  });

  it.each(['default now()', 'microssegundos explícitos'])(
    'consulta e encerra um papel pela PK retornada com %s',
    async (origem) => {
      const pautaId = await pauta();
      const estudanteId = await estudante();
      if (origem === 'default now()') {
        await pool.query(
          `INSERT INTO papel_pauta (pauta_id, estudante_id, papel) VALUES ($1, $2, 'owner')`,
          [pautaId, estudanteId],
        );
      } else {
        await pool.query(
          `INSERT INTO papel_pauta (pauta_id, estudante_id, papel, desde)
           VALUES ($1, $2, 'owner', $3)`,
          [pautaId, estudanteId, '2026-10-26T12:00:00.123456Z'],
        );
      }

      const db = drizzle(pool);
      const [registro] = await db
        .select()
        .from(papeisPauta)
        .where(and(eq(papeisPauta.pautaId, pautaId), eq(papeisPauta.estudanteId, estudanteId)));
      if (!registro) throw new Error('Papel inserido não foi encontrado.');
      const chave = and(
        eq(papeisPauta.pautaId, registro.pautaId),
        eq(papeisPauta.estudanteId, registro.estudanteId),
        eq(papeisPauta.desde, registro.desde),
      );
      expect(await db.select().from(papeisPauta).where(chave)).toHaveLength(1);

      const encerradoEm = new Date('2026-10-27T12:00:00.000Z');
      const atualizados = await db
        .update(papeisPauta)
        .set({ ate: encerradoEm })
        .where(chave)
        .returning({ ate: papeisPauta.ate });
      expect(atualizados).toHaveLength(1);
      expect(atualizados[0]?.ate).toEqual(encerradoEm);
    },
  );

  it('garante uma promessa ativa por pauta e libera outra ao preencher resultado', async () => {
    const pautaId = await pauta();
    const curadorId = await curador();
    const ativa = await promessa(pautaId, curadorId);
    await expect(promessa(pautaId, curadorId)).rejects.toMatchObject({
      code: '23505',
      constraint: 'promessa_ativa_por_pauta_unique',
    });
    await promessa(await pauta(), curadorId);
    await pool.query('UPDATE promessa SET resultado = $1 WHERE id = $2', ['sim', ativa]);
    await promessa(pautaId, curadorId);
    await promessa(pautaId, curadorId, 'nao');
    await promessa(pautaId, curadorId, 'em_parte');
  });

  it('recusa referências inexistentes e protege registros referenciados', async () => {
    const blocoId = await bloco();
    const pautaId = await pauta(randomUUID(), blocoId);
    await expect(pauta(randomUUID(), randomUUID())).rejects.toMatchObject({
      code: '23503',
      constraint: 'pauta_bloco_id_bloco_id_fk',
    });
    await expect(pool.query('DELETE FROM bloco WHERE id = $1', [blocoId])).rejects.toMatchObject({
      code: '23503',
      constraint: 'pauta_bloco_id_bloco_id_fk',
    });
    const estudanteId = await estudante();
    await pool.query(`INSERT INTO apoio (pauta_id, estudante_id, origem) VALUES ($1, $2, 'site')`, [
      pautaId,
      estudanteId,
    ]);
    await expect(
      pool.query('DELETE FROM estudante WHERE id = $1', [estudanteId]),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'apoio_estudante_id_estudante_id_fk',
    });
    const { rows } = await pool.query<{ confdeltype: string }>(
      `SELECT confdeltype FROM pg_constraint WHERE contype = 'f'
       AND connamespace = 'public'::regnamespace`,
    );
    expect(rows).toHaveLength(16);
    expect(rows.every((r) => r.confdeltype === 'r')).toBe(true);
  });

  it('rejeita campos obrigatórios ausentes e status inválido', async () => {
    await expect(pool.query('INSERT INTO pauta DEFAULT VALUES')).rejects.toMatchObject({
      code: '23502',
      column: 'slug',
    });
    await expect(
      pool.query('UPDATE pauta SET status = $1 WHERE id = $2', ['inexistente', await pauta()]),
    ).rejects.toMatchObject({ code: '22P02' });
  });

  it('aplica defaults de criação e mantém a meta após alteração do bloco', async () => {
    const blocoId = await bloco();
    const pautaId = await pauta(randomUUID(), blocoId);
    await pool.query('UPDATE bloco SET base_estudantes = 1000 WHERE id = $1', [blocoId]);
    const { rows } = await pool.query<{ status: string; meta: number; criada_em: Date }>(
      'SELECT status, meta, criada_em FROM pauta WHERE id = $1',
      [pautaId],
    );
    expect(rows[0]?.status).toBe('em_curadoria');
    expect(rows[0]?.meta).toBe(30);
    expect(rows[0]?.criada_em).toBeInstanceOf(Date);
    const { rows: criacoes } = await pool.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns WHERE table_schema = 'public'
       AND column_name IN ('criado_em', 'criada_em', 'desde', 'aberto_em', 'recebida_em', 'atualizado_em')`,
    );
    expect(criacoes).toHaveLength(9);
    expect(criacoes.every((r) => r.column_default === 'now()')).toBe(true);
  });

  it('busca título/descrição em português e atualiza o vetor automaticamente', async () => {
    const id = await pauta();
    for (const termo of ['biblioteca', 'iluminação']) {
      const { rows } = await pool.query<{ achou: boolean }>(
        `SELECT busca @@ plainto_tsquery('portuguese', $1) AS achou FROM pauta WHERE id = $2`,
        [termo, id],
      );
      expect(rows[0]?.achou).toBe(true);
    }
    await pool.query('UPDATE pauta SET titulo = $1, descricao = $2 WHERE id = $3', [
      'Restaurantes',
      'Comida',
      id,
    ]);
    const { rows } = await pool.query<{ antigo: boolean; novo: boolean }>(
      `SELECT busca @@ plainto_tsquery('portuguese', 'biblioteca') AS antigo,
       busca @@ plainto_tsquery('portuguese', 'restaurante') AS novo FROM pauta WHERE id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({ antigo: false, novo: true });
  });

  it('instala índices de busca, status e linha do tempo', async () => {
    const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const indices = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
    expect(indices.pauta_busca_idx).toContain('USING gin (busca)');
    expect(indices.pauta_status_idx).toContain('(status)');
    expect(indices.pauta_bloco_id_idx).toContain('(bloco_id)');
    expect(indices.evento_pauta_criado_em_idx).toContain('(pauta_id, criado_em)');
    expect(indices.promessa_ativa_por_pauta_unique).toContain('WHERE (resultado IS NULL)');
  });

  it('não cria colunas de telefone/email em texto puro', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public'
       AND (column_name LIKE '%telefone%' OR column_name LIKE '%email%')`,
    );
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => /_(hmac|cifrado)$/.test(r.column_name))).toBe(true);
  });
});

it('importa o pacote sem configuração de banco nem abertura de conexão', async () => {
  await executar(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', "await import('./src/index.ts')"],
    {
      cwd: pastaDb,
      env: { ...process.env, DATABASE_URL: '', DATABASE_URL_TESTE: '' },
      timeout: 10_000,
    },
  );
});
