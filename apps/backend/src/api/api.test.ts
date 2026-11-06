import {
  atividade,
  blocos,
  conquistas,
  erro,
  pautaDetalhe,
  pautas,
  resumo,
  SLUG_MAX,
} from '@lumens/contratos';
import { sql, type Db } from '@lumens/db';
import { executarSeed } from '@lumens/db/seed';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import Fastify, { type FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../app';
import { FakeQueue } from '../queue.fake';
import { apiPlugin, CACHE_PUBLICO } from './routes';

// Os valores esperados saem do seed escrito à mão (`packages/db/seed/data.ts`) e das asserções
// de `packages/db/src/views-publicas.test.ts` — nunca da própria API.

const SITE = 'https://lumens-ufal.vercel.app';
const PAUTA_EM_CURADORIA = 'mais-arvores-no-campus';
const PAUTA_RECUSADA = 'tomadas-nas-mesas-da-biblioteca';
/** As sete pautas públicas na ordem da lista: mais apoios; no empate, a criada por último. */
const PAUTAS_EM_ORDEM = [
  'laboratorios-abertos-nas-engenharias', // 300 apoios, criada em 10/02
  'internet-na-residencia', // 300 apoios, criada em 09/02
  'acessibilidade-no-bloco-18', // 124
  'iluminacao-no-bloco-de-artes', // 84
  'bebedouros-no-bloco-18', // 72
  'sala-de-descanso-na-saude', // 68
  'biblioteca-aberta-aos-sabados', // 30
];
/** Chaves que nunca podem sair da API (RNF01). */
const CHAVE_PROIBIDA = /telefone|email|hmac|cifr|estudante_id|(^|_)id$/;

/** PGlite com as migrações e o seed, consultado como `lumens_site`: só as views são legíveis. */
async function bancoDoSite(antesDoPapel?: (db: Db) => Promise<void>): Promise<Db> {
  const db = await criarBancoEmMemoria();
  await executarSeed(db);
  await antesDoPapel?.(db);
  await db.execute(sql.raw('SET ROLE "lumens_site"'));
  return db;
}

function montarApp(db: Db): Promise<FastifyInstance> {
  return buildApp({
    config: { verifyToken: 'verify', appSecret: 'segredo' },
    db,
    queue: new FakeQueue(),
    logger: pino({ level: 'silent' }),
    chaves: { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) },
    leitura: { db, origensCors: [SITE, 'http://localhost:3000'] },
  });
}

/** Banco falso que devolve as linhas dadas, uma lista por consulta, na ordem das consultas. */
function bancoFalso(...respostas: unknown[][]): Db {
  const fila = [...respostas];
  return {
    execute: () => Promise.resolve({ rows: fila.shift() ?? [] }),
  } as unknown as Db;
}

/**
 * Confere que o corpo tem exatamente as chaves do contrato, em todos os níveis. O `parse` do zod
 * sozinho aceitaria chave a mais; `dados` (record aberto) fica de fora.
 */
function conferirChaves(esquema: z.ZodType, valor: unknown, caminho = '$'): void {
  if (valor === null) return;
  if (esquema instanceof z.ZodNullable || esquema instanceof z.ZodOptional) {
    conferirChaves(esquema.unwrap() as z.ZodType, valor, caminho);
  } else if (esquema instanceof z.ZodArray) {
    (valor as unknown[]).forEach((item, i) => {
      conferirChaves(esquema.element as z.ZodType, item, `${caminho}[${String(i)}]`);
    });
  } else if (esquema instanceof z.ZodObject) {
    const forma = esquema.shape as Record<string, z.ZodType>;
    expect(Object.keys(valor as object).sort(), caminho).toEqual(Object.keys(forma).sort());
    for (const [chave, filho] of Object.entries(forma)) {
      conferirChaves(filho, (valor as Record<string, unknown>)[chave], `${caminho}.${chave}`);
    }
  }
}

