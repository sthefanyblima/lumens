/**
 * Mensagens modelo da Parte 3 (RNF04).
 *
 * Fora da janela de atendimento de 24h, o bot só pode escrever primeiro com uma
 * mensagem modelo que a Meta aprovou antes. Os cinco avisos que o bot inicia
 * moram aqui, num lugar só, porque o texto que a Meta aprovou e o código que
 * envia precisam concordar em nome, idioma e número de variáveis: qualquer
 * diferença e a Meta recusa o envio.
 *
 * Todos são da categoria UTILITY. Utilitário é mais barato que marketing e não
 * pesa contra a qualidade do número, mas só passa assim se o texto for sobre
 * algo específico da pessoa e sem apelo nenhum: nada de "compartilhe", "ajude a
 * divulgar" ou exclamação de campanha. Mensagem com cara de campanha a Meta
 * reclassifica como marketing, e a decisão da SCRUM-192 depende de isso não
 * acontecer.
 *
 * Mudar um texto depois de aprovado exige nova aprovação. Corrija aqui, rode o
 * script de submissão de novo e só depois faça deploy de quem envia.
 */

export type NomeModelo =
  | 'lumens_meta_batida'
  | 'lumens_resposta_oficial'
  | 'lumens_conferencia'
  | 'lumens_lembrete_prazo'
  | 'lumens_owner_inativo';

export type BotaoModelo =
  /** Resposta rápida: o texto do botão volta ao webhook como mensagem do tipo `button`. */
  | { tipo: 'QUICK_REPLY'; texto: string }
  /**
   * Link para a página da pauta. O domínio entra na submissão, não aqui, porque
   * o site ainda está em homologação: `{{1}}` é o slug, como em `/p/{slug}`.
   */
  | { tipo: 'URL'; texto: string; caminho: '/p/{{1}}'; exemploSlug: string };

export interface ModeloMensagem {
  nome: NomeModelo;
  categoria: 'UTILITY';
  idioma: 'pt_BR';
  /** Para quem vai. Não é enviado à Meta: documenta quem a rotina deve escolher. */
  destinatario: 'apoiadores' | 'responsaveis';
  /** Texto com variáveis posicionais `{{1}}`, `{{2}}`... */
  corpo: string;
  /** Um exemplo por variável, na mesma ordem. A Meta exige na submissão. */
  exemplos: readonly string[];
  rodape: string;
  botoes: readonly BotaoModelo[];
}

const RODAPE = 'Lumens · pautas estudantis da UFAL';

const VER_PAUTA = {
  tipo: 'URL',
  texto: 'Ver a pauta',
  caminho: '/p/{{1}}',
  exemploSlug: 'bebedouro-quebrado-bloco-12',
} as const satisfies BotaoModelo;

