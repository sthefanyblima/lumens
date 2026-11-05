/**
 * Linha do tempo da pauta (RN11): toda ação do domínio registra um evento na mesma transação.
 *
 * Os tipos e o `dados` mínimo de cada um são o catálogo da T7 (`docs/esquema.md`, "Tipos de evento
 * decididos"). A tabela `evento` só aceita inserção; esta é a única porta de escrita nela.
 */
import { eventos, type PapelPauta, type StatusPauta, type Tx } from '@lumens/db';
import type { ResultadoApuracao } from './conferencia';
import { ErroDeRegra } from './erros';
import type { TipoCaminho } from './prazo';

/** `dados` de cada tipo de evento. Datas civis em `YYYY-MM-DD`, instantes em ISO 8601 UTC. */
export interface DadosPorTipo {
  pauta_criada: { status: 'em_curadoria' };
  pauta_aprovada: Record<string, never>;
  pauta_recusada: Record<string, never>;
  meta_batida: { meta: number; apoios: number };
  caminho_aberto: { caminho_id: string; tipo: TipoCaminho };
  protocolo_registrado: { caminho_id: string; protocolo: string };
  proposta_publicada: { proposta_id: string; pessoas_necessarias: number };
  proposta_executada: { proposta_id: string };
  resposta_oficial_recebida: { caminho_id: string };
  promessa_registrada: { promessa_id: string; data_entrega: string };
  conferencia_aberta: { promessa_id: string; fecha_em: string };
  conferencia_apurada: {
    promessa_id: string;
    resultado: ResultadoApuracao;
    total_respostas: number;
  };
  status_alterado: { de: StatusPauta; para: StatusPauta };
  owner_entrou: { papel: PapelPauta['papel'] };
  owner_removido: { papel: PapelPauta['papel'] };
  relato_aprovado: { relato_id: string };
}

export type TipoEvento = keyof DadosPorTipo;
export type OrigemEvento = 'bot' | 'curadoria' | 'agendador';

/** Visibilidade do catálogo. `status_alterado` é condicional: a recusa não aparece no site. */
const PUBLICO: { [T in TipoEvento]: boolean | ((dados: DadosPorTipo[T]) => boolean) } = {
  pauta_criada: false,
  pauta_aprovada: true,
  pauta_recusada: false,
  meta_batida: true,
  caminho_aberto: true,
  protocolo_registrado: true,
  proposta_publicada: true,
  proposta_executada: true,
  resposta_oficial_recebida: true,
  promessa_registrada: true,
  conferencia_aberta: true,
  conferencia_apurada: true,
  status_alterado: (dados) => dados.para !== 'recusada',
  owner_entrou: true,
  owner_removido: true,
  relato_aprovado: true,
};

export const TIPOS_EVENTO = Object.keys(PUBLICO) as TipoEvento[];

// Chaves que identificam pessoa. O tipo de `dados` já não as aceita; isto pega o que chega por
// fora do TypeScript (JSON do bot, `as` apressado) antes de virar linha pública na timeline.
const CHAVE_DE_IDENTIDADE = /^(estudante|curador|telefone|celular|e_?mail|nome|cpf|matricula)/i;

function chaveDeIdentidade(valor: unknown): string | undefined {
  if (typeof valor !== 'object' || valor === null) return undefined;
  for (const [chave, filho] of Object.entries(valor)) {
    if (CHAVE_DE_IDENTIDADE.test(chave)) return chave;
    const dentro = chaveDeIdentidade(filho);
    if (dentro !== undefined) return dentro;
  }
  return undefined;
}

export interface NovoEventoDeDominio<T extends TipoEvento> {
  pautaId: string;
  tipo: T;
  dados: DadosPorTipo[T];
  origem: OrigemEvento;
}

/**
 * Grava um evento na linha do tempo, com `publico` vindo do catálogo.
 *
 * Roda dentro da transação de quem chama: se a ação falhar depois, o evento some junto.
 * Lança `ErroDeRegra` para tipo fora do catálogo ou `dados` com campo de identidade.
 */
export async function registrarEvento<T extends TipoEvento>(
  tx: Tx,
  { pautaId, tipo, dados, origem }: NovoEventoDeDominio<T>,
): Promise<{ id: string; publico: boolean }> {
  const regra = PUBLICO[tipo] as boolean | ((d: DadosPorTipo[T]) => boolean) | undefined;
  if (regra === undefined) {
    throw new ErroDeRegra('evento_desconhecido', `Tipo de evento fora do catálogo: ${tipo}`);
  }

  const chave = chaveDeIdentidade(dados);
  if (chave !== undefined) {
    throw new ErroDeRegra(
      'dados_pessoais_no_evento',
      `O evento ${tipo} não pode levar dado pessoal (campo "${chave}").`,
    );
  }

  const publico = typeof regra === 'function' ? regra(dados) : regra;
  const [linha] = await tx
    .insert(eventos)
    .values({ pautaId, tipo, dados, origem, publico })
    .returning({ id: eventos.id });

  if (linha === undefined) throw new Error('evento não gravado');
  return { id: linha.id, publico };
}