function conferirContrato(esquema: z.ZodType, corpo: unknown) {
  expect(esquema.safeParse(corpo).error).toBeUndefined();
  conferirChaves(esquema, corpo);
}

function chavesDe(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(chavesDe);
  if (valor !== null && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([chave, filho]) => [chave, ...chavesDe(filho)]);
  }
  return [];
}

describe('API de leitura pública com o seed', () => {
  let db: Db;
  let app: FastifyInstance;
  const get = (url: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url, headers });
  const corpo = async (url: string): Promise<unknown> => {
    const res = await get(url);
    expect(res.statusCode, url).toBe(200);
    return res.json();
  };

  beforeAll(async () => {
    db = await bancoDoSite();
    app = await montarApp(db);
  }, 60_000);
  afterAll(async () => {
    await app.close();
  });

  it('a conexão dos testes é a do site: tabela dá permission denied', async () => {
    // Sem isso, os testes abaixo passariam mesmo se a API lesse tabelas.
    await expect(db.execute(sql`SELECT 1 FROM estudante LIMIT 1`)).rejects.toMatchObject({
      cause: { code: '42501' },
    });
  });

  describe('GET /resumo', () => {
    it('devolve os totais das pautas públicas', async () => {
      const body = await corpo('/resumo');

      expect(body).toEqual({ pautas_abertas: 4, apoios: 978, conquistas: 1 });
      conferirContrato(resumo, body);
    });
  });

  describe('GET /blocos', () => {
    it('lista todos os blocos em ordem de nome', async () => {
      const body = await corpo('/blocos');

      expect(body).toEqual({
        itens: [
          { slug: 'biblioteca-central', nome: 'Biblioteca Central', base_estudantes: 120 },
          { slug: 'bloco-18', nome: 'Bloco 18 (fictício)', base_estudantes: 1200 },
          { slug: 'saude', nome: 'Bloco da Saúde (fictício)', base_estudantes: 650 },
          { slug: 'engenharias', nome: 'Bloco das Engenharias (fictício)', base_estudantes: 5000 },
          { slug: 'artes', nome: 'Bloco de Artes (fictício)', base_estudantes: 800 },
          {
            slug: 'residencia-universitaria',
            nome: 'Residência Universitária',
            base_estudantes: 3000,
          },
        ],
      });
      conferirContrato(blocos, body);
    });
  });

  describe('GET /pautas', () => {
    const slugs = (body: unknown) =>
      (body as { itens: { slug: string }[] }).itens.map((p) => p.slug);

    it('sem filtro, devolve as sete pautas públicas por apoios e data de criação', async () => {
      const body = await corpo('/pautas');

      expect(slugs(body)).toEqual(PAUTAS_EM_ORDEM);
      expect((body as { proximo: unknown }).proximo).toBeNull();
      conferirContrato(pautas, body);
    });

    it('entrega os campos da pauta como no seed', async () => {
      const body = (await corpo('/pautas?bloco=biblioteca-central')) as { itens: unknown[] };

      // A recusada também é da Biblioteca Central e fica de fora.
      expect(body.itens).toEqual([
        {
          slug: 'biblioteca-aberta-aos-sabados',
          titulo: 'Biblioteca aberta aos sábados',
          descricao: 'Ampliar o horário da biblioteca durante o período letivo e de provas.',
          categoria: 'servicos',
          status: 'meta_batida',
          meta: 30,
          apoios: 30,
          bloco_slug: 'biblioteca-central',
          bloco_nome: 'Biblioteca Central',
          cursos_responsaveis: ['Arquitetura e Urbanismo', 'Ciência da Computação'],
          criada_em: '2026-02-05T12:00:00.000Z',
          aprovada_em: '2026-02-06T12:00:00.000Z',
          meta_batida_em: '2026-02-07T12:00:00.000Z',
          proxima_etapa: 'Aguardando o encaminhamento',
        },
      ]);
    });

    it('com bloco, devolve só as pautas daquele bloco', async () => {
      const body = await corpo('/pautas?bloco=bloco-18');

      expect(slugs(body)).toEqual(['acessibilidade-no-bloco-18', 'bebedouros-no-bloco-18']);
      conferirContrato(pautas, body);
    });

    it('bloco desconhecido, com formato válido, devolve lista vazia', async () => {
      expect(await corpo('/pautas?bloco=bloco-que-nao-existe')).toEqual({
        itens: [],
        proximo: null,
      });
    });

    it('pagina com limit e offset e diz o offset da próxima página', async () => {
      expect(await corpo('/pautas?limit=2')).toMatchObject({ proximo: 2 });
      expect(slugs(await corpo('/pautas?limit=2'))).toEqual(PAUTAS_EM_ORDEM.slice(0, 2));

      const segunda = await corpo('/pautas?limit=2&offset=2');
      expect(slugs(segunda)).toEqual(PAUTAS_EM_ORDEM.slice(2, 4));
      expect(segunda).toMatchObject({ proximo: 4 });

      const ultima = await corpo('/pautas?limit=2&offset=6');
      expect(slugs(ultima)).toEqual(PAUTAS_EM_ORDEM.slice(6));
      expect(ultima).toMatchObject({ proximo: null });

      // Página que termina exatamente na última pauta não aponta para uma página vazia.
      expect(await corpo('/pautas?limit=7')).toMatchObject({ proximo: null });
      expect(await corpo('/pautas?offset=50')).toEqual({ itens: [], proximo: null });
    });

    it('aceita limit 100, o máximo', async () => {
      expect(slugs(await corpo('/pautas?limit=100'))).toEqual(PAUTAS_EM_ORDEM);
    });
  });

  describe('GET /pautas/:slug', () => {
    it('junta pauta, relatos, caminhos e linha do tempo', async () => {
      const body = await corpo('/pautas/iluminacao-no-bloco-de-artes');

      expect(body).toEqual({
        slug: 'iluminacao-no-bloco-de-artes',
        titulo: 'Iluminação no entorno do Bloco de Artes',
        descricao: 'Trocar luminárias apagadas e iluminar o trajeto até o ponto de ônibus.',
        categoria: 'seguranca',
        status: 'cobrando',
        meta: 80,
        apoios: 84,
        bloco_slug: 'artes',
        bloco_nome: 'Bloco de Artes (fictício)',
        // Responsáveis: estudantes 13, 14 e 15 do seed.
        cursos_responsaveis: ['Enfermagem', 'Engenharia Civil', 'Jornalismo'],
        criada_em: '2026-02-06T12:00:00.000Z',
        aprovada_em: '2026-02-07T12:00:00.000Z',
        meta_batida_em: '2026-02-08T12:00:00.000Z',
        proxima_etapa: 'Prazo do Fala.BR em 20/03',
        relatos: [
          {
            texto: 'A saída das aulas noturnas fica muito escura perto do ponto.',
            foto_chave: null,
            curso: 'Pedagogia',
            moderado_em: '2026-02-13T12:00:00.000Z',
          },
        ],
        // Caminho com data de abertura primeiro; a proposta (sem `aberto_em`) por último.
        caminhos: [
          {
            tipo: 'falabr',
            status: 'em análise',
            protocolo: 'SEED-FALABR-2026-0001',
            prazo: '2026-03-20',
            aberto_em: '2026-02-10T12:00:00.000Z',
            descricao: null,
            pessoas_necessarias: null,
            voluntarios: null,
            executada_em: null,
          },
          {
            tipo: 'proposta',
            status: 'executada',
            protocolo: null,
            prazo: null,
            aberto_em: null,
            descricao: 'Fazer caminhada noturna e registrar os pontos sem iluminação.',
            pessoas_necessarias: 6,
            voluntarios: 2,
            executada_em: '2026-02-16T12:00:00.000Z',
          },
        ],
        // `pauta_criada` não é público; as transições saem em ordem cronológica.
        linha_do_tempo: [
          {
            tipo: 'status_alterado',
            dados: { de: 'em_curadoria', para: 'juntando_apoios' },
            criado_em: '2026-02-07T12:00:00.000Z',
          },
          {
            tipo: 'status_alterado',
            dados: { de: 'juntando_apoios', para: 'meta_batida' },
            criado_em: '2026-02-08T12:00:00.000Z',
          },
          {
            tipo: 'status_alterado',
            dados: { de: 'meta_batida', para: 'cobrando' },
            criado_em: '2026-02-09T12:00:00.000Z',
          },
        ],
      });
      conferirContrato(pautaDetalhe, body);
    });

    it('devolve listas vazias para pauta sem relato nem caminho', async () => {
      const body = await corpo('/pautas/laboratorios-abertos-nas-engenharias');

      expect(body).toMatchObject({ relatos: [], caminhos: [], proxima_etapa: null });
      conferirContrato(pautaDetalhe, body);
    });

    it('responde 404 igual para pauta em curadoria, recusada e inexistente', async () => {
      const longaValida = 'a'.repeat(SLUG_MAX);
      const respostas = await Promise.all(
        [PAUTA_EM_CURADORIA, PAUTA_RECUSADA, 'pauta-que-nao-existe', longaValida].map((slug) =>
          get(`/pautas/${slug}`),
        ),
      );

      for (const res of respostas) {
        expect(res.statusCode).toBe(404);
        expect(res.headers['cache-control']).toBe('no-store');
        conferirContrato(erro, res.json());
      }
      expect(new Set(respostas.map((res) => res.body)).size).toBe(1);
    });

    it.each([
      ['maiúscula', 'Iluminacao'],
      ['hífen duplo', 'a--b'],
      ['hífen na ponta', '-a'],
      ['sublinhado', 'bloco_18'],
      ['espaço', 'a%20b'],
      ['mais longo que o contrato', 'a'.repeat(SLUG_MAX + 1)],
    ])('responde 400 para slug inválido (%s)', async (_, slug) => {
      const res = await get(`/pautas/${slug}`);

      expect(res.statusCode).toBe(400);
      conferirContrato(erro, res.json());
    });
  });

  describe('GET /conquistas', () => {
    it('lista as pautas conquistadas', async () => {
      const body = await corpo('/conquistas');

      expect(body).toEqual({
        itens: [
          {
            pauta_slug: 'laboratorios-abertos-nas-engenharias',
            titulo: 'Laboratórios de informática abertos no contraturno',
            bloco_nome: 'Bloco das Engenharias (fictício)',
            conquistada_em: '2026-03-19T12:00:00.000Z',
            apoios: 300,
            proposta_executada: false,
          },
        ],
      });
      conferirContrato(conquistas, body);
    });
  });

  describe('GET /atividade', () => {
    type Pagina = { itens: { pauta_slug: string; criado_em: string }[]; proximo: number | null };

    it('começa pelo evento mais recente e pagina de 20 em 20 por padrão', async () => {
      const primeira = (await corpo('/atividade')) as Pagina;
      const segunda = (await corpo('/atividade?offset=20')) as Pagina;

      // 25 transições públicas no seed: 20 + 5.
      expect(primeira.itens).toHaveLength(20);
      expect(primeira.proximo).toBe(20);
      expect(segunda.itens).toHaveLength(5);
      expect(segunda.proximo).toBeNull();
      expect(primeira.itens.slice(0, 3)).toEqual([
        {
          pauta_slug: 'acessibilidade-no-bloco-18',
          pauta_titulo: 'Acessibilidade nas entradas do Bloco 18',
          tipo: 'status_alterado',
          dados: { de: 'prometido', para: 'entregue_em_parte' },
          criado_em: '2026-03-24T12:00:00.000Z',
        },
        {
          pauta_slug: 'laboratorios-abertos-nas-engenharias',
          pauta_titulo: 'Laboratórios de informática abertos no contraturno',
          tipo: 'status_alterado',
          dados: { de: 'prometido', para: 'conquistada' },
          criado_em: '2026-03-19T12:00:00.000Z',
        },
        {
          pauta_slug: 'internet-na-residencia',
          pauta_titulo: 'Internet estável na residência universitária',
          tipo: 'status_alterado',
          dados: { de: 'prometido', para: 'descumprida' },
          criado_em: '2026-03-10T12:00:00.000Z',
        },
      ]);
      conferirContrato(atividade, primeira);
      conferirContrato(atividade, segunda);
    });

    it('com limit 100, traz o feed inteiro em ordem decrescente', async () => {
      const body = (await corpo('/atividade?limit=100')) as Pagina;
      const instantes = body.itens.map((item) => item.criado_em);

      expect(body.itens).toHaveLength(25);
      expect(body.proximo).toBeNull();
      expect(instantes).toEqual([...instantes].sort().reverse());
      expect(new Set(body.itens.map((item) => item.pauta_slug))).toEqual(new Set(PAUTAS_EM_ORDEM));
    });
  });

  describe('parâmetros inválidos', () => {
    it.each([
      '/pautas?bloco=Bloco-18',
      '/pautas?bloco=bloco_18',
      '/pautas?bloco=',
      '/pautas?limit=0',
      '/pautas?limit=101',
      '/pautas?limit=1.5',
      '/pautas?limit=dez',
      '/pautas?offset=-1',
      '/pautas?offset=1.5',
      '/pautas?limit=1&limit=2',
      '/pautas?bloco=artes&bloco=saude',
      '/atividade?limit=0',
      '/atividade?limit=101',
      '/atividade?limit=1.5',
      '/atividade?offset=-1',
      '/atividade?offset=0&offset=1',
    ])('%s → 400 com { erro }', async (url) => {
      const res = await get(url);

      expect(res.statusCode).toBe(400);
      expect(res.headers['cache-control']).toBe('no-store');
      conferirContrato(erro, res.json());
    });

    it('nomeia o parâmetro recusado', async () => {
      const res = await get('/pautas?limit=101&bloco=artes');

      expect(res.json()).toEqual({ erro: 'Parâmetro inválido: limit.' });
    });
  });

  it('nenhuma resposta tem telefone, e-mail, HMAC, cifra ou id', async () => {
    const urls = [
      '/resumo',
      '/blocos',
      '/pautas?limit=100',
      ...PAUTAS_EM_ORDEM.map((slug) => `/pautas/${slug}`),
      '/conquistas',
      '/atividade?limit=100',
    ];
    const corpos = await Promise.all(urls.map(corpo));
    const chaves = new Set(chavesDe(corpos));

    // Sem isso o filtro abaixo passaria vazio se as respostas viessem sem nada.
    expect([...chaves]).toEqual(expect.arrayContaining(['slug', 'curso', 'dados', 'pauta_slug']));
    expect([...chaves].filter((chave) => CHAVE_PROIBIDA.test(chave))).toEqual([]);
  });

  describe('cabeçalhos', () => {
    it('ecoa a origem do site no CORS, sem curinga', async () => {
      const res = await get('/resumo', { origin: SITE });

      expect(res.headers['access-control-allow-origin']).toBe(SITE);
      expect(res.headers.vary).toContain('Origin');
    });

    it('não libera CORS para outra origem, mas mantém o Vary', async () => {
      const res = await get('/resumo', { origin: 'https://lumens-ufal.vercel.app.evil.com' });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers.vary).toContain('Origin');
    });

    it('aplica CORS também ao 404 e ao 400, para o site ler o erro', async () => {
      for (const url of ['/pautas/pauta-que-nao-existe', '/pautas?limit=0']) {
        const res = await get(url, { origin: SITE });
        expect(res.headers['access-control-allow-origin'], url).toBe(SITE);
      }
    });

    it.each([
      '/resumo',
      '/blocos',
      '/pautas',
      '/pautas/bebedouros-no-bloco-18',
      '/conquistas',
      '/atividade',
    ])('%s → 200 com cache público curto', async (url) => {
      const res = await get(url);

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe(CACHE_PUBLICO);
      expect(res.headers['content-type']).toContain('application/json');
    });
  });

  it('não aceita escrita', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({ method, url: '/pautas/bebedouros-no-bloco-18' });
      expect(res.statusCode, method).toBe(404);
    }
  });

  it('responde /pautas/:slug em menos de 300 ms', async () => {
    const url = '/pautas/iluminacao-no-bloco-de-artes';
    await get(url); // aquecimento: primeira consulta compila o plano no PGlite

    const inicio = performance.now();
    const res = await get(url);
    const duracao = performance.now() - inicio;

    expect(res.statusCode).toBe(200);
    expect(duracao).toBeLessThan(300);
  });
});

