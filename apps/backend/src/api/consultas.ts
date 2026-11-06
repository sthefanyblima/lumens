import type {
  AtividadeItem,
  Bloco,
  Caminho,
  Conquista,
  Evento,
  PaginacaoQuery,
  Pauta,
  PautaDetalhe,
  PautasQuery,
  Relato,
  Resumo,
} from '@lumens/contratos';
import { sql, type Db } from '@lumens/db';

type SQL = ReturnType<typeof sql>;

/**
 * Consultas da API de leitura pública (SCRUM-88). Só leem as views da T14: a conexão de leitura
 * (`lumens_site`) recebe `permission denied` em qualquer tabela.
 *
 * A normalização fica no SQL, para sair igual nos dois drivers: o node-postgres devolve
 * `timestamptz` como `Date` e pode deslocar um `date` pelo fuso local; o PGlite devolve texto.
 * Instantes saem como ISO 8601 em UTC (o formato do `toISOString()`), datas como `AAAA-MM-DD`
 * e contagens como `int`.
 */

/** `timestamptz` → `AAAA-MM-DDTHH:MM:SS.mmmZ`, ou nulo. */
function iso(coluna: string): SQL {
  return sql.raw(
    `to_char(${coluna} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ${coluna}`,
  );
}

async function linhas<T>(db: Db, consulta: SQL): Promise<T[]> {
  const resultado: unknown = await db.execute(consulta);
  return (resultado as { rows: T[] }).rows;
}

/** Busca uma linha a mais que o `limit` para saber se existe página seguinte. */
function paginar<T>(itens: T[], { limit, offset }: PaginacaoQuery) {
  return {
    itens: itens.slice(0, limit),
    proximo: itens.length > limit ? offset + limit : null,
  };
}

export async function buscarResumo(db: Db): Promise<Resumo> {
  const [linha] = await linhas<Resumo>(
    db,
    sql`SELECT pautas_abertas::int AS pautas_abertas, apoios::int AS apoios,
               conquistas::int AS conquistas
        FROM v_resumo`,
  );
  // A view agrega sem GROUP BY: sempre devolve uma linha, mesmo com o banco vazio.
  return linha ?? { pautas_abertas: 0, apoios: 0, conquistas: 0 };
}

export async function listarBlocos(db: Db): Promise<Bloco[]> {
  return linhas<Bloco>(
    db,
    sql`SELECT slug, nome, base_estudantes::int AS base_estudantes
        FROM v_bloco ORDER BY nome, slug`,
  );
}

const COLUNAS_PAUTA = sql.join(
  [
    sql.raw('slug, titulo, descricao, categoria, status::text AS status'),
    sql.raw('meta::int AS meta, apoios::int AS apoios, bloco_slug, bloco_nome'),
    sql.raw('cursos_responsaveis'),
    iso('criada_em'),
    iso('aprovada_em'),
    iso('meta_batida_em'),
    sql.raw('proxima_etapa'),
  ],
  sql.raw(', '),
);

/** Mesma ordem da lista do site (`apps/site/src/dados/pautas-publicas.ts`), com o slug no desempate. */
export async function listarPautas(db: Db, query: PautasQuery) {
  const filtro = query.bloco === undefined ? sql`` : sql`WHERE bloco_slug = ${query.bloco}`;
  const itens = await linhas<Pauta>(
    db,
    sql`SELECT ${COLUNAS_PAUTA} FROM v_pauta_publica ${filtro}
        ORDER BY v_pauta_publica.apoios DESC, v_pauta_publica.criada_em DESC, slug
        LIMIT ${query.limit + 1} OFFSET ${query.offset}`,
  );
  return paginar(itens, query);
}

/** Nulo quando a pauta não existe ou não é pública: as views não distinguem os dois casos. */
export async function buscarPauta(db: Db, slug: string): Promise<PautaDetalhe | null> {
  const [pautas, relatos, caminhos, linhaDoTempo] = await Promise.all([
    linhas<Pauta>(db, sql`SELECT ${COLUNAS_PAUTA} FROM v_pauta_publica WHERE slug = ${slug}`),
    linhas<Relato>(
      db,
      sql`SELECT texto, foto_chave, curso, ${iso('moderado_em')}
          FROM v_relato_publico WHERE pauta_slug = ${slug}
          ORDER BY v_relato_publico.moderado_em`,
    ),
    linhas<Caminho>(
      db,
      // `to_char` e não `::text`: o cast segue o `DateStyle` da sessão (ex.: `20/03/2026`).
      sql`SELECT tipo, status, protocolo, to_char(prazo, 'YYYY-MM-DD') AS prazo, ${iso('aberto_em')}, descricao,
                 pessoas_necessarias::int AS pessoas_necessarias, voluntarios::int AS voluntarios,
                 ${iso('executada_em')}
          FROM v_caminho_publico WHERE pauta_slug = ${slug}
          ORDER BY v_caminho_publico.aberto_em NULLS LAST, tipo`,
    ),
    linhas<Evento>(
      db,
      sql`SELECT tipo, dados, ${iso('criado_em')}
          FROM v_linha_do_tempo WHERE pauta_slug = ${slug}
          ORDER BY v_linha_do_tempo.criado_em`,
    ),
  ]);
  const [pauta] = pautas;
  if (!pauta) return null;
  return { ...pauta, relatos, caminhos, linha_do_tempo: linhaDoTempo };
}

export async function listarConquistas(db: Db): Promise<Conquista[]> {
  return linhas<Conquista>(
    db,
    sql`SELECT pauta_slug, titulo, bloco_nome, ${iso('conquistada_em')},
               apoios::int AS apoios, proposta_executada
        FROM v_conquista ORDER BY v_conquista.conquistada_em DESC NULLS LAST, pauta_slug`,
  );
}

/**
 * `criado_em DESC` vem na frente porque é a ordem do índice parcial da T14. O desempate
 * (`pauta_slug`, `tipo`, `dados`) deixa a ordem estável entre páginas quando dois eventos têm o
 * mesmo instante: sem ele, o OFFSET podia repetir um evento e pular outro. O Postgres o aplica
 * como `Incremental Sort` sobre a ordem do índice, sem ordenar o feed inteiro.
 */
export async function listarAtividade(db: Db, query: PaginacaoQuery) {
  const itens = await linhas<AtividadeItem>(
    db,
    sql`SELECT pauta_slug, pauta_titulo, tipo, dados, ${iso('criado_em')}
        FROM v_atividade
        ORDER BY v_atividade.criado_em DESC, pauta_slug, tipo, v_atividade.dados
        LIMIT ${query.limit + 1} OFFSET ${query.offset}`,
  );
  return paginar(itens, query);
}
