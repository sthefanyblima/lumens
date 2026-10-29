import { describe, expect, it } from 'vitest';
import {
  PRAZO_INICIAL_DIAS,
  PRAZO_PRORROGACAO_DIAS,
  calcularPrazo,
  diasAteOPrazo,
  prazoLegal,
} from './prazo';

const MS_POR_DIA = 86_400_000;

describe('calcularPrazo (30+30 do Fala.BR)', () => {
  describe('contagem', () => {
    it('o dia da abertura não conta: 1º de outubro vence dia 31', () => {
      // Lei 9.784/1999, art. 66: exclui o dia do começo, inclui o do
      // vencimento. Vencer dia 30 seria dar 29 dias à ouvidoria.
      expect(calcularPrazo({ abertoEm: '2026-10-01' }).vence).toBe('2026-10-31');
    });

    it('prorrogação dobra o prazo, contada da abertura', () => {
      const p = calcularPrazo({ abertoEm: '2026-10-01', prorrogado: true });

      expect(p.vence).toBe('2026-11-30');
      expect(p.diasConcedidos).toBe(60);
    });

    it('sem prorrogação são 30 dias', () => {
      const p = calcularPrazo({ abertoEm: '2026-10-01' });

      expect(p.prorrogado).toBe(false);
      expect(p.diasConcedidos).toBe(30);
    });

    it('guarda o vencimento original mesmo depois de prorrogar', () => {
      // O site mostra "prorrogado de 31/10 para 30/11"; sem os dois a
      // prorrogação fica invisível e parece que o prazo sempre foi esse.
      const p = calcularPrazo({ abertoEm: '2026-10-01', prorrogado: true });

      expect(p.venceSemProrrogacao).toBe('2026-10-31');
      expect(p.vence).toBe('2026-11-30');
    });

    it('as duas réguas são constantes, não números soltos', () => {
      expect(PRAZO_INICIAL_DIAS).toBe(30);
      expect(PRAZO_PRORROGACAO_DIAS).toBe(30);
    });
  });

  describe('viradas de calendário', () => {
    it.each([
      ['fim de mês curto', '2026-01-31', '2026-03-02'],
      ['virada de ano', '2026-12-15', '2027-01-14'],
      ['fevereiro de 28 dias', '2027-02-10', '2027-03-12'],
      ['fevereiro de 29 dias', '2028-02-10', '2028-03-11'],
      ['véspera de ano novo', '2026-12-31', '2027-01-30'],
    ])('%s: %s vence em %s', (_caso, abertoEm, esperado) => {
      expect(calcularPrazo({ abertoEm }).vence).toBe(esperado);
    });

    it('virada de ano com prorrogação', () => {
      expect(calcularPrazo({ abertoEm: '2026-12-15', prorrogado: true }).vence).toBe('2027-02-13');
    });

    it('atravessa entrada e saída de horário de verão', () => {
      // A conta é feita em UTC justamente para não depender do fuso da
      // máquina. Estes dois intervalos cruzam o início (4/11/2018) e o fim
      // (17/2/2019) do último horário de verão brasileiro, que é onde
      // aritmética em horário local costuma escorregar um dia.
      expect(calcularPrazo({ abertoEm: '2018-10-20' }).vence).toBe('2018-11-19');
      expect(calcularPrazo({ abertoEm: '2019-01-20' }).vence).toBe('2019-02-19');
    });

    it('todo dia de 2026 vence exatamente 30 dias depois', () => {
      const dia = new Date(Date.UTC(2026, 0, 1));

      for (let i = 0; i < 365; i++) {
        const abertoEm = dia.toISOString().slice(0, 10);
        const esperado = new Date(dia.getTime() + 30 * MS_POR_DIA).toISOString().slice(0, 10);

        expect(calcularPrazo({ abertoEm }).vence).toBe(esperado);
        dia.setUTCDate(dia.getUTCDate() + 1);
      }
    });
  });

  describe('datas que não servem', () => {
    it.each([
      ['dia que não existe no mês', '2026-02-30'],
      ['mês 13', '2026-13-01'],
      ['mês zero', '2026-00-10'],
      ['dia zero', '2026-01-00'],
      ['formato brasileiro', '01/10/2026'],
      ['mês e dia sem zero à esquerda', '2026-1-1'],
      ['instante em vez de dia', '2026-10-01T00:00:00Z'],
      ['vazio', ''],
      ['texto', 'ontem'],
    ])('rejeita %s', (_caso, abertoEm) => {
      expect(() => calcularPrazo({ abertoEm })).toThrow(RangeError);
    });

    it('rejeita ano de dois dígitos escrito com zeros', () => {
      // `Date.UTC(26, ...)` entende 1926. Melhor recusar do que calcular o
      // prazo de um protocolo aberto no século passado.
      expect(() => calcularPrazo({ abertoEm: '0026-01-01' })).toThrow(RangeError);
    });
  });
});

describe('prazoLegal', () => {
  it('Fala.BR tem prazo', () => {
    expect(prazoLegal('falabr', { abertoEm: '2026-10-01' })?.vence).toBe('2026-10-31');
  });

  it.each([['comunidade'], ['representante']] as const)('%s não tem prazo em lei', (tipo) => {
    // Inventar uma data aqui faria o sistema cobrar em público uma dívida que
    // ninguém assumiu.
    expect(prazoLegal(tipo, { abertoEm: '2026-10-01' })).toBeNull();
  });
});

describe('diasAteOPrazo', () => {
  it('positivo enquanto há tempo', () => {
    expect(diasAteOPrazo('2026-10-31', '2026-10-24')).toBe(7);
  });

  it('zero no dia do vencimento', () => {
    // O dia do vencimento ainda é prazo: a ouvidoria pode responder hoje.
    expect(diasAteOPrazo('2026-10-31', '2026-10-31')).toBe(0);
  });

  it('negativo depois de vencer', () => {
    expect(diasAteOPrazo('2026-10-31', '2026-11-02')).toBe(-2);
  });

  it('atravessa a virada de ano', () => {
    expect(diasAteOPrazo('2027-01-14', '2026-12-15')).toBe(30);
  });

  it('fecha com o prazo que acabou de ser calculado', () => {
    const p = calcularPrazo({ abertoEm: '2026-10-01' });

    expect(diasAteOPrazo(p.vence, '2026-10-01')).toBe(PRAZO_INICIAL_DIAS);
  });

  it('rejeita data inválida dos dois lados', () => {
    expect(() => diasAteOPrazo('2026-02-30', '2026-01-01')).toThrow(RangeError);
    expect(() => diasAteOPrazo('2026-01-01', 'hoje')).toThrow(RangeError);
  });
});
