import { describe, expect, it } from 'vitest';
import { MODELOS, paraSubmissao, type ModeloMensagem } from './modelos';

const SITE = 'https://lumens.exemplo.com.br';
const modelos = Object.values(MODELOS);

function variaveis(texto: string): number[] {
  return [...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
}

describe('MODELOS (RNF04)', () => {
  it('tem os cinco avisos do critério de aceite da SCRUM-193', () => {
    expect(Object.keys(MODELOS).sort()).toEqual([
      'lumens_conferencia',
      'lumens_lembrete_prazo',
      'lumens_meta_batida',
      'lumens_owner_inativo',
      'lumens_resposta_oficial',
    ]);
  });

  it('a chave do catálogo é o nome do modelo', () => {
    for (const [chave, modelo] of Object.entries(MODELOS)) expect(modelo.nome).toBe(chave);
  });

  // As regras abaixo são as que fazem a Meta recusar a submissão. Pegar aqui
  // poupa a ida e volta de uma revisão que pode levar um dia.
  describe.each(modelos.map((m) => [m.nome, m] as const))('%s', (_nome, modelo: ModeloMensagem) => {
    it('nome só com minúsculas, dígitos e sublinhado', () => {
      expect(modelo.nome).toMatch(/^[a-z0-9_]{1,512}$/);
    });

    it('variáveis numeradas em sequência a partir de 1', () => {
      const usadas = [...new Set(variaveis(modelo.corpo))].sort((a, b) => a - b);
      expect(usadas).toEqual(usadas.map((_, i) => i + 1));
    });

    it('um exemplo para cada variável, nenhum vazio', () => {
      expect(modelo.exemplos).toHaveLength(new Set(variaveis(modelo.corpo)).size);
      for (const exemplo of modelo.exemplos) expect(exemplo.trim()).not.toBe('');
    });

    it('corpo não começa nem termina com variável', () => {
      expect(modelo.corpo).not.toMatch(/^\{\{\d+\}\}/);
      expect(modelo.corpo).not.toMatch(/\{\{\d+\}\}[.!?]?$/);
    });

    it('cabe nos limites de tamanho', () => {
      expect(modelo.corpo.length).toBeLessThanOrEqual(1024);
      expect(modelo.rodape.length).toBeLessThanOrEqual(60);
      for (const botao of modelo.botoes) expect(botao.texto.length).toBeLessThanOrEqual(25);
    });

    it('rodapé sem variável', () => {
      expect(variaveis(modelo.rodape)).toEqual([]);
    });
  });

  it('a conferência oferece exatamente as três respostas da RN10', () => {
    expect(MODELOS.lumens_conferencia.botoes.map((b) => b.texto)).toEqual([
      'Sim',
      'Em parte',
      'Não',
    ]);
  });
});

describe('paraSubmissao', () => {
  it('monta o pedido no formato da Graph API', () => {
    expect(paraSubmissao(MODELOS.lumens_resposta_oficial, SITE)).toEqual({
      name: 'lumens_resposta_oficial',
      language: 'pt_BR',
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: MODELOS.lumens_resposta_oficial.corpo,
          example: {
            body_text: [['Bebedouro quebrado no bloco 12', 'Pró-Reitoria de Gestão Institucional']],
          },
        },
        { type: 'FOOTER', text: 'Lumens · pautas estudantis da UFAL' },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'Ver a pauta',
              url: 'https://lumens.exemplo.com.br/p/{{1}}',
              example: ['https://lumens.exemplo.com.br/p/bebedouro-quebrado-bloco-12'],
            },
          ],
        },
      ],
    });
  });

  it('respostas rápidas vão só com o texto', () => {
    const { components } = paraSubmissao(MODELOS.lumens_conferencia, SITE);
    expect(components.at(-1)).toEqual({
      type: 'BUTTONS',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Sim' },
        { type: 'QUICK_REPLY', text: 'Em parte' },
        { type: 'QUICK_REPLY', text: 'Não' },
      ],
    });
  });

  it.each([
    ['barra no fim', 'https://lumens.exemplo.com.br/'],
    ['com caminho', 'https://lumens.exemplo.com.br/site'],
    ['sem https', 'http://lumens.exemplo.com.br'],
    ['que não é URL', 'lumens.exemplo.com.br'],
  ])('recusa siteUrl %s', (_caso, siteUrl) => {
    expect(() => paraSubmissao(MODELOS.lumens_meta_batida, siteUrl)).toThrow(RangeError);
  });
});