describe('API de leitura pública: formato independente da sessão do banco', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const db = await bancoDoSite();
    // Um banco ou papel configurado com outro estilo de data e fuso não pode mudar o JSON.
    await db.execute(sql.raw(`SET DateStyle = 'SQL, DMY'`));
    await db.execute(sql.raw(`SET TimeZone = 'America/Maceio'`));
    app = await montarApp(db);
  }, 60_000);
  afterAll(async () => {
    await app.close();
  });

  it('prazo sai como AAAA-MM-DD e instantes em UTC, com DateStyle e fuso diferentes', async () => {
    const res = await app.inject({ method: 'GET', url: '/pautas/iluminacao-no-bloco-de-artes' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      caminhos: { tipo: string; prazo: string | null; aberto_em: string | null }[];
    }>();
    const falabr = body.caminhos.find((c) => c.tipo === 'falabr');
    expect(falabr?.prazo).toBe('2026-03-20');
    expect(falabr?.aberto_em).toBe('2026-02-10T12:00:00.000Z');
  });
});

describe('API de leitura pública com eventos no mesmo instante', () => {
  let app: FastifyInstance;
  const INSTANTE = '2027-01-01T00:00:00.000Z';

  beforeAll(async () => {
    const db = await bancoDoSite(async (dono) => {
      // Três eventos públicos no mesmo instante, mais novos que todos os do seed.
      await dono.execute(
        sql`INSERT INTO evento (pauta_id, tipo, dados, origem, publico, criado_em)
            SELECT p.id, 'empate', jsonb_build_object('n', n), 'curadoria', true,
                   ${INSTANTE}::timestamptz
            FROM pauta p, generate_series(1, 2) AS n
            WHERE p.slug IN ('internet-na-residencia', 'bebedouros-no-bloco-18')
              AND (p.slug = 'internet-na-residencia' OR n = 1)`,
      );
    });
    app = await montarApp(db);
  }, 60_000);
  afterAll(async () => {
    await app.close();
  });

  it('desempata por pauta, tipo e dados, e as páginas não repetem nem pulam eventos', async () => {
    const pagina = async (offset: number) =>
      (
        await app.inject({ method: 'GET', url: `/atividade?limit=1&offset=${String(offset)}` })
      ).json<{
        itens: { pauta_slug: string; dados: unknown; criado_em: string }[];
      }>().itens;

    const itens = [...(await pagina(0)), ...(await pagina(1)), ...(await pagina(2))];

    expect(itens.map((i) => i.criado_em)).toEqual([INSTANTE, INSTANTE, INSTANTE]);
    expect(itens.map((i) => [i.pauta_slug, i.dados])).toEqual([
      ['bebedouros-no-bloco-18', { n: 1 }],
      ['internet-na-residencia', { n: 1 }],
      ['internet-na-residencia', { n: 2 }],
    ]);
  });
});

