import type { Pauta, StatusPauta } from './tipos';

// Pautas em curadoria ou recusadas nunca aparecem no site.
const FORA_DO_SITE: ReadonlySet<StatusPauta> = new Set(['em_curadoria', 'recusada']);

/**
 * Pautas que o site mostra, na ordem da lista:
 * mais apoios primeiro; no empate, a mais recente primeiro.
 */
export function pautasPublicas(pautas: readonly Pauta[]): Pauta[] {
  return pautas
    .filter((p) => !FORA_DO_SITE.has(p.status))
    .sort((a, b) => b.apoios - a.apoios || b.criada_em.localeCompare(a.criada_em));
}
