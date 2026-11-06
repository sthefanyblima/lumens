import { z } from 'zod';

/**
 * Contrato da API de leitura pública (SCRUM-88 · T15), compartilhado entre o back-end e o site.
 *
 * Cada esquema lista os campos explicitamente: o back-end converte estes esquemas em JSON Schema
 * de resposta, e o Fastify descarta qualquer campo não declarado. Um campo novo numa view NÃO
 * chega ao site até ser declarado aqui.
 *
 * Instantes (`timestamptz`) saem como ISO 8601 em UTC; datas (`date`) como `AAAA-MM-DD`.
 */

/** Slug de pauta ou bloco: minúsculas, dígitos e hífens, sem hífen nas pontas nem repetido. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 120;
export const slug = z.string().min(1).max(SLUG_MAX).regex(SLUG);

export const LIMITE_PADRAO = 20;
export const LIMITE_MAXIMO = 100;

/** Os sete status que o site pode ver; os demais nunca saem da API. */
export const STATUS_PUBLICOS = [
  'juntando_apoios',
  'meta_batida',
  'cobrando',
  'prometido',
  'entregue_em_parte',
  'descumprida',
  'conquistada',
] as const;
export const statusPublico = z.enum(STATUS_PUBLICOS);
export type StatusPublico = z.infer<typeof statusPublico>;

const instante = z.iso.datetime();
const data = z.iso.date();

/** Paginação por `offset`: `proximo` é o offset da página seguinte, ou nulo na última. */
export const paginacaoQuery = z.object({
  limit: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).default(LIMITE_PADRAO),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PaginacaoQuery = z.infer<typeof paginacaoQuery>;

function pagina<T extends z.ZodType>(item: T) {
  return z.object({ itens: z.array(item), proximo: z.number().int().nullable() });
}

// GET /resumo — v_resumo
export const resumo = z.object({
  pautas_abertas: z.number().int(),
  apoios: z.number().int(),
  conquistas: z.number().int(),
});
export type Resumo = z.infer<typeof resumo>;

// GET /blocos — v_bloco
export const bloco = z.object({
  slug: z.string(),
  nome: z.string(),
  base_estudantes: z.number().int(),
});
export const blocos = z.object({ itens: z.array(bloco) });
export type Bloco = z.infer<typeof bloco>;
export type Blocos = z.infer<typeof blocos>;

// GET /pautas — v_pauta_publica
export const pautasQuery = paginacaoQuery.extend({ bloco: slug.optional() });
export type PautasQuery = z.infer<typeof pautasQuery>;

export const pauta = z.object({
  slug: z.string(),
  titulo: z.string(),
  descricao: z.string(),
  categoria: z.string(),
  status: statusPublico,
  meta: z.number().int(),
  apoios: z.number().int(),
  /** Nulo quando a pauta é do campus inteiro. */
  bloco_slug: z.string().nullable(),
  bloco_nome: z.string().nullable(),
  cursos_responsaveis: z.array(z.string()),
  criada_em: instante,
  aprovada_em: instante.nullable(),
  meta_batida_em: instante.nullable(),
  proxima_etapa: z.string().nullable(),
});
export const pautas = pagina(pauta);
export type Pauta = z.infer<typeof pauta>;
export type Pautas = z.infer<typeof pautas>;

// GET /pautas/:slug — v_pauta_publica + v_relato_publico + v_caminho_publico + v_linha_do_tempo
export const pautaParams = z.object({ slug });

export const relato = z.object({
  texto: z.string(),
  foto_chave: z.string().nullable(),
  curso: z.string().nullable(),
  moderado_em: instante.nullable(),
});
export type Relato = z.infer<typeof relato>;

export const caminho = z.object({
  tipo: z.enum(['falabr', 'comunidade', 'representante', 'proposta']),
  status: z.string(),
  protocolo: z.string().nullable(),
  prazo: data.nullable(),
  aberto_em: instante.nullable(),
  descricao: z.string().nullable(),
  pessoas_necessarias: z.number().int().nullable(),
  voluntarios: z.number().int().nullable(),
  executada_em: instante.nullable(),
});
export type Caminho = z.infer<typeof caminho>;

/** Payload do catálogo da T7, já sem as chaves `id` e `*_id` (a view remove). */
export const evento = z.object({
  tipo: z.string(),
  dados: z.record(z.string(), z.unknown()),
  criado_em: instante,
});
export type Evento = z.infer<typeof evento>;

export const pautaDetalhe = pauta.extend({
  relatos: z.array(relato),
  caminhos: z.array(caminho),
  linha_do_tempo: z.array(evento),
});
export type PautaDetalhe = z.infer<typeof pautaDetalhe>;

// GET /conquistas — v_conquista
export const conquista = z.object({
  pauta_slug: z.string(),
  titulo: z.string(),
  bloco_nome: z.string().nullable(),
  conquistada_em: instante.nullable(),
  apoios: z.number().int(),
  proposta_executada: z.boolean(),
});
export const conquistas = z.object({ itens: z.array(conquista) });
export type Conquista = z.infer<typeof conquista>;
export type Conquistas = z.infer<typeof conquistas>;

// GET /atividade — v_atividade
export const atividadeItem = evento.extend({
  pauta_slug: z.string(),
  pauta_titulo: z.string(),
});
export const atividade = pagina(atividadeItem);
export type AtividadeItem = z.infer<typeof atividadeItem>;
export type Atividade = z.infer<typeof atividade>;

/** Corpo de 400 e 404. O 404 não diz se a pauta não existe ou não é pública. */
export const erro = z.object({ erro: z.string() });
export type Erro = z.infer<typeof erro>;
