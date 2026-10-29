/**
 * Gerador do texto da manifestação no Fala.BR, a partir da pauta.
 *
 * O Fala.BR não tem API: o bot monta o texto, o owner copia e protocola na
 * mão. Isso tem duas consequências que moldam este módulo.
 *
 * A primeira é que o texto precisa sair pronto. Quem está do outro lado é um
 * estudante no WhatsApp, não alguém com um formulário aberto na frente: se o
 * bot devolver um rascunho para completar, o que chega à ouvidoria é o que a
 * pressa permitir.
 *
 * A segunda é que não há como voltar atrás. Protocolado, o texto é documento
 * público num sistema federal. Por isso o gerador **confere o próprio
 * resultado** contra a RN08 antes de entregar: título e descrição são escritos
 * por estudantes e podem citar nomes, e quem monta o texto é o último ponto em
 * que isso ainda dá para pegar.
 *
 * O veredicto vem junto em vez de virar exceção. Pauta com nome no título não
 * é caso excepcional, é caso comum — a resposta certa é mostrar ao owner o que
 * editar, e isso é fluxo normal, não erro de programa.
 *
 * **Relatos ficam fora do texto, de propósito.** São texto livre de muita
 * gente e o maior acúmulo de dado pessoal do sistema; a manifestação não
 * precisa deles, porque o peso coletivo já vem do número de apoios. Se a
 * equipe quiser os relatos no corpo, cada um terá de passar pela RN08
 * individualmente e isso é outra decisão, não um parâmetro deste módulo.
 */
import { type OpcoesDeConferencia, type Veredicto, conferirAnonimato } from './anonimato';

export interface PautaParaTexto {
  titulo: string;
  descricao: string;
  /** Categoria da pauta, como a curadoria classificou. */
  categoria: string;
  /** Nome do bloco; `null` quando a pauta é do campus inteiro. */
  bloco: string | null;
  /** Apoios confirmados no momento da geração. */
  apoios: number;
  /** Meta de apoios da pauta (RN04). */
  meta: number;
}

export interface TextoFalaBr {
  /** O texto para o owner copiar no Fala.BR. */
  texto: string;
  /**
   * Conferência da RN08 sobre o texto gerado. Enquanto `anonimato.liberado`
   * for falso, este texto não pode ser protocolado.
   */
  anonimato: Veredicto;
}

/** Espaços colapsados e linhas em branco seguidas reduzidas a uma. */
function arrumarParagrafos(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((linha) => linha.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function exigirTexto(valor: string, campo: string): string {
  const limpo = arrumarParagrafos(valor);
  if (limpo === '') {
    throw new RangeError(`${campo} vazio: não há manifestação a protocolar`);
  }
  return limpo;
}

function exigirInteiroNaoNegativo(valor: number, campo: string): void {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new RangeError(`${campo} inválido: ${String(valor)}`);
  }
}

/**
 * Monta o texto da manifestação e confere a RN08 sobre ele.
 *
 * Escreve na terceira pessoa e no plural: a manifestação é de um coletivo de
 * estudantes, e primeira pessoa do singular ("eu reclamo que") tanto
 * enfraquece o pedido quanto convida quem escreve a se identificar.
 *
 * Lança `RangeError` quando falta o essencial — título, descrição, ou números
 * de apoio que não fecham. Texto incompleto protocolado é pior do que
 * protocolo não aberto: ocupa o número, começa a contar o prazo e não diz o
 * que a universidade precisa responder.
 */
export function gerarTextoFalaBr(
  pauta: PautaParaTexto,
  opcoes: OpcoesDeConferencia = {},
): TextoFalaBr {
  const titulo = exigirTexto(pauta.titulo, 'titulo');
  const descricao = exigirTexto(pauta.descricao, 'descricao');
  const categoria = exigirTexto(pauta.categoria, 'categoria');

  exigirInteiroNaoNegativo(pauta.apoios, 'apoios');
  exigirInteiroNaoNegativo(pauta.meta, 'meta');
  if (pauta.meta === 0) {
    throw new RangeError('meta inválida: 0');
  }
  if (pauta.apoios > pauta.meta) {
    // Não é erro de digitação possível: ou a meta foi lida de outra pauta, ou
    // a contagem de apoios veio de uma consulta errada. Protocolar com o
    // número inflado é afirmar em documento público algo que não se sustenta.
    throw new RangeError(`apoios (${String(pauta.apoios)}) acima da meta (${String(pauta.meta)})`);
  }

  const local = pauta.bloco === null ? 'Campus inteiro' : arrumarParagrafos(pauta.bloco);

  const texto = arrumarParagrafos(
    [
      `Assunto: ${titulo}`,
      '',
      `Categoria: ${categoria}`,
      `Local: ${local === '' ? 'Campus inteiro' : local}`,
      '',
      'Descrição',
      descricao,
      '',
      'Apoio',
      `Esta manifestação é apresentada coletivamente por ${String(pauta.apoios)} ` +
        `estudantes que registraram apoio a ela, de uma meta de ${String(pauta.meta)}.`,
      '',
      'Pedido',
      'Solicitamos posicionamento formal da universidade sobre o problema descrito, ' +
        'com indicação das providências previstas e do prazo para executá-las.',
    ].join('\n'),
  );

  return { texto, anonimato: conferirAnonimato(texto, opcoes) };
}
