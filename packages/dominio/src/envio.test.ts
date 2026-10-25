import { describe, expect, it } from 'vitest';
import {
  ORCAMENTO_SEM_VERIFICACAO,
  PRIORIDADE,
  type Disparo,
  type TipoDisparo,
  planejarEnvio,
} from './envio';

const BASE = new Date('2026-10-24T09:00:00.000Z');

/** Disparo pendente, com minuto de chegada para controlar a ordem nos testes. */
function disparo(
  id: string,
  tipo: TipoDisparo,
  destinatario: string,
  minuto = 0,
  entregueEm: Date | null = null,
): Disparo {
  return {
    id,
    tipo,
    destinatario,
    enfileiradoEm: new Date(BASE.getTime() + minuto * 60_000),
    entregueEm,
  };
}

/** `n` apoiadores distintos esperando o mesmo aviso. */
function lote(tipo: TipoDisparo, n: number, minuto = 0): Disparo[] {
  return Array.from({ length: n }, (_, i) =>
    disparo(`${tipo}-${String(i).padStart(4, '0')}`, tipo, `estudante-${String(i)}`, minuto),
  );
}

const ids = (ds: Disparo[]): string[] => ds.map((d) => d.id);

describe('planejarEnvio (RNF06)', () => {
  it('manda tudo quando a cota cobre a fila inteira', () => {
    const plano = planejarEnvio({
      pendentes: lote('meta_batida', 30),
      orcamentoDiario: ORCAMENTO_SEM_VERIFICACAO,
      jaIniciadasHoje: 0,
    });

    expect(plano.enviarAgora).toHaveLength(30);
    expect(plano.adiados).toHaveLength(0);
    expect(plano.orcamentoRestante).toBe(220);
  });

  it('corta no orçamento e adia o resto', () => {
    // A pauta de meta máxima: 300 apoiadores contra uma cota de 250.
    const plano = planejarEnvio({
      pendentes: lote('meta_batida', 300),
      orcamentoDiario: ORCAMENTO_SEM_VERIFICACAO,
      jaIniciadasHoje: 0,
    });

    expect(plano.enviarAgora).toHaveLength(250);
    expect(plano.adiados).toHaveLength(50);
    expect(plano.orcamentoRestante).toBe(0);
  });

  it('desconta o que o bot já iniciou hoje', () => {
    const plano = planejarEnvio({
      pendentes: lote('meta_batida', 100),
      orcamentoDiario: ORCAMENTO_SEM_VERIFICACAO,
      jaIniciadasHoje: 240,
    });

    expect(plano.enviarAgora).toHaveLength(10);
    expect(plano.adiados).toHaveLength(90);
  });

  it('cota estourada não vira saldo negativo', () => {
    const plano = planejarEnvio({
      pendentes: lote('lembrete', 5),
      orcamentoDiario: ORCAMENTO_SEM_VERIFICACAO,
      jaIniciadasHoje: ORCAMENTO_SEM_VERIFICACAO + 17,
    });

    expect(plano.enviarAgora).toHaveLength(0);
    expect(plano.adiados).toHaveLength(5);
    expect(plano.orcamentoRestante).toBe(0);
  });

  describe('prioridade', () => {
    it('atende na ordem conferência → resposta oficial → meta batida → lembrete', () => {
      // Embaralhado de propósito, e o lembrete chegou primeiro.
      const pendentes = [
        disparo('d4', 'lembrete', 'a', 0),
        disparo('d3', 'meta_batida', 'b', 1),
        disparo('d1', 'conferencia', 'c', 3),
        disparo('d2', 'resposta_oficial', 'd', 2),
      ];

      const plano = planejarEnvio({ pendentes, orcamentoDiario: 4, jaIniciadasHoje: 0 });

      expect(ids(plano.enviarAgora)).toEqual(['d1', 'd2', 'd3', 'd4']);
    });

    it('a conferência passa na frente de um lote de meta batida que já estava na fila', () => {
      // O caso que motiva a regra: a conferência tem janela de 7 dias (RN10),
      // a meta batida não tem prazo nenhum.
      const pendentes = [
        ...lote('meta_batida', 250, 0),
        disparo('conf-1', 'conferencia', 'urgente', 120),
      ];

      const plano = planejarEnvio({
        pendentes,
        orcamentoDiario: ORCAMENTO_SEM_VERIFICACAO,
        jaIniciadasHoje: 0,
      });

      expect(plano.enviarAgora[0]?.id).toBe('conf-1');
      expect(plano.adiados).toHaveLength(1);
      expect(plano.adiados[0]?.tipo).toBe('meta_batida');
    });

    it('dentro do mesmo tipo, quem chegou antes vai antes', () => {
      const pendentes = [
        disparo('tarde', 'meta_batida', 'a', 10),
        disparo('cedo', 'meta_batida', 'b', 1),
      ];

      const plano = planejarEnvio({ pendentes, orcamentoDiario: 2, jaIniciadasHoje: 0 });

      expect(ids(plano.enviarAgora)).toEqual(['cedo', 'tarde']);
    });

    it('cobre todos os tipos declarados', () => {
      // Se alguém acrescentar um tipo e esquecer a prioridade, este teste cai.
      const tipos = Object.keys(PRIORIDADE) as TipoDisparo[];
      const pendentes = tipos.map((t, i) => disparo(`x${String(i)}`, t, `p${String(i)}`));

      const plano = planejarEnvio({
        pendentes,
        orcamentoDiario: tipos.length,
        jaIniciadasHoje: 0,
      });

      expect(plano.enviarAgora).toHaveLength(tipos.length);
      expect(new Set(Object.values(PRIORIDADE)).size).toBe(tipos.length);
    });
  });

  describe('retomada sem reenvio', () => {
    it('ignora quem já recebeu', () => {
      const pendentes = [
        disparo('ja', 'meta_batida', 'a', 0, new Date('2026-10-24T08:00:00.000Z')),
        disparo('falta', 'meta_batida', 'b', 0),
      ];

      const plano = planejarEnvio({ pendentes, orcamentoDiario: 10, jaIniciadasHoje: 0 });

      expect(ids(plano.enviarAgora)).toEqual(['falta']);
      expect(plano.adiados).toHaveLength(0);
    });

    it('retomar um lote interrompido manda só o que faltou, na mesma ordem', () => {
      const todos = lote('meta_batida', 300);

      const primeiro = planejarEnvio({
        pendentes: todos,
        orcamentoDiario: ORCAMENTO_SEM_VERIFICACAO,
        jaIniciadasHoje: 0,
      });

      // No dia seguinte: os 250 primeiros saíram, a cota zerou.
      const entregues = new Set(ids(primeiro.enviarAgora));
      const segundo = planejarEnvio({
        pendentes: todos.map((d) => (entregues.has(d.id) ? { ...d, entregueEm: new Date() } : d)),
        orcamentoDiario: ORCAMENTO_SEM_VERIFICACAO,
        jaIniciadasHoje: 0,
      });

      expect(segundo.enviarAgora).toHaveLength(50);
      expect(ids(segundo.enviarAgora)).toEqual(ids(primeiro.adiados));
      expect(ids(segundo.enviarAgora).some((id) => entregues.has(id))).toBe(false);
    });

    it('o mesmo aviso enfileirado duas vezes só sai uma', () => {
      const pendentes = [
        disparo('dup-tarde', 'meta_batida', 'mesma-pessoa', 5),
        disparo('dup-cedo', 'meta_batida', 'mesma-pessoa', 0),
      ];

      const plano = planejarEnvio({ pendentes, orcamentoDiario: 10, jaIniciadasHoje: 0 });

      expect(plano.enviarAgora).toHaveLength(1);
      // Fica a primeira: a pessoa mantém o lugar que já tinha na fila.
      expect(plano.enviarAgora[0]?.id).toBe('dup-cedo');
    });

    it('avisos de tipos diferentes para a mesma pessoa não se anulam', () => {
      const pendentes = [
        disparo('a', 'meta_batida', 'mesma-pessoa'),
        disparo('b', 'conferencia', 'mesma-pessoa'),
      ];

      const plano = planejarEnvio({ pendentes, orcamentoDiario: 10, jaIniciadasHoje: 0 });

      expect(plano.enviarAgora).toHaveLength(2);
    });
  });

  describe('entradas inválidas', () => {
    it.each([
      ['orcamentoDiario', { orcamentoDiario: -1, jaIniciadasHoje: 0 }],
      ['orcamentoDiario fracionário', { orcamentoDiario: 10.5, jaIniciadasHoje: 0 }],
      ['jaIniciadasHoje', { orcamentoDiario: 10, jaIniciadasHoje: -3 }],
    ])('rejeita %s', (_caso, params) => {
      expect(() => planejarEnvio({ pendentes: [], ...params })).toThrow(RangeError);
    });

    it('fila vazia devolve o orçamento inteiro', () => {
      const plano = planejarEnvio({
        pendentes: [],
        orcamentoDiario: ORCAMENTO_SEM_VERIFICACAO,
        jaIniciadasHoje: 0,
      });

      expect(plano.enviarAgora).toHaveLength(0);
      expect(plano.orcamentoRestante).toBe(ORCAMENTO_SEM_VERIFICACAO);
    });
  });

  it('não altera a lista que recebeu', () => {
    const pendentes = lote('meta_batida', 3, 0);
    const copia = [...pendentes];

    planejarEnvio({ pendentes, orcamentoDiario: 1, jaIniciadasHoje: 0 });

    expect(pendentes).toEqual(copia);
  });
});