describe('API de leitura pública com pauta do campus inteiro', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const db = await bancoDoSite(async (dono) => {
      await dono.execute(
        sql`INSERT INTO pauta (slug, titulo, descricao, categoria, meta, status)
            VALUES ('wifi-no-campus', 'Wi-Fi no campus', 'Cobertura nas áreas abertas.',
                    'tecnologia', 300, 'juntando_apoios')`,
      );
    });
    app = await montarApp(db);
  }, 60_000);
  afterAll(async () => {
    await app.close();
  });

  const slugs = async (url: string) => {
    const res = await app.inject({ method: 'GET', url });
    return res.json<{ itens: { slug: string; bloco_slug: string | null }[] }>().itens;
  };

  it('sem filtro, inclui a pauta sem bloco (por último: não tem apoios)', async () => {
    const itens = await slugs('/pautas');

    expect(itens.map((p) => p.slug)).toEqual([...PAUTAS_EM_ORDEM, 'wifi-no-campus']);
    expect(itens.at(-1)?.bloco_slug).toBeNull();
  });

  it('com filtro de bloco, deixa a pauta do campus inteiro de fora', async () => {
    for (const bloco of ['bloco-18', 'artes', 'saude']) {
      const itens = await slugs(`/pautas?bloco=${bloco}`);
      expect(itens.map((p) => p.slug)).not.toContain('wifi-no-campus');
      expect(itens.every((p) => p.bloco_slug === bloco)).toBe(true);
    }
  });
});

