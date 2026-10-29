/**
 * Prazo de resposta do caminho oficial — os "30+30" do Fala.BR.
 *
 * Aberta a manifestação, a ouvidoria tem trinta dias para responder,
 * prorrogáveis uma única vez por igual período (Lei 13.460/2017, art. 16).
 * Daí o apelido: 30+30. O prazo é o que dá ao sistema a única cobrança que ele
 * tem — "faz tantos dias que a universidade não responde" —, então ele precisa
 * estar certo, e precisa estar calculado no momento em que o protocolo é
 * salvo, não recalculado a cada leitura.
 *
 * Três decisões de contagem, porque nenhuma delas é óbvia:
 *
 * 1. **Dias corridos, não úteis.** Nem a Lei 13.460/2017 nem o Decreto
 *    9.492/2018 falam em dias úteis, e o próprio Fala.BR mostra o prazo em
 *    corridos. Contar úteis esticaria o prazo em cerca de duas semanas e faria
 *    o sistema cobrar depois do que a lei permite.
 *
 * 2. **O dia da abertura não conta.** Prazo administrativo exclui o dia do
 *    começo e inclui o do vencimento (Lei 9.784/1999, art. 66). Abrir dia 1º
 *    de outubro vence dia 31, não dia 30.
 *
 * 3. **Vencimento em fim de semana não é empurrado.** O art. 66 §1 prorroga o
 *    prazo até o primeiro dia útil quando ele cai em dia sem expediente, e
 *    isto aqui não faz isso: depender de calendário de feriados — federal,
 *    estadual, municipal e o da própria UFAL — para uma data que serve para
 *    *avisar o estudante* trocaria uma imprecisão de um ou dois dias por uma
 *    dependência que ninguém vai manter. O erro fica para o lado seguro: o
 *    aviso sai no prazo corrido, nunca depois do que a lei concede.
 *
 * Datas aqui são dia civil em `YYYY-MM-DD`, do mesmo jeito que o Drizzle
 * entrega `caminho.prazo`. A conta é feita em UTC de propósito: somar
 * milissegundos em horário local erra o dia em toda virada de fuso, e dia
 * civil não tem hora para errar.
 */

/** Caminhos que uma pauta pode seguir (enum `tipo_caminho`). */
export type TipoCaminho = 'falabr' | 'comunidade' | 'representante';

/** Dias para a primeira resposta da ouvidoria. */
export const PRAZO_INICIAL_DIAS = 30;

/** Dias que a prorrogação, quando pedida, acrescenta. */
export const PRAZO_PRORROGACAO_DIAS = 30;

export interface ParametrosDePrazo {
  /** Dia em que a manifestação foi protocolada, em `YYYY-MM-DD`. */
  abertoEm: string;
  /** A ouvidoria prorrogou por mais trinta dias? */
  prorrogado?: boolean;
}

export interface Prazo {
  /** Dia em que o prazo vigente vence. É o valor de `caminho.prazo`. */
  vence: string;
  /** Vencimento dos trinta dias iniciais, mesmo quando houve prorrogação. */
  venceSemProrrogacao: string;
  prorrogado: boolean;
  /** Total de dias concedidos desde a abertura: 30, ou 60 com prorrogação. */
  diasConcedidos: number;
}

const MS_POR_DIA = 86_400_000;
const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dia civil `YYYY-MM-DD` para dias desde a época, em UTC. */
function paraDiaUtc(dia: string): number {
  const partes = RE_DIA.exec(dia);
  if (partes === null) {
    throw new RangeError(`data fora do formato YYYY-MM-DD: ${dia}`);
  }

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const diaDoMes = Number(partes[3]);

  const instante = Date.UTC(ano, mes - 1, diaDoMes);
  const conferencia = new Date(instante);

  // 31 de fevereiro casa com o formato e virou 3 de março no caminho.
  if (
    conferencia.getUTCFullYear() !== ano ||
    conferencia.getUTCMonth() !== mes - 1 ||
    conferencia.getUTCDate() !== diaDoMes
  ) {
    throw new RangeError(`data inexistente no calendário: ${dia}`);
  }

  return instante / MS_POR_DIA;
}

/** O caminho de volta. */
function paraDiaCivil(diaUtc: number): string {
  return new Date(diaUtc * MS_POR_DIA).toISOString().slice(0, 10);
}

/**
 * Calcula o prazo de resposta a partir do dia do protocolo.
 *
 * Lança `RangeError` quando a data não é um dia civil válido: prazo errado
 * calado é pior do que protocolo sem prazo, porque o sistema passa a cobrar a
 * universidade na data errada e em público.
 */
export function calcularPrazo({ abertoEm, prorrogado = false }: ParametrosDePrazo): Prazo {
  const abertura = paraDiaUtc(abertoEm);
  const diasConcedidos = prorrogado
    ? PRAZO_INICIAL_DIAS + PRAZO_PRORROGACAO_DIAS
    : PRAZO_INICIAL_DIAS;

  return {
    vence: paraDiaCivil(abertura + diasConcedidos),
    venceSemProrrogacao: paraDiaCivil(abertura + PRAZO_INICIAL_DIAS),
    prorrogado,
    diasConcedidos,
  };
}

/**
 * Prazo legal de um caminho, ou `null` quando não existe prazo.
 *
 * Só o Fala.BR tem prazo em lei. Caminho pela comunidade ou por representante
 * depende de disposição de quem atende, e inventar uma data para eles faria o
 * sistema cobrar uma dívida que não existe. Esta função existe para que a
 * diferença fique numa regra e não espalhada em cada chamada.
 */
export function prazoLegal(tipo: TipoCaminho, parametros: ParametrosDePrazo): Prazo | null {
  return tipo === 'falabr' ? calcularPrazo(parametros) : null;
}

/**
 * Dias que faltam para o prazo vencer, de um dia civil até o outro.
 *
 * Positivo ainda há tempo, zero vence hoje, negativo já venceu. É o que o
 * agendador usa para decidir quando avisar e quando dizer que passou.
 */
export function diasAteOPrazo(prazo: string, hoje: string): number {
  return paraDiaUtc(prazo) - paraDiaUtc(hoje);
}
