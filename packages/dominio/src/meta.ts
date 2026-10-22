/**
 * RN04 · Meta de apoios de uma pauta.
 *
 * Meta = 10% dos estudantes com aula no bloco, com mínimo de 30 e máximo de 300.
 * Pauta do campus inteiro (sem bloco) usa o máximo.
 *
 * Exemplo inicial do pacote; a regra completa (gravação, meta congelada etc.) é da T9.
 */
export const META_MINIMA = 30;
export const META_MAXIMA = 300;

export interface BlocoParaMeta {
  /** Número de estudantes com aula no bloco. */
  baseEstudantes: number;
}

export function calcularMeta(bloco: BlocoParaMeta | null): number {
  if (bloco === null) return META_MAXIMA;

  const { baseEstudantes } = bloco;
  if (!Number.isInteger(baseEstudantes) || baseEstudantes < 0) {
    throw new RangeError(`base_estudantes inválida: ${String(baseEstudantes)}`);
  }

  const dezPorCento = Math.ceil(baseEstudantes * 0.1);
  return Math.min(META_MAXIMA, Math.max(META_MINIMA, dezPorCento));
}
