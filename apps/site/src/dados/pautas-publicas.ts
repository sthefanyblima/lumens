import type { Bloco, Pauta, StatusPauta } from './tipos';

// Pautas em curadoria ou recusadas nunca aparecem no site.
const FORA_DO_SITE: ReadonlySet<StatusPauta> = new Set(['em_curadoria', 'recusada']);

/**
 * Pautas que o site mostra, na ordem da lista:
 * mais apoios primeiro; no empate, a mais recente primeiro.
 * Com `bloco`, só as daquele bloco (as de todo o campus ficam de fora).
 */
export function pautasPublicas(pautas: readonly Pauta[], bloco?: Bloco): Pauta[] {
  return pautas
    .filter((p) => !FORA_DO_SITE.has(p.status) && (!bloco || p.bloco_slug === bloco.slug))
    .sort((a, b) => b.apoios - a.apoios || b.criada_em.localeCompare(a.criada_em));
}

/** Bloco do `?bloco=`; slug que não existe ou repetido na URL vale como "Todos os blocos". */
export function blocoDaUrl(blocos: readonly Bloco[], param: string | string[] | undefined) {
  return typeof param === 'string' ? blocos.find((b) => b.slug === param) : undefined;
}

// Ainda correndo: juntando apoios ou cobrando a gestão. Entregue em parte, descumprida e conquistada já encerraram.
const ABERTAS: ReadonlySet<StatusPauta> = new Set([
  'juntando_apoios',
  'meta_batida',
  'cobrando',
  'prometido',
]);

/** Totais da faixa do topo, sobre a lista que está na tela (já filtrada por bloco, se houver filtro). */
export function totais(pautas: readonly Pauta[]) {
  return {
    abertas: pautas.filter((p) => ABERTAS.has(p.status)).length,
    apoios: pautas.reduce((soma, p) => soma + p.apoios, 0),
    conquistas: pautas.filter((p) => p.status === 'conquistada').length,
  };
}