export const MODELOS: Readonly<Record<NomeModelo, ModeloMensagem>> = Object.freeze({
  lumens_meta_batida: {
    nome: 'lumens_meta_batida',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    destinatario: 'apoiadores',
    corpo:
      'A pauta "{{1}}", que você apoiou, chegou à meta de {{2}} apoios. ' +
      'Agora ela segue para os responsáveis na universidade, e você recebe aqui a resposta oficial quando ela chegar.',
    exemplos: ['Bebedouro quebrado no bloco 12', '120'],
    rodape: RODAPE,
    botoes: [VER_PAUTA],
  },

  lumens_resposta_oficial: {
    nome: 'lumens_resposta_oficial',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    destinatario: 'apoiadores',
    corpo:
      'A pauta "{{1}}", que você apoiou, recebeu resposta oficial de {{2}}. ' +
      'A resposta completa está na página da pauta.',
    exemplos: ['Bebedouro quebrado no bloco 12', 'Pró-Reitoria de Gestão Institucional'],
    rodape: RODAPE,
    botoes: [VER_PAUTA],
  },

  // "Foi feito?" (RN10). Os três botões são exatamente formas que
  // `interpretarResposta` aceita, então tocar no botão e digitar a resposta
  // caem no mesmo caminho.
  lumens_conferencia: {
    nome: 'lumens_conferencia',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    destinatario: 'apoiadores',
    corpo:
      'A pauta "{{1}}", que você apoiou, tinha uma promessa para {{2}}: {{3}}. ' +
      'Foi feito? Você pode responder até {{4}}, e a resposta de quem apoiou decide o resultado que aparece no site.',
    exemplos: [
      'Bebedouro quebrado no bloco 12',
      '15/10/2026',
      'trocar o bebedouro do térreo',
      '22/10/2026',
    ],
    rodape: RODAPE,
    botoes: [
      { tipo: 'QUICK_REPLY', texto: 'Sim' },
      { tipo: 'QUICK_REPLY', texto: 'Em parte' },
      { tipo: 'QUICK_REPLY', texto: 'Não' },
    ],
  },

  lumens_lembrete_prazo: {
    nome: 'lumens_lembrete_prazo',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    destinatario: 'responsaveis',
    corpo:
      'Lembrete da pauta "{{1}}": o prazo da UFAL para responder à manifestação no Fala.BR vence em {{2}}. ' +
      'Avisamos aqui quando a resposta chegar.',
    exemplos: ['Bebedouro quebrado no bloco 12', '31/10/2026'],
    rodape: RODAPE,
    botoes: [VER_PAUTA],
  },

  lumens_owner_inativo: {
    nome: 'lumens_owner_inativo',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    destinatario: 'responsaveis',
    corpo:
      'Você é responsável pela pauta "{{1}}" e não vemos atividade sua nela desde {{2}}. ' +
      'Quer continuar como responsável?',
    exemplos: ['Bebedouro quebrado no bloco 12', '01/10/2026'],
    rodape: RODAPE,
    botoes: [
      { tipo: 'QUICK_REPLY', texto: 'Quero continuar' },
      { tipo: 'QUICK_REPLY', texto: 'Quero sair' },
    ],
  },
});

/** Componentes no formato da Graph API (`POST /{waba-id}/message_templates`). */
export interface SubmissaoModelo {
  name: string;
  language: string;
  category: string;
  components: (
    | { type: 'BODY'; text: string; example: { body_text: string[][] } }
    | { type: 'FOOTER'; text: string }
    | {
        type: 'BUTTONS';
        buttons: (
          | { type: 'QUICK_REPLY'; text: string }
          | { type: 'URL'; text: string; url: string; example: string[] }
        )[];
      }
  )[];
}

/**
 * Monta o corpo do pedido de criação do modelo na Meta.
 *
 * @param siteUrl origem pública do site, em https e sem barra no fim. É o que
 *   vai fixo no botão: mudar de domínio depois exige nova aprovação.
 */
export function paraSubmissao(modelo: ModeloMensagem, siteUrl: string): SubmissaoModelo {
  const origem = exigirOrigemHttps(siteUrl);

  const components: SubmissaoModelo['components'] = [
    { type: 'BODY', text: modelo.corpo, example: { body_text: [[...modelo.exemplos]] } },
    { type: 'FOOTER', text: modelo.rodape },
  ];

  if (modelo.botoes.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: modelo.botoes.map((botao) =>
        botao.tipo === 'QUICK_REPLY'
          ? { type: 'QUICK_REPLY', text: botao.texto }
          : {
              type: 'URL',
              text: botao.texto,
              url: origem + botao.caminho,
              example: [origem + botao.caminho.replace('{{1}}', botao.exemploSlug)],
            },
      ),
    });
  }

  return {
    name: modelo.nome,
    language: modelo.idioma,
    category: modelo.categoria,
    components,
  };
}

function exigirOrigemHttps(siteUrl: string): string {
  let url: URL;
  try {
    url = new URL(siteUrl);
  } catch {
    throw new RangeError(`siteUrl inválida: ${siteUrl}`);
  }
  // Só a origem: um caminho ou uma barra no fim viraria `//p/` no botão, e o
  // erro só apareceria quando alguém tocasse no link já aprovado.
  if (url.protocol !== 'https:' || url.origin !== siteUrl) {
    throw new RangeError(`siteUrl precisa ser só a origem em https, como https://exemplo.com.br`);
  }
  return url.origin;
}
