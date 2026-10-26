// Formato das views públicas (1.4), com os nomes de campo do esquema da T4.
// Provisório até a T7 fechar os nomes: ajustar aqui e no exemplo.json juntos.

export const STATUS_PAUTA = [
  'em_curadoria',
  'recusada',
  'juntando_apoios',
  'meta_batida',
  'cobrando',
  'prometido',
  'entregue_em_parte',
  'descumprida',
  'conquistada',
] as const;

export type StatusPauta = (typeof STATUS_PAUTA)[number];

export interface Bloco {
  slug: string;
  nome: string;
  base_estudantes: number;
}

export interface Owner {
  papel: 'owner' | 'co_owner';
  curso: string;
  desde: string;
}

export interface Relato {
  texto: string;
  foto_chave: string | null;
  moderado_em: string;
}

export interface Evento {
  tipo: string;
  dados: Record<string, unknown>;
  criado_em: string;
}

export interface Pauta {
  slug: string;
  titulo: string;
  descricao: string;
  categoria: string;
  status: StatusPauta;
  /** null = pauta do campus inteiro. */
  bloco_slug: string | null;
  bloco_nome: string | null;
  meta: number;
  apoios: number;
  criada_em: string;
  aprovada_em: string | null;
  meta_batida_em: string | null;
  owners: Owner[];
  relatos: Relato[];
  eventos: Evento[];
}

export interface DadosExemplo {
  blocos: Bloco[];
  pautas: Pauta[];
}
