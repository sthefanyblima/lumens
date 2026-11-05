import { randomUUID } from 'node:crypto';
import { type SQL, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { executarSeed } from '../seed/index';
import { PAPEL_SITE } from './app-role';
import type { Db } from './client';
import { criarBancoEmMemoria } from './teste';

// Contrato com o site (SCRUM-87). Os valores esperados saem do ticket e do seed escrito à mão
// (`seed/data.ts`), conferidos linha a linha — nunca da própria view.
const VIEWS = [
  'v_atividade',
  'v_caminho_publico',
  'v_conquista',
  'v_linha_do_tempo',
  'v_pauta_publica',
  'v_relato_publico',
  'v_resumo',
] as const;
const PAUTA_EM_CURADORIA = 'mais-arvores-no-campus';
const PAUTA_RECUSADA = 'tomadas-nas-mesas-da-biblioteca';
const PAUTAS_PUBLICAS = [
  'acessibilidade-no-bloco-18',
  'bebedouros-no-bloco-18',
  'biblioteca-aberta-aos-sabados',
  'iluminacao-no-bloco-de-artes',
  'internet-na-residencia',
  'laboratorios-abertos-nas-engenharias',
  'sala-de-descanso-na-saude',
];

async function consultar<T>(db: Db, consulta: SQL): Promise<T[]> {
  const resultado: unknown = await db.execute(consulta);
  return (resultado as { rows: T[] }).rows;
}

/** Roda a consulta com os privilégios de `lumens_site`, como faria a conexão do site. */
async function comoSite<T>(db: Db, consulta: SQL): Promise<T[]> {
  await db.execute(sql.raw(`SET ROLE "${PAPEL_SITE}"`));
  try {
    return await consultar<T>(db, consulta);
  } finally {
    await db.execute(sql`RESET ROLE`);
  }
}

/** SQLSTATE do erro, venha ele direto do driver ou embrulhado pelo Drizzle em `cause`. */
async function codigoDoErro(promessa: Promise<unknown>): Promise<string | undefined> {
  try {
    await promessa;
  } catch (erro) {
    const { code, cause } = erro as { code?: string; cause?: { code?: string } };
    return cause?.code ?? code;
  }
  throw new Error('A consulta deveria ter falhado.');
}

/** `db.execute` no PGlite devolve timestamptz como texto; normaliza para ISO em UTC. */
function instante(valor: unknown) {
  return new Date(valor as string | Date).toISOString();
}

async function idDaPauta(db: Db, slug: string) {
  const [linha] = await consultar<{ id: string }>(
    db,
    sql`SELECT id FROM pauta WHERE slug = ${slug}`,
  );
  if (!linha) throw new Error(`Pauta ${slug} ausente do seed.`);
  return linha.id;
}

describe('views públicas com o seed', () => {
  let db: Db;

  beforeAll(async () => {
    db = await criarBancoEmMemoria();
    await executarSeed(db);
  }, 60_000);

  it('instala exatamente as sete views públicas', async () => {
    const linhas = await consultar<{ table_name: string }>(
      db,
      sql`SELECT table_name FROM information_schema.views
          WHERE table_schema = 'public' ORDER BY table_name`,
    );

    expect(linhas.map((l) => l.table_name)).toEqual([...VIEWS]);
  });

  describe('privilégios de lumens_site', () => {
    it.each(VIEWS)('lê %s', async (view) => {
      await expect(
        comoSite(db, sql`SELECT * FROM ${sql.identifier(view)}`),
      ).resolves.toBeInstanceOf(Array);
    });

    it('recebe permission denied em toda tabela do schema public', async () => {
      const tabelas = await consultar<{ tablename: string }>(
        db,
        sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      );
      // Sem isso o laço abaixo passaria vazio se a consulta ao catálogo quebrasse.
      expect(tabelas.map((t) => t.tablename)).toEqual(
        expect.arrayContaining(['estudante', 'relato', 'apoio', 'curador', 'conversa', 'disparo']),
      );

      for (const { tablename } of tabelas) {
        expect(
          await codigoDoErro(comoSite(db, sql`SELECT * FROM ${sql.identifier(tablename)} LIMIT 1`)),
          tablename,
        ).toBe('42501');
      }
    });

    it('recebe permission denied em SELECT * FROM estudante', async () => {
      expect(await codigoDoErro(comoSite(db, sql`SELECT * FROM estudante`))).toBe('42501');
    });

    it('tem só SELECT, e só nas sete views', async () => {
      const linhas = await consultar<{ table_name: string; privilege_type: string }>(
        db,
        sql`SELECT table_name, privilege_type FROM information_schema.role_table_grants
            WHERE grantee = ${PAPEL_SITE} ORDER BY table_name, privilege_type`,
      );

      expect(linhas).toEqual(VIEWS.map((view) => ({ table_name: view, privilege_type: 'SELECT' })));
    });

    it('não alcança tabela nem view criadas depois da migração', async () => {
      const sufixo = randomUUID().replaceAll('-', '');
      const tabela = `lumens_test_futura_${sufixo}`;
      const view = `v_lumens_test_futura_${sufixo}`;
      await db.execute(sql`CREATE TABLE ${sql.identifier(tabela)} (valor text)`);
      await db.execute(
        sql`CREATE VIEW ${sql.identifier(view)} AS SELECT valor FROM ${sql.identifier(tabela)}`,
      );
      try {
        expect(await codigoDoErro(comoSite(db, sql`SELECT * FROM ${sql.identifier(tabela)}`))).toBe(
          '42501',
        );
        expect(await codigoDoErro(comoSite(db, sql`SELECT * FROM ${sql.identifier(view)}`))).toBe(
          '42501',
        );
      } finally {
        await db.execute(sql`DROP VIEW ${sql.identifier(view)}`);
        await db.execute(sql`DROP TABLE ${sql.identifier(tabela)}`);
      }
    });

    it('não escreve nas views', async () => {
      expect(
        await codigoDoErro(comoSite(db, sql`DELETE FROM v_relato_publico WHERE true`)),
      ).toBeDefined();
    });
  });

  describe('colunas das views', () => {
    it('nenhuma coluna tem telefone, e-mail, HMAC, cifra ou id', async () => {
      const colunas = await consultar<{ table_name: string; column_name: string }>(
        db,
        sql`SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name IN (
              SELECT table_name FROM information_schema.views WHERE table_schema = 'public'
            )`,
      );
      // Mesma contagem de views: garante que a consulta enxergou as colunas de todas elas.
      expect(new Set(colunas.map((c) => c.table_name))).toEqual(new Set(VIEWS));

      const proibidas = colunas.filter(({ column_name }) =>
        /telefone|email|hmac|cifrado|estudante_id|(^|_)id$/.test(column_name),
      );
      expect(proibidas).toEqual([]);
    });

    it('marca todas como security_barrier e nenhuma como security_invoker', async () => {
      const linhas = await consultar<{ relname: string; reloptions: string[] | null }>(
        db,
        sql`SELECT relname, reloptions FROM pg_class
            WHERE relkind = 'v' AND relnamespace = 'public'::regnamespace ORDER BY relname`,
      );

      expect(linhas).toEqual(
        VIEWS.map((view) => ({ relname: view, reloptions: ['security_barrier=true'] })),
      );
    });
  });

  describe('dados', () => {
    it('v_resumo soma só as pautas públicas', async () => {
      const linhas = await comoSite(db, sql`SELECT * FROM v_resumo`);

      // Abertas: juntando_apoios, meta_batida, cobrando e prometido. Apoios das sete pautas
      // públicas: 72 + 30 + 84 + 68 + 124 + 300 + 300; os 4 da recusada ficam de fora.
      expect(linhas).toEqual([{ pautas_abertas: 4, apoios: 978, conquistas: 1 }]);
    });

    it('v_pauta_publica esconde as pautas em curadoria e recusadas', async () => {
      const linhas = await comoSite<{ slug: string }>(
        db,
        sql`SELECT slug FROM v_pauta_publica ORDER BY slug`,
      );
      const slugs = linhas.map((l) => l.slug);

      expect(slugs).toEqual(PAUTAS_PUBLICAS);
      expect(slugs).not.toContain(PAUTA_EM_CURADORIA);
      expect(slugs).not.toContain(PAUTA_RECUSADA);
    });

    it('v_pauta_publica entrega bloco, meta, apoios e cursos dos responsáveis', async () => {
      const linhas = await comoSite(
        db,
        sql`SELECT slug, status, meta, apoios, bloco_slug, bloco_nome, cursos_responsaveis
            FROM v_pauta_publica WHERE slug IN ('bebedouros-no-bloco-18', 'biblioteca-aberta-aos-sabados')
            ORDER BY slug`,
      );

      expect(linhas).toEqual([
        {
          slug: 'bebedouros-no-bloco-18',
          status: 'juntando_apoios',
          meta: 120,
          apoios: 72,
          bloco_slug: 'bloco-18',
          bloco_nome: 'Bloco 18 (fictício)',
          cursos_responsaveis: ['Jornalismo', 'Pedagogia'],
        },
        {
          slug: 'biblioteca-aberta-aos-sabados',
          status: 'meta_batida',
          meta: 30,
          apoios: 30,
          bloco_slug: 'biblioteca-central',
          bloco_nome: 'Biblioteca Central',
          cursos_responsaveis: ['Arquitetura e Urbanismo', 'Ciência da Computação'],
        },
      ]);
    });

    it('v_pauta_publica deriva a próxima etapa do status', async () => {
      const linhas = await comoSite<{ slug: string; proxima_etapa: string | null }>(
        db,
        sql`SELECT slug, proxima_etapa FROM v_pauta_publica`,
      );

      expect(Object.fromEntries(linhas.map((l) => [l.slug, l.proxima_etapa]))).toEqual({
        'bebedouros-no-bloco-18': 'Faltam 48 apoios',
        'biblioteca-aberta-aos-sabados': 'Aguardando o encaminhamento',
        'iluminacao-no-bloco-de-artes': 'Prazo do Fala.BR em 20/03',
        'sala-de-descanso-na-saude': 'Entrega prometida para 30/04',
        'acessibilidade-no-bloco-18': 'Cobrar o restante',
        'internet-na-residencia': 'Retomar a cobrança',
        'laboratorios-abertos-nas-engenharias': null,
      });
    });

    it('v_relato_publico mostra só relatos aprovados, com o curso de quem relatou', async () => {
      const linhas = await comoSite(
        db,
        sql`SELECT pauta_slug, texto, curso FROM v_relato_publico ORDER BY pauta_slug`,
      );

      // O pendente (sala de descanso) e o recusado (pauta recusada) não aparecem.
      expect(linhas).toEqual([
        {
          pauta_slug: 'bebedouros-no-bloco-18',
          texto: 'O bebedouro do segundo andar está sem refrigeração há semanas.',
          curso: 'Jornalismo',
        },
        {
          pauta_slug: 'iluminacao-no-bloco-de-artes',
          texto: 'A saída das aulas noturnas fica muito escura perto do ponto.',
          curso: 'Pedagogia',
        },
        {
          pauta_slug: 'internet-na-residencia',
          texto: 'A conexão cai principalmente no período da noite.',
          curso: 'Arquitetura e Urbanismo',
        },
      ]);
    });

    it('v_caminho_publico traz caminhos com prazo e propostas com voluntários', async () => {
      const linhas = await comoSite(
        db,
        sql`SELECT pauta_slug, tipo, status, protocolo, prazo::text AS prazo,
                   pessoas_necessarias, voluntarios
            FROM v_caminho_publico WHERE pauta_slug = 'iluminacao-no-bloco-de-artes'
            ORDER BY tipo`,
      );
      const [{ total } = { total: 0 }] = await comoSite<{ total: number }>(
        db,
        sql`SELECT count(*)::int AS total FROM v_caminho_publico`,
      );

      expect(linhas).toEqual([
        {
          pauta_slug: 'iluminacao-no-bloco-de-artes',
          tipo: 'falabr',
          status: 'em análise',
          protocolo: 'SEED-FALABR-2026-0001',
          prazo: '2026-03-20',
          pessoas_necessarias: null,
          voluntarios: null,
        },
        {
          pauta_slug: 'iluminacao-no-bloco-de-artes',
          tipo: 'proposta',
          status: 'executada',
          protocolo: null,
          prazo: null,
          pessoas_necessarias: 6,
          voluntarios: 2,
        },
      ]);
      // Cinco caminhos e três propostas, todos de pautas públicas.
      expect(total).toBe(8);
    });

    it('v_linha_do_tempo traz só os eventos públicos das pautas públicas', async () => {
      const linhas = await comoSite<{ pauta_slug: string; tipo: string }>(
        db,
        sql`SELECT pauta_slug, tipo FROM v_linha_do_tempo`,
      );

      // Uma transição pública por passo do percurso das sete pautas: 1+2+3+4+5+5+5.
      expect(linhas).toHaveLength(25);
      expect(linhas.every((l) => l.tipo === 'status_alterado')).toBe(true);
      // `pauta_criada` é não público (catálogo da T7).
      expect(linhas.some((l) => l.tipo === 'pauta_criada')).toBe(false);
      expect(new Set(linhas.map((l) => l.pauta_slug))).toEqual(new Set(PAUTAS_PUBLICAS));
    });

    it('v_conquista traz a data, os apoios e se houve proposta executada', async () => {
      const linhas = await comoSite<{ conquistada_em: unknown }>(
        db,
        sql`SELECT * FROM v_conquista`,
      );

      expect(linhas.map((l) => ({ ...l, conquistada_em: instante(l.conquistada_em) }))).toEqual([
        {
          pauta_slug: 'laboratorios-abertos-nas-engenharias',
          titulo: 'Laboratórios de informática abertos no contraturno',
          bloco_nome: 'Bloco das Engenharias (fictício)',
          conquistada_em: '2026-03-19T12:00:00.000Z',
          apoios: 300,
          proposta_executada: false,
        },
      ]);
    });

    it('v_atividade começa pelo evento público mais recente', async () => {
      const linhas = await comoSite<{ pauta_slug: string; criado_em: unknown }>(
        db,
        sql`SELECT pauta_slug, criado_em FROM v_atividade ORDER BY criado_em DESC`,
      );

      expect(linhas).toHaveLength(25);
      expect(linhas[0]?.pauta_slug).toBe('acessibilidade-no-bloco-18');
      expect(instante(linhas[0]?.criado_em)).toBe('2026-03-24T12:00:00.000Z');
    });
  });
});

describe('views públicas com dados além do seed', () => {
  let db: Db;

  beforeAll(async () => {
    db = await criarBancoEmMemoria();
    await executarSeed(db);
  }, 60_000);

  it('não vaza evento público de pauta em curadoria', async () => {
    const pautaId = await idDaPauta(db, PAUTA_EM_CURADORIA);
    await db.execute(
      sql`INSERT INTO evento (pauta_id, tipo, dados, origem, publico)
          VALUES (${pautaId}, 'pauta_aprovada', '{}', 'curadoria', true)`,
    );

    for (const view of ['v_linha_do_tempo', 'v_atividade']) {
      const linhas = await comoSite<{ pauta_slug: string }>(
        db,
        sql`SELECT pauta_slug FROM ${sql.identifier(view)} WHERE pauta_slug = ${PAUTA_EM_CURADORIA}`,
      );
      expect(linhas, view).toEqual([]);
    }
  });

  it('não mostra evento não público de pauta pública', async () => {
    const pautaId = await idDaPauta(db, 'bebedouros-no-bloco-18');
    const tipo = `teste_privado_${randomUUID().replaceAll('-', '')}`;
    await db.execute(
      sql`INSERT INTO evento (pauta_id, tipo, origem, publico)
          VALUES (${pautaId}, ${tipo}, 'curadoria', false)`,
    );

    for (const view of ['v_linha_do_tempo', 'v_atividade']) {
      const linhas = await comoSite(
        db,
        sql`SELECT tipo FROM ${sql.identifier(view)} WHERE tipo = ${tipo}`,
      );
      expect(linhas, view).toEqual([]);
    }
  });

  it('não mostra relato aprovado de pauta em curadoria', async () => {
    const pautaId = await idDaPauta(db, PAUTA_EM_CURADORIA);
    const texto = `Relato aprovado de pauta escondida ${randomUUID()}`;
    await db.execute(
      sql`INSERT INTO relato (pauta_id, estudante_id, texto, moderacao)
          SELECT ${pautaId}, id, ${texto}, 'aprovado' FROM estudante LIMIT 1`,
    );

    const linhas = await comoSite(
      db,
      sql`SELECT texto FROM v_relato_publico WHERE texto = ${texto}`,
    );
    expect(linhas).toEqual([]);
  });

  it('diz "Falta 1 apoio" no singular e "Meta alcançada" quando não falta nenhum', async () => {
    const pautaId = await idDaPauta(db, 'bebedouros-no-bloco-18');
    const etapa = async () => {
      const [linha] = await comoSite<{ proxima_etapa: string }>(
        db,
        sql`SELECT proxima_etapa FROM v_pauta_publica WHERE slug = 'bebedouros-no-bloco-18'`,
      );
      return linha?.proxima_etapa;
    };
    // A pauta tem meta 120 e 72 apoios dos estudantes 1 a 72 do seed.
    const apoiar = (quantidade: number) =>
      db.execute(
        sql`INSERT INTO apoio (pauta_id, estudante_id, origem)
            SELECT ${pautaId}, e.id, 'site' FROM estudante e
            WHERE NOT EXISTS (
              SELECT 1 FROM apoio a WHERE a.pauta_id = ${pautaId} AND a.estudante_id = e.id
            )
            ORDER BY e.id LIMIT ${quantidade}`,
      );

    await apoiar(47);
    expect(await etapa()).toBe('Falta 1 apoio');
    await apoiar(1);
    expect(await etapa()).toBe('Meta alcançada');
  });

  it('v_atividade limita aos 50 eventos públicos mais recentes', async () => {
    const pautaId = await idDaPauta(db, 'bebedouros-no-bloco-18');
    await db.execute(
      sql`INSERT INTO evento (pauta_id, tipo, origem, publico, criado_em)
          SELECT ${pautaId}, 'teste_volume', 'curadoria', true,
                 '2027-01-01T00:00:00Z'::timestamptz + n * interval '1 minute'
          FROM generate_series(1, 60) AS n`,
    );

    const linhas = await comoSite<{ tipo: string; criado_em: unknown }>(
      db,
      sql`SELECT tipo, criado_em FROM v_atividade ORDER BY criado_em DESC`,
    );

    expect(linhas).toHaveLength(50);
    expect(linhas.every((l) => l.tipo === 'teste_volume')).toBe(true);
    expect(instante(linhas[0]?.criado_em)).toBe('2027-01-01T01:00:00.000Z');
  });

  it('não mostra caminho nem proposta de pauta em curadoria ou recusada', async () => {
    for (const slug of [PAUTA_EM_CURADORIA, PAUTA_RECUSADA]) {
      const pautaId = await idDaPauta(db, slug);
      await db.execute(
        sql`INSERT INTO caminho (pauta_id, tipo, status, protocolo, prazo)
            VALUES (${pautaId}, 'falabr', 'em análise', 'ESCONDIDO-1', '2026-12-01')`,
      );
      await db.execute(
        sql`INSERT INTO proposta (pauta_id, descricao, pessoas_necessarias)
            VALUES (${pautaId}, 'Proposta de pauta escondida', 3)`,
      );
    }

    const linhas = await comoSite(
      db,
      sql`SELECT pauta_slug, tipo FROM v_caminho_publico
          WHERE pauta_slug IN (${PAUTA_EM_CURADORIA}, ${PAUTA_RECUSADA})`,
    );
    expect(linhas).toEqual([]);
  });

  it('usa o Fala.BR aberto por último, mesmo quando ele ainda não tem prazo', async () => {
    const slug = 'iluminacao-no-bloco-de-artes';
    const pautaId = await idDaPauta(db, slug);
    const etapa = async () => {
      const [linha] = await comoSite<{ proxima_etapa: string }>(
        db,
        sql`SELECT proxima_etapa FROM v_pauta_publica WHERE slug = ${slug}`,
      );
      return linha?.proxima_etapa;
    };
    // O seed já tem um Fala.BR aberto em 10/02/2026 com prazo 20/03.
    await db.execute(
      sql`INSERT INTO caminho (pauta_id, tipo, status, aberto_em)
          VALUES (${pautaId}, 'falabr', 'aberto', '2026-04-01T12:00:00Z')`,
    );
    expect(await etapa()).toBe('Aguardando resposta');

    await db.execute(
      sql`INSERT INTO caminho (pauta_id, tipo, status, protocolo, prazo, aberto_em)
          VALUES (${pautaId}, 'falabr', 'em análise', 'NOVO-1', '2026-06-15', '2026-05-01T12:00:00Z')`,
    );
    expect(await etapa()).toBe('Prazo do Fala.BR em 15/06');
  });

  it('mostra o curso só de quem tem mandato ativo', async () => {
    const slug = 'biblioteca-aberta-aos-sabados';
    const pautaId = await idDaPauta(db, slug);
    // Nenhum responsável do seed nesta pauta é de Direito ou Enfermagem.
    await db.execute(
      sql`INSERT INTO papel_pauta (pauta_id, estudante_id, papel, desde, ate)
          SELECT ${pautaId}, id, 'co_owner', '2026-02-01T00:00:00Z', '2026-02-10T00:00:00Z'
          FROM estudante WHERE curso = 'Direito' ORDER BY id LIMIT 1`,
    );
    await db.execute(
      sql`INSERT INTO papel_pauta (pauta_id, estudante_id, papel)
          SELECT ${pautaId}, id, 'co_owner'
          FROM estudante WHERE curso = 'Enfermagem' ORDER BY id LIMIT 1`,
    );

    const [linha] = await comoSite<{ cursos_responsaveis: string[] }>(
      db,
      sql`SELECT cursos_responsaveis FROM v_pauta_publica WHERE slug = ${slug}`,
    );
    expect(linha?.cursos_responsaveis).toEqual([
      'Arquitetura e Urbanismo',
      'Ciência da Computação',
      'Enfermagem',
    ]);
  });

  it('v_resumo não conta apoio de pauta em curadoria', async () => {
    const apoios = async () => {
      const [linha] = await comoSite<{ apoios: number }>(db, sql`SELECT apoios FROM v_resumo`);
      return linha?.apoios;
    };
    const antes = await apoios();
    const pautaId = await idDaPauta(db, PAUTA_EM_CURADORIA);
    await db.execute(
      sql`INSERT INTO apoio (pauta_id, estudante_id, origem)
          SELECT ${pautaId}, id, 'site' FROM estudante ORDER BY id LIMIT 5`,
    );

    expect(antes).toBeGreaterThan(0);
    expect(await apoios()).toBe(antes);
  });

  it('tira de dados as chaves de id interno', async () => {
    const pautaId = await idDaPauta(db, 'bebedouros-no-bloco-18');
    const tipo = `teste_dados_${randomUUID().replaceAll('-', '')}`;
    await db.execute(
      sql`INSERT INTO evento (pauta_id, tipo, dados, origem, publico, criado_em)
          VALUES (${pautaId}, ${tipo},
                  ${JSON.stringify({ caminho_id: randomUUID(), id: 'x', protocolo: 'P-1', tipo: 'falabr' })}::jsonb,
                  'curadoria', true, '2030-01-01T00:00:00Z')`,
    );

    for (const view of ['v_linha_do_tempo', 'v_atividade']) {
      const linhas = await comoSite<{ dados: unknown }>(
        db,
        sql`SELECT dados FROM ${sql.identifier(view)} WHERE tipo = ${tipo}`,
      );
      expect(linhas, view).toEqual([{ dados: { protocolo: 'P-1', tipo: 'falabr' } }]);

      const chaves = await comoSite<{ chave: string }>(
        db,
        sql`SELECT DISTINCT jsonb_object_keys(dados) AS chave FROM ${sql.identifier(view)}`,
      );
      expect(
        chaves.filter(({ chave }) => /(^|_)id$/.test(chave)),
        view,
      ).toEqual([]);
    }
  });
});
