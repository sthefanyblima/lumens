import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('base do painel de curadoria', () => {
  it('identifica a área restrita sem oferecer um login ainda inexistente', () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain('Painel de curadoria');
    expect(html).toContain('Área restrita');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('<form');
  });
});
