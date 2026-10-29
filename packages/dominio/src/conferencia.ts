/**
 * RN10 · Apuração da conferência "Foi feito?".
 *
 * Passado o prazo da conferência, as respostas de quem apoiou a pauta decidem
 * se a promessa foi cumprida. Esta é a regra que transforma contagem em
 * resultado — e, como ela é o que autoriza dizer em público que a pauta virou
 * conquista, erra para o lado conservador: reconhecer vitória que não houve
 * custa mais à confiança no sistema do que deixar de reconhecer uma que houve.
 *
 * São duas perguntas em sequência:
 *
 *   1. Respondeu gente suficiente? Abaixo do quórum não há o que apurar.
 *   2. O que a base respondeu?
 *
 * Aqui só a contagem vira resultado. Abrir a conferência na data, cobrar e
 * fechar depois de sete dias é trabalho do agendador; esta função não conhece
 * relógio.
 */

/** Como cada apoiador pode responder (enum `resposta_conferencia_valor`). */
export type RespostaConferencia = 'sim' | 'em_parte' | 'nao';

/**
 * Resultado da apuração.
 *
 * Os três primeiros são status de pauta que já existem no banco. `sem_quorum`
 * não é status de pauta: é o caso em que a conferência não decidiu nada, e vai
 * para `promessa.resultado`, que é texto sem catálogo justamente para caber
 * situação assim.
 */
export type ResultadoApuracao = 'conquistada' | 'entregue_em_parte' | 'descumprida' | 'sem_quorum';

/** Fração mínima de apoiadores que precisa responder para a apuração valer. */
export const QUORUM_MINIMO = 0.1;

export type ContagemRespostas = Readonly<Record<RespostaConferencia, number>>;

export interface ParametrosApuracao {
  /** Quantas pessoas apoiaram a pauta e podiam responder. */
  apoiadores: number;
  respostas: ContagemRespostas;
}

export interface Apuracao {
  resultado: ResultadoApuracao;
  respondentes: number;
  /** Fração de apoiadores que respondeu, entre 0 e 1. */
  participacao: number;
  temQuorum: boolean;
}

function exigirInteiroNaoNegativo(valor: number, campo: string): void {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new RangeError(`${campo} inválido: ${String(valor)}`);
  }
}

/**
 * Apura a conferência de uma promessa (RN10).
 *
 * Com quórum, exige **maioria absoluta** para os dois extremos: mais da metade
 * de quem respondeu precisa dizer "sim" para virar conquista, e mais da metade
 * precisa dizer "não" para virar descumprida. Qualquer outro desenho da base —
 * inclusive empate — cai em `entregue_em_parte`, que é o resultado honesto
 * quando quem apoiou não chegou a um acordo.
 *
 * Maioria simples não serviria: com 40% "sim", 35% "não" e 25% "em parte", o
 * "sim" ganharia no grito e a pauta seria anunciada como conquista com 60% da
 * base discordando.
 */
export function apurarConferencia({ apoiadores, respostas }: ParametrosApuracao): Apuracao {
  exigirInteiroNaoNegativo(apoiadores, 'apoiadores');
  exigirInteiroNaoNegativo(respostas.sim, 'respostas.sim');
  exigirInteiroNaoNegativo(respostas.em_parte, 'respostas.em_parte');
  exigirInteiroNaoNegativo(respostas.nao, 'respostas.nao');

  if (apoiadores === 0) {
    throw new RangeError('apuração sem apoiadores: a promessa não deveria existir');
  }

  const respondentes = respostas.sim + respostas.em_parte + respostas.nao;
  if (respondentes > apoiadores) {
    throw new RangeError(
      `respostas (${String(respondentes)}) acima do número de apoiadores (${String(apoiadores)})`,
    );
  }

  const participacao = respondentes / apoiadores;
  const temQuorum = participacao >= QUORUM_MINIMO;

  if (!temQuorum) {
    return { resultado: 'sem_quorum', respondentes, participacao, temQuorum };
  }

  const metade = respondentes / 2;
  const resultado: ResultadoApuracao =
    respostas.sim > metade
      ? 'conquistada'
      : respostas.nao > metade
        ? 'descumprida'
        : 'entregue_em_parte';

  return { resultado, respondentes, participacao, temQuorum };
}
/* -------------------------------------------------------------------------- */
/* RF-B17 · Captar a resposta do apoiador                                      */
/* -------------------------------------------------------------------------- */

/**
 * Formas de responder que o bot aceita, por valor.
 *
 * Casamento exato depois de normalizar, não busca por pedaço: "não sei" e "não
 * entendi" contêm "não" e não são resposta nenhuma. Quando nada casa, a função
 * devolve `null` e quem chama repete a pergunta — melhor perguntar de novo do
 * que registrar um "não" que a pessoa não deu.
 *
 * Os números cobrem a lista de opções do WhatsApp, em que a pessoa costuma
 * responder digitando o número do item.
 */
const FORMAS: Readonly<Record<RespostaConferencia, readonly string[]>> = Object.freeze({
  sim: ['sim', 's', '1', 'foi', 'foi feito', 'ja foi', 'sim foi', 'feito', 'resolvido', 'resolveu'],
  em_parte: [
    'em parte',
    'em partes',
    '2',
    'parte',
    'parcial',
    'parcialmente',
    'mais ou menos',
    'meio termo',
    'em parte sim',
    'nao totalmente',
    'nao completamente',
  ],
  nao: ['nao', 'n', '3', 'nada', 'nao foi', 'nao foi feito', 'negativo', 'continua igual'],
});

/** Minúsculas, sem acento, sem pontuação nas pontas, espaços colapsados. */
function normalizarResposta(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Traduz o que o apoiador escreveu para um valor de resposta.
 *
 * Devolve `null` quando não dá para ter certeza. Nunca chuta: registrar a
 * resposta errada de alguém é pior do que perguntar outra vez.
 */
export function interpretarResposta(texto: string): RespostaConferencia | null {
  const limpo = normalizarResposta(texto);
  if (limpo === '') return null;

  for (const [valor, formas] of Object.entries(FORMAS) as [
    RespostaConferencia,
    readonly string[],
  ][]) {
    if (formas.includes(limpo)) return valor;
  }
  return null;
}
