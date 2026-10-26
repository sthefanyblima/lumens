import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const statusPauta = pgEnum('status_pauta', [
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
export const papelNaPauta = pgEnum('papel_na_pauta', ['owner', 'co_owner']);
export const origemApoio = pgEnum('origem_apoio', ['bot', 'site']);
export const moderacaoRelato = pgEnum('moderacao_relato', ['pendente', 'aprovado', 'recusado']);
export const tipoCaminho = pgEnum('tipo_caminho', ['falabr', 'comunidade', 'representante']);
export const statusProposta = pgEnum('status_proposta', ['aberta', 'executada']);
export const respostaConferencia = pgEnum('resposta_conferencia_valor', ['sim', 'em_parte', 'nao']);
export const origemEvento = pgEnum('origem_evento', ['bot', 'curadoria', 'agendador']);

const instante = (nome: string) => timestamp(nome, { withTimezone: true });
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const estudantes = pgTable('estudante', {
  id: uuid('id').defaultRandom().primaryKey(),
  telefoneHmac: text('telefone_hmac').notNull().unique(),
  telefoneCifrado: text('telefone_cifrado').notNull(),
  emailHmac: text('email_hmac').unique(),
  emailCifrado: text('email_cifrado'),
  curso: text('curso'),
  verificadoEm: instante('verificado_em'),
  saiuEm: instante('saiu_em'),
});

export const codigosVerificacao = pgTable(
  'codigo_verificacao',
  {
    telefoneHmac: text('telefone_hmac').primaryKey(),
    codigoHash: text('codigo_hash').notNull(),
    expiraEm: instante('expira_em').notNull(),
    tentativas: integer('tentativas').notNull().default(0),
  },
  (t) => [check('codigo_verificacao_tentativas_nao_negativas', sql`${t.tentativas} >= 0`)],
);

export const blocos = pgTable(
  'bloco',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    nome: text('nome').notNull(),
    baseEstudantes: integer('base_estudantes').notNull(),
  },
  (t) => [check('bloco_base_estudantes_nao_negativa', sql`${t.baseEstudantes} >= 0`)],
);

export const pautas = pgTable(
  'pauta',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    titulo: text('titulo').notNull(),
    descricao: text('descricao').notNull(),
    blocoId: uuid('bloco_id').references(() => blocos.id, { onDelete: 'restrict' }),
    categoria: text('categoria').notNull(),
    status: statusPauta('status').notNull().default('em_curadoria'),
    meta: integer('meta').notNull(),
    criadaEm: instante('criada_em').notNull().defaultNow(),
    aprovadaEm: instante('aprovada_em'),
    metaBatidaEm: instante('meta_batida_em'),
    motivoRecusa: text('motivo_recusa'),
    busca: tsvector('busca')
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('portuguese'::regconfig, "titulo" || ' ' || "descricao")`),
  },
  (t) => [
    index('pauta_bloco_id_idx').on(t.blocoId),
    index('pauta_status_idx').on(t.status),
    index('pauta_busca_idx').using('gin', t.busca),
    check('pauta_meta_positiva', sql`${t.meta} > 0`),
  ],
);

export const papeisPauta = pgTable(
  'papel_pauta',
  {
    pautaId: uuid('pauta_id')
      .notNull()
      .references(() => pautas.id, { onDelete: 'restrict' }),
    estudanteId: uuid('estudante_id')
      .notNull()
      .references(() => estudantes.id, { onDelete: 'restrict' }),
    papel: papelNaPauta('papel').notNull(),
    // Integra a PK: preservar os microssegundos que Date não representa.
    desde: timestamp('desde', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    ate: instante('ate'),
    ultimaAtividadeEm: instante('ultima_atividade_em').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.pautaId, t.estudanteId, t.desde] }),
    index('papel_pauta_estudante_id_idx').on(t.estudanteId),
  ],
);

export const apoios = pgTable(
  'apoio',
  {
    pautaId: uuid('pauta_id')
      .notNull()
      .references(() => pautas.id, { onDelete: 'restrict' }),
    estudanteId: uuid('estudante_id')
      .notNull()
      .references(() => estudantes.id, { onDelete: 'restrict' }),
    origem: origemApoio('origem').notNull(),
    criadoEm: instante('criado_em').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.pautaId, t.estudanteId] }),
    index('apoio_estudante_id_idx').on(t.estudanteId),
  ],
);

export const relatos = pgTable(
  'relato',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pautaId: uuid('pauta_id')
      .notNull()
      .references(() => pautas.id, { onDelete: 'restrict' }),
    estudanteId: uuid('estudante_id')
      .notNull()
      .references(() => estudantes.id, { onDelete: 'restrict' }),
    texto: text('texto').notNull(),
    fotoChave: text('foto_chave'),
    moderacao: moderacaoRelato('moderacao').notNull().default('pendente'),
    moderadoEm: instante('moderado_em'),
  },
  (t) => [
    index('relato_pauta_id_idx').on(t.pautaId),
    index('relato_estudante_id_idx').on(t.estudanteId),
  ],
);

export const caminhos = pgTable(
  'caminho',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pautaId: uuid('pauta_id')
      .notNull()
      .references(() => pautas.id, { onDelete: 'restrict' }),
    tipo: tipoCaminho('tipo').notNull(),
    status: text('status').notNull(),
    protocolo: text('protocolo'),
    prazo: date('prazo'),
    abertoEm: instante('aberto_em').notNull().defaultNow(),
  },
  (t) => [index('caminho_pauta_id_idx').on(t.pautaId)],
);

export const propostas = pgTable(
  'proposta',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pautaId: uuid('pauta_id')
      .notNull()
      .references(() => pautas.id, { onDelete: 'restrict' }),
    descricao: text('descricao').notNull(),
    pessoasNecessarias: integer('pessoas_necessarias').notNull(),
    status: statusProposta('status').notNull().default('aberta'),
    executadaEm: instante('executada_em'),
  },
  (t) => [
    index('proposta_pauta_id_idx').on(t.pautaId),
    check('proposta_pessoas_necessarias_positivas', sql`${t.pessoasNecessarias} > 0`),
  ],
);

export const voluntarios = pgTable(
  'voluntario',
  {
    propostaId: uuid('proposta_id')
      .notNull()
      .references(() => propostas.id, { onDelete: 'restrict' }),
    estudanteId: uuid('estudante_id')
      .notNull()
      .references(() => estudantes.id, { onDelete: 'restrict' }),
    criadoEm: instante('criado_em').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.propostaId, t.estudanteId] }),
    index('voluntario_estudante_id_idx').on(t.estudanteId),
  ],
);

export const curadores = pgTable('curador', {
  id: uuid('id').defaultRandom().primaryKey(),
  emailHmac: text('email_hmac').notNull().unique(),
  emailCifrado: text('email_cifrado').notNull(),
  nome: text('nome').notNull(),
  ativo: boolean('ativo').notNull().default(true),
});

export const promessas = pgTable(
  'promessa',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pautaId: uuid('pauta_id')
      .notNull()
      .references(() => pautas.id, { onDelete: 'restrict' }),
    resumo: text('resumo').notNull(),
    dataEntrega: date('data_entrega').notNull(),
    fonte: text('fonte').notNull(),
    registradaPor: uuid('registrada_por')
      .notNull()
      .references(() => curadores.id, { onDelete: 'restrict' }),
    conferenciaAbreEm: instante('conferencia_abre_em').notNull(),
    conferenciaFechaEm: instante('conferencia_fecha_em').notNull(),
    resultado: text('resultado'),
  },
  (t) => [
    index('promessa_pauta_id_idx').on(t.pautaId),
    index('promessa_registrada_por_idx').on(t.registradaPor),
    uniqueIndex('promessa_ativa_por_pauta_unique')
      .on(t.pautaId)
      .where(sql`${t.resultado} IS NULL`),
  ],
);

export const respostasConferencia = pgTable(
  'resposta_conferencia',
  {
    promessaId: uuid('promessa_id')
      .notNull()
      .references(() => promessas.id, { onDelete: 'restrict' }),
    estudanteId: uuid('estudante_id')
      .notNull()
      .references(() => estudantes.id, { onDelete: 'restrict' }),
    resposta: respostaConferencia('resposta').notNull(),
    criadoEm: instante('criado_em').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.promessaId, t.estudanteId] }),
    index('resposta_conferencia_estudante_id_idx').on(t.estudanteId),
  ],
);

export const eventos = pgTable(
  'evento',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pautaId: uuid('pauta_id')
      .notNull()
      .references(() => pautas.id, { onDelete: 'restrict' }),
    tipo: text('tipo').notNull(),
    dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
    origem: origemEvento('origem').notNull(),
    publico: boolean('publico').notNull().default(false),
    criadoEm: instante('criado_em').notNull().defaultNow(),
  },
  (t) => [index('evento_pauta_criado_em_idx').on(t.pautaId, t.criadoEm)],
);

export const conversas = pgTable('conversa', {
  telefoneHmac: text('telefone_hmac').primaryKey(),
  passo: text('passo').notNull(),
  dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
  atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
});

export const mensagensProcessadas = pgTable('mensagem_processada', {
  wamid: text('wamid').primaryKey(),
  recebidaEm: instante('recebida_em').notNull().defaultNow(),
});
