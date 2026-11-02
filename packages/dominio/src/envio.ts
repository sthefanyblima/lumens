/**
 * RNF06 · Limite de pessoas que o bot pode alcançar por conta própria.
 *
 * A Meta limita quantas PESSOAS DIFERENTES o bot alcança fora da janela de
 * atendimento numa janela MÓVEL de 24 horas: 250 para um portfólio novo
 * (SCRUM-191). Não são conversas e não é dia civil — não zera à meia-noite, e
 * a segunda mensagem para quem já foi alcançado nas últimas 24h não gasta
 * nada.
 *
 * A Parte 3 tem três disparos coletivos para a mesma lista ao longo da vida de
 * uma pauta (meta batida, resposta oficial e conferência). Uma pauta de meta
 * máxima tem 300 apoiadores, mais do que cabe em 24h. Quando o limite acaba,
 * alguém espera, e quem espera é decisão da equipe, não do código: por isso a
 * ordem de prioridade mora aqui, num lugar só.
 *
 * Este módulo é só a política: decide o que sai agora e o que espera. A fila
 * persistida, que alimenta esta função e guarda o registro de entrega, está em
 * `fila.ts`.
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

/** Limite da Meta para um portfólio novo, em pessoas distintas por 24h móveis (RNF06). */
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
   * Preenchido quando o disparo já saiu. Disparo que saiu nunca volta para a
   * fila — é o que garante que um processo que caiu no meio de um lote não
   * reenvie para quem já recebeu.
   */
  entregueEm?: Date | null;
}

export interface PlanoDeEnvio {
  /** Cabem no limite agora, já na ordem de envio. */
  enviarAgora: Disparo[];
  /** Não couberam. Voltam ao próximo planejamento, sem perder a ordem. */
  adiados: Disparo[];
  /** Quantas pessoas novas ainda cabem depois deste lote. */
  orcamentoRestante: number;
}

export interface ParametrosDeEnvio {
  pendentes: readonly Disparo[];
  /**
   * Pessoas distintas por 24h móveis. Normalmente `ORCAMENTO_SEM_VERIFICACAO`;
   * sobe quando a Meta sobe o nível do portfólio.
   */
  limite: number;
  /**
   * Destinatários que o bot já alcançou nas últimas 24h, de qualquer tipo.
   * Cada um já ocupa uma vaga do limite, e mandar de novo para ele não ocupa
   * outra.
   */
  alcancados: ReadonlySet<string>;
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
 * Decide quais disparos pendentes cabem no limite agora.
 *
 * Descarta o que já saiu, junta duplicatas, ordena por prioridade e corta no
 * limite de pessoas. Não envia nada e não toca no banco: devolve o plano para
 * quem chama executar.
 */
export function planejarEnvio({ pendentes, limite, alcancados }: ParametrosDeEnvio): PlanoDeEnvio {
  exigirInteiroNaoNegativo(limite, 'limite');

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

  // Limite já estourado não vira saldo negativo: só sai o que é de graça.
  let restante = Math.max(0, limite - alcancados.size);
  const jaAlcancados = new Set(alcancados);
  const enviarAgora: Disparo[] = [];
  const adiados: Disparo[] = [];

  for (const disparo of fila) {
    // Quem já foi alcançado nas últimas 24h, ou neste mesmo lote, não ocupa
    // vaga nova. Por isso um disparo grátis pode sair mesmo depois de o
    // limite acabar, sem passar na frente de ninguém: ele não tira a vaga de
    // quem ficou esperando.
    if (jaAlcancados.has(disparo.destinatario)) {
      enviarAgora.push(disparo);
    } else if (restante > 0) {
      enviarAgora.push(disparo);
      jaAlcancados.add(disparo.destinatario);
      restante--;
    } else {
      adiados.push(disparo);
    }
  }

  return { enviarAgora, adiados, orcamentoRestante: restante };
}
