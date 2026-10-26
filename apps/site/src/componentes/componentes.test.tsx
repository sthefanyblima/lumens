import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { STATUS_PAUTA } from '../dados/tipos';
import { BarraApoios, formatarNumero, percentual } from './BarraApoios';
import { STATUS, StatusPill } from './StatusPill';

// Contraste WCAG 2.x entre duas cores #RRGGBB.
function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('percentual', () => {
  it('arredonda o progresso', () => {
    expect(percentual(41, 60)).toBe(68);
  });

  it('não passa de 100 com apoios acima da meta', () => {
    expect(percentual(356, 120)).toBe(100);
  });
});

it('formata números com separador de milhar', () => {
  expect(formatarNumero(1240)).toBe('1.240');
});

describe('BarraApoios', () => {
  it('anuncia o progresso para leitor de tela', () => {
    const html = renderToStaticMarkup(<BarraApoios apoios={1240} meta={300} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('1.240 de 300 apoios');
  });
});

describe('StatusPill', () => {
  it.each(STATUS_PAUTA)('%s mostra o rótulo escrito com contraste AA', (status) => {
    const { rotulo, fundo, texto } = STATUS[status];
    expect(renderToStaticMarkup(<StatusPill status={status} />)).toContain(rotulo);
    expect(contraste(fundo, texto)).toBeGreaterThanOrEqual(4.5);
  });
});

it('textos do card sobre fundo branco têm contraste AA', () => {
  expect(contraste('#5B4E75', '#FFFFFF')).toBeGreaterThanOrEqual(4.5); // legenda
  expect(contraste('#5A22C8', '#FFFFFF')).toBeGreaterThanOrEqual(4.5); // categoria · bloco
});
