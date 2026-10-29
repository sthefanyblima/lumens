import { describe, expect, it } from 'vitest';
import { QUORUM_MINIMO, type ContagemRespostas, apurarConferencia } from './conferencia';

const zero: ContagemRespostas = { sim: 0, em_parte: 0, nao: 0 };

/** Contagem só com os campos que interessam ao caso. */
const votos = (parcial: Partial<ContagemRespostas>): ContagemRespostas => ({ ...zero, ...parcial });

describe('apurarConferencia (RN10)', () => {
  describe('quórum', () => {
    it('abaixo de 10% não apura nada, mesmo com todo mundo dizendo sim', () => {
      // 29 de 300 é 9,67%: falta um para o quórum.
      const a = apurarConferencia({ apoiadores: 300, respostas: votos({ sim: 29 }) });

      expect(a.resultado).toBe('sem_quorum');
      expect(a.temQuorum).toBe(false);
    });

    it('exatamente 10% já vale', () => {
      const a = apurarConferencia({ apoiadores: 300, respostas: votos({ sim: 30 }) });

      expect(a.temQuorum).toBe(true);
      expect(a.resultado).toBe('conquistada');
    });

    it('ninguém respondeu', () => {
      const a = apurarConferencia({ apoiadores: 120, respostas: zero });

      expect(a.resultado).toBe('sem_quorum');
      expect(a.respondentes).toBe(0);
      expect(a.participacao).toBe(0);
    });

    it('relata a participação junto com o resultado', () => {
      const a = apurarConferencia({ apoiadores: 200, respostas: votos({ sim: 40, nao: 10 }) });

      expect(a.respondentes).toBe(50);
      expect(a.participacao).toBeCloseTo(0.25);
    });

    it('a régua do quórum é uma constante só', () => {
      expect(QUORUM_MINIMO).toBe(0.1);
    });
  });

  describe('decisão, com quórum', () => {
    it('maioria absoluta de sim vira conquista', () => {
      const a = apurarConferencia({
        apoiadores: 100,
        respostas: votos({ sim: 31, em_parte: 10, nao: 9 }),
      });

      expect(a.resultado).toBe('conquistada');
    });

    it('maioria absoluta de não vira descumprida', () => {
      const a = apurarConferencia({
        apoiadores: 100,
        respostas: votos({ sim: 5, em_parte: 5, nao: 30 }),
      });

      expect(a.resultado).toBe('descumprida');
    });

    it('maioria de "em parte" vira entregue em parte', () => {
      const a = apurarConferencia({
        apoiadores: 100,
        respostas: votos({ sim: 10, em_parte: 40, nao: 10 }),
      });

      expect(a.resultado).toBe('entregue_em_parte');
    });

    it('sim na frente sem maioria absoluta NÃO vira conquista', () => {
      // O caso que motiva a regra: 40% sim, 35% não, 25% em parte. No grito o
      // "sim" ganharia, e a pauta seria anunciada como conquista com 60% da
      // base discordando.
      const a = apurarConferencia({
        apoiadores: 100,
        respostas: votos({ sim: 40, em_parte: 25, nao: 35 }),
      });

      expect(a.resultado).toBe('entregue_em_parte');
    });

    it('não na frente sem maioria absoluta não vira descumprida', () => {
      const a = apurarConferencia({
        apoiadores: 100,
        respostas: votos({ sim: 35, em_parte: 25, nao: 40 }),
      });

      expect(a.resultado).toBe('entregue_em_parte');
    });

    it('empate entre sim e não cai em entregue em parte', () => {
      const a = apurarConferencia({
        apoiadores: 100,
        respostas: votos({ sim: 25, nao: 25 }),
      });

      expect(a.resultado).toBe('entregue_em_parte');
    });

    it('metade exata de sim não basta: maioria é mais da metade', () => {
      const a = apurarConferencia({
        apoiadores: 100,
        respostas: votos({ sim: 20, nao: 20 }),
      });

      expect(a.resultado).toBe('entregue_em_parte');
    });

    it('unanimidade de sim', () => {
      const a = apurarConferencia({ apoiadores: 50, respostas: votos({ sim: 50 }) });

      expect(a.resultado).toBe('conquistada');
      expect(a.participacao).toBe(1);
    });

    it('unanimidade de não', () => {
      const a = apurarConferencia({ apoiadores: 50, respostas: votos({ nao: 50 }) });

      expect(a.resultado).toBe('descumprida');
    });
  });

  describe('pauta pequena', () => {
    it('com a meta mínima de 30 apoiadores, bastam 3 respostas', () => {
      const a = apurarConferencia({ apoiadores: 30, respostas: votos({ sim: 2, nao: 1 }) });

      expect(a.temQuorum).toBe(true);
      expect(a.resultado).toBe('conquistada');
    });

    it('duas respostas em 30 ficam sem quórum', () => {
      const a = apurarConferencia({ apoiadores: 30, respostas: votos({ sim: 2 }) });

      expect(a.resultado).toBe('sem_quorum');
    });
  });

  describe('entradas inválidas', () => {
    it('promessa sem apoiador nenhum é inconsistência, não resultado', () => {
      expect(() => apurarConferencia({ apoiadores: 0, respostas: zero })).toThrow(RangeError);
    });

    it('mais respostas do que apoiadores é inconsistência', () => {
      expect(() => apurarConferencia({ apoiadores: 10, respostas: votos({ sim: 11 }) })).toThrow(
        RangeError,
      );
    });

    it.each([
      ['apoiadores negativo', { apoiadores: -1, respostas: zero }],
      ['apoiadores fracionário', { apoiadores: 10.5, respostas: zero }],
      ['voto negativo', { apoiadores: 10, respostas: votos({ sim: -1 }) }],
      ['voto fracionário', { apoiadores: 10, respostas: votos({ nao: 1.5 }) }],
    ])('rejeita %s', (_caso, params) => {
      expect(() => apurarConferencia(params)).toThrow(RangeError);
    });
  });
});