describe('API de leitura pública: serialização e rotas', () => {
  it('descarta na resposta o campo que não está no contrato', async () => {
    const vazamento = { id: 'uuid', estudante_id: 'uuid', telefone_cifrado: 'x', email_hmac: 'y' };
    const pauta = {
      slug: 'pauta',
      titulo: 'Pauta',
      descricao: 'Descrição',
      categoria: 'teste',
      status: 'juntando_apoios',
      meta: 10,
      apoios: 1,
      bloco_slug: null,
      bloco_nome: null,
      cursos_responsaveis: [],
      criada_em: '2026-02-01T12:00:00.000Z',
      aprovada_em: null,
      meta_batida_em: null,
      proxima_etapa: 'Faltam 9 apoios',
    };
    const relato = { texto: 'Relato', foto_chave: null, curso: null, moderado_em: null };
    // Uma lista por consulta de /pautas/:slug: pauta, relatos, caminhos, linha do tempo.
    const db = bancoFalso([{ ...pauta, ...vazamento }], [{ ...relato, ...vazamento }], [], []);
    const app = await montarApp(db);
    try {
      const res = await app.inject({ method: 'GET', url: '/pautas/pauta' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ...pauta, relatos: [relato], caminhos: [], linha_do_tempo: [] });
    } finally {
      await app.close();
    }
  });

  it('descarta campo fora do contrato também nas listas', async () => {
    const bloco = { slug: 'artes', nome: 'Artes', base_estudantes: 10 };
    const app = await montarApp(bancoFalso([{ ...bloco, estudante_id: 'uuid', id: 'uuid' }]));
    try {
      const res = await app.inject({ method: 'GET', url: '/blocos' });

      expect(res.json()).toEqual({ itens: [bloco] });
    } finally {
      await app.close();
    }
  });

  it('erro do banco vira 500 genérico, sem o texto do erro e sem cache', async () => {
    const db = {
      execute: () => Promise.reject(new Error('relation "estudante" telefone_cifrado secreto')),
    } as unknown as Db;
    const app = await montarApp(db);
    try {
      const res = await app.inject({ method: 'GET', url: '/resumo' });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ erro: 'Erro interno.' });
      expect(res.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });

  it('só registra rotas GET (e o HEAD que o Fastify cria junto)', async () => {
    const rotas: { method: string; url: string }[] = [];
    const app = Fastify();
    app.addHook('onRoute', ({ method, url }) => {
      for (const m of [method].flat()) rotas.push({ method: m, url });
    });
    await app.register(apiPlugin, { db: bancoFalso(), origensCors: [] });
    await app.ready();
    try {
      expect(new Set(rotas.map((r) => r.url))).toEqual(
        new Set(['/resumo', '/blocos', '/pautas', '/pautas/:slug', '/conquistas', '/atividade']),
      );
      expect(rotas.filter((r) => r.method !== 'GET' && r.method !== 'HEAD')).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
