/**
 * RNF06 · Orçamento diário de conversas iniciadas pelo bot.
 *
 * Sem verificação de empresa, a Meta deixa o bot INICIAR 250 conversas por dia.
 * A Parte 3 tem três disparos coletivos para a mesma lista ao longo da vida de
 * uma pauta (meta batida, resposta oficial e conferência), então uma pauta com
 * a meta máxima de 300 apoiadores consome ~900 conversas — cerca de quatro dias
 * de cota para uma pauta só. Quando a cota acaba, alguém fica para amanhã, e
 * quem fica é decisão da equipe, não do código: por isso a ordem de prioridade
 * mora aqui, num lugar só, e não espalhada em cada rotina que dispara.
 *
 * Este módulo é só a política: decide o que sai hoje e o que espera. A fila em
 * si (tabela, contador persistido e registro de entrega) entra junto com o
 * esquema do banco.
 */

/** Tipos de disparo que o bot inicia, do mais ao menos urgente. */
export type TipoDisparo = 'conferencia' | 'resposta_oficial' | 'meta_batida' | 'lembrete';

/**
 * Ordem de atendimento quando a cota do dia não cobre todo mundo.
 *
 * A conferência vem primeiro porque é a única com janela fechada: a apuração
 * da RN10 corre sete dias depois do disparo, então atrasar o envio encurta o
 * prazo de quem responde. Lembrete vem por último porque é o único que pode
 * esperar um dia sem mudar o resultado de nada.
 */
export const PRIORIDADE: Readonly<Record<TipoDisparo, number>> = Object.freeze({
  conferencia: 1,
  resposta_oficial: 2,
  meta_batida: 3,
  lembrete: 4,
});

/** Cota diária da Meta enquanto a empresa não é verificada (RNF06). */
export const ORCAMENTO_SEM_VERIFICACAO = 250;

export interface Disparo {
  /** Identificador da linha na fila. Desempata a ordem quando o resto empata. */
  id: string;
  tipo: TipoDisparo;
  /**
   * O que este aviso comunica: id da pauta, da promessa, do caminho. Duas
   * linhas da fila são cópias do mesmo aviso quando `tipo`, `aviso` e
   * `destinatario` batem — e só então.
   *
   * Sem este campo, dois avisos de `meta_batida` de pautas diferentes para a
   * mesma pessoa pareceriam duplicatas, e um deles desapareceria do plano
   * mesmo havendo cota para os dois.
   */
  aviso: string;
  /**
   * Id do estudante destinatário. Nunca o telefone: a RNF01 mantém identidade
   * fora de tudo que não precisa dela, e a fila não precisa.
   */
  destinatario: string;
  enfileiradoEm: Date;
  /**
   * Preenchido quando a Meta confirmou a entrega. Disparo entregue nunca volta
   * para a fila — é o que garante que um processo que caiu no meio de um lote
   * não reenvie para quem já recebeu.
   */
  entregueEm?: Date | null;
}

export interface PlanoDeEnvio {
  /** Cabem na cota de hoje, já na ordem de envio. */
  enviarAgora: Disparo[];
  /** Não couberam. Voltam ao próximo planejamento, sem perder a ordem. */
  adiados: Disparo[];
  /** Quanto ainda sobra da cota depois deste lote. */
  orcamentoRestante: number;
}

export interface ParametrosDeEnvio {
  pendentes: readonly Disparo[];
  /** Normalmente `ORCAMENTO_SEM_VERIFICACAO`; sobe quando a empresa for verificada. */
  orcamentoDiario: number;
  /** Conversas que o bot já iniciou hoje, de qualquer tipo. */
  jaIniciadasHoje: number;
}

function exigirInteiroNaoNegativo(valor: number, campo: string): void {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new RangeError(`${campo} inválido: ${String(valor)}`);
  }
}

/**
 * Identidade de um disparo: este aviso, deste tipo, para esta pessoa.
 *
 * Duas rotinas podem enfileirar o mesmo aviso (um reprocessamento da fila, um
 * gatilho que rodou duas vezes). Sem essa identidade o apoiador recebe a
 * mensagem repetida e a cota paga duas vezes pela mesma conversa.
 *
 * `tipo` continua na chave mesmo com `aviso` presente: a mesma pauta rende um
 * `meta_batida` e um `lembrete`, que são avisos diferentes sobre o mesmo
 * assunto e precisam sair os dois.
 */
function chave(d: Disparo): string {
  return `${d.tipo}\u0000${d.aviso}\u0000${d.destinatario}`;
}

function ordenar(a: Disparo, b: Disparo): number {
  const porPrioridade = PRIORIDADE[a.tipo] - PRIORIDADE[b.tipo];
  if (porPrioridade !== 0) return porPrioridade;

  const porChegada = a.enfileiradoEm.getTime() - b.enfileiradoEm.getTime();
  if (porChegada !== 0) return porChegada;

  // Último desempate para o plano ser determinístico: sem ele, dois disparos
  // enfileirados no mesmo milissegundo poderiam trocar de lado da cota a cada
  // execução, e o mesmo lote interrompido sairia diferente ao ser retomado.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Decide quais disparos pendentes cabem na cota de hoje.
 *
 * Descarta o que já foi entregue, junta duplicatas, ordena por prioridade e
 * corta no orçamento restante. Não envia nada e não toca no banco: devolve o
 * plano para quem chama executar.
 */
export function planejarEnvio({
  pendentes,
  orcamentoDiario,
  jaIniciadasHoje,
}: ParametrosDeEnvio): PlanoDeEnvio {
  exigirInteiroNaoNegativo(orcamentoDiario, 'orcamentoDiario');
  exigirInteiroNaoNegativo(jaIniciadasHoje, 'jaIniciadasHoje');

  // Primeira passada só para saber o que a Meta já entregou. Fazer isso antes
  // de juntar duplicatas é o que impede uma cópia pendente de reenviar um aviso
  // que já chegou: descartar o registro entregue na hora de encontrá-lo deixaria
  // a cópia órfã, e ela sairia como se fosse a primeira vez, cobrando a cota de
  // novo. Varrer tudo antes também torna o plano independente da posição em que
  // o registro entregue aparece na lista.
  const entregues = new Set<string>();
  for (const disparo of pendentes) {
    if (disparo.entregueEm != null) entregues.add(chave(disparo));
  }

  const unicos = new Map<string, Disparo>();
  for (const disparo of pendentes) {
    const k = chave(disparo);
    if (entregues.has(k)) continue;

    const existente = unicos.get(k);
    // Entre duplicatas fica a que entrou na fila primeiro, para a pessoa manter
    // o lugar que conquistou e não ser empurrada para o fim por um reprocesso.
    if (existente === undefined || ordenar(disparo, existente) < 0) {
      unicos.set(k, disparo);
    }
  }

  const fila = [...unicos.values()].sort(ordenar);

  // Cota já estourada não vira saldo negativo: hoje simplesmente não sai nada.
  const cabem = Math.max(0, orcamentoDiario - jaIniciadasHoje);
  const enviarAgora = fila.slice(0, cabem);

  return {
    enviarAgora,
    adiados: fila.slice(cabem),
    orcamentoRestante: cabem - enviarAgora.length,
  };
}
