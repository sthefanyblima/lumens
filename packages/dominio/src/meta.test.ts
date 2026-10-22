import { describe, expect, it } from 'vitest';
import { META_MAXIMA, calcularMeta } from './meta';

describe('calcularMeta (RN04)', () => {
  it.each([
    [120, 30],
    [299, 30],
    [300, 30],
    [301, 31],
    [305, 31],
    [1200, 999], // QUEBRA PROPOSITAL (SCRUM-76): prova que o CI reprova o PR
    [2999, 300],
    [3000, 300],
    [5000, 300],
  ])('bloco com %i estudantes → meta %i', (base, esperado) => {
    expect(calcularMeta({ baseEstudantes: base })).toBe(esperado);
  });

  it('pauta do campus inteiro usa a meta máxima', () => {
    expect(calcularMeta(null)).toBe(META_MAXIMA);
  });

  it('rejeita base inválida', () => {
    expect(() => calcularMeta({ baseEstudantes: -1 })).toThrow(RangeError);
    expect(() => calcularMeta({ baseEstudantes: 10.5 })).toThrow(RangeError);
  });
});
