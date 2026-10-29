import { describe, expect, it } from 'vitest';
import { PAUTAS_TESTE } from './pautas-teste';
import exemplo from './exemplo.json';
import { blocoDaUrl, pautasPublicas, totais } from './pautas-publicas';

describe('pautasPublicas', () => {
  const lista = pautasPublicas(PAUTAS_TESTE);

  it('nunca mostra pautas em curadoria ou recusadas', () => {
    expect(lista.map((p) => p.status)).not.toContain('em_curadoria');
    expect(lista.map((p) => p.status)).not.toContain('recusada');
    expect(lista).toHaveLength(PAUTAS_TESTE.length - 2);
  });

  it('ordena por mais apoios primeiro', () => {
    const apoios = lista.map((p) => p.apoios);
    expect(apoios).toEqual([...apoios].sort((a, b) => b - a));
  });

  it('no empate de apoios, a mais recente vem primeiro', () => {
    const [base] = PAUTAS_TESTE.filter((p) => p.status === 'cobrando');
    if (!base) throw new Error('faltou pauta de teste em cobrando');
    const antiga = { ...base, slug: 'antiga', criada_em: '2026-01-01T10:00:00-03:00' };
    const nova = { ...base, slug: 'nova', criada_em: '2026-09-01T10:00:00-03:00' };
    expect(pautasPublicas([antiga, nova]).map((p) => p.slug)).toEqual(['nova', 'antiga']);
  });

  it('não altera a lista original', () => {
    const copia = [...PAUTAS_TESTE];
    pautasPublicas(PAUTAS_TESTE);
    expect(PAUTAS_TESTE).toEqual(copia);
  });
});

describe('totais', () => {
  it('conta abertas, soma apoios e conta conquistas das pautas públicas', () => {
    // Públicas de teste: juntando_apoios 41, meta_batida 92, cobrando 318, prometido 1240,
    // entregue_em_parte 143, descumprida 356, conquistada 340.
    expect(totais(pautasPublicas(PAUTAS_TESTE))).toEqual({
      abertas: 4,
      apoios: 2530,
      conquistas: 1,
    });
  });

  it('lista vazia dá tudo zero', () => {
    expect(totais([])).toEqual({ abertas: 0, apoios: 0, conquistas: 0 });
  });
});

describe('filtro por bloco', () => {
  const { blocos } = exemplo;

  it('acha o bloco do ?bloco=', () => {
    expect(blocoDaUrl(blocos, 'bloco-a')?.nome).toBe('Bloco A');
  });

  it('bloco inválido, vazio ou repetido na URL vira "Todos os blocos"', () => {
    expect(blocoDaUrl(blocos, 'nao-existe')).toBeUndefined();
    expect(blocoDaUrl(blocos, '')).toBeUndefined();
    expect(blocoDaUrl(blocos, undefined)).toBeUndefined();
    expect(blocoDaUrl(blocos, ['bloco-a', 'bloco-b'])).toBeUndefined();
  });

  it('com bloco, mostra só as pautas públicas daquele bloco', () => {
    const blocoA = blocoDaUrl(blocos, 'bloco-a');
    const lista = pautasPublicas(PAUTAS_TESTE, blocoA);
    expect(lista.map((p) => p.status)).toEqual(['descumprida', 'entregue_em_parte']);
  });
});
