import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Erro from '../app/error';
import exemplo from '../dados/exemplo.json';
import { ListaVazia } from './ListaVazia';

describe('estados da lista', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('vazio no campus: anuncia com role=status e não oferece limpar filtro', () => {
    const html = renderToStaticMarkup(<ListaVazia bloco={undefined} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Ainda não tem pauta no site.');
    expect(html).not.toContain('Ver todos os blocos');
  });

  it('vazio num bloco: diz o bloco e leva de volta para todos', () => {
    const html = renderToStaticMarkup(<ListaVazia bloco={exemplo.blocos[2]} />);
    expect(html).toContain('Ainda não tem pauta no Bloco C.');
    expect(html).toContain('href="/"');
  });

  it('relatar um problema abre o WhatsApp do bot quando o número está configurado', () => {
    expect(renderToStaticMarkup(<ListaVazia bloco={undefined} />)).not.toContain('wa.me');
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
    expect(renderToStaticMarkup(<ListaVazia bloco={undefined} />)).toContain(
      'href="https://wa.me/5582999999999"',
    );
  });

  it('erro: anuncia com role=alert e tem o botão de tentar de novo', () => {
    const html = renderToStaticMarkup(<Erro retry={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Tentar de novo');
  });
});
