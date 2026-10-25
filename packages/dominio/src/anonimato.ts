/**
 * RN08 · O texto que vai para o Fala.BR não leva nome de ninguém.
 *
 * O bot monta o texto a partir da pauta e o owner protocola na mão, porque o
 * Fala.BR não tem API. Uma vez protocolado, o texto vira documento público num
 * sistema federal e não dá para voltar atrás — então a conferência acontece
 * antes, aqui.
 *
 * Achar "um nome qualquer" em texto livre é problema de IA, e IA está fora do
 * escopo. Mas o caso real é bem mais fácil do que o caso geral: o texto é
 * gerado a partir de dados que o sistema já tem, e o sistema SABE o nome de
 * quem relatou, de quem apoiou e de quem é owner. Então a conferência não
 * adivinha — ela compara o texto com as identidades que não podem aparecer.
 *
 * Daí as duas camadas, com pesos diferentes de propósito:
 *
 *   bloqueio — certeza. Nome que o sistema conhece, e-mail, telefone,
 *              matrícula. Vazaria dado pessoal de verdade; o texto não sai.
 *   aviso    — suspeita. Padrões que SUGEREM nome que o sistema não conhece,
 *              como alguém citado no meio de um relato ("a professora Marta").
 *              Bloquear por heurística emperraria pauta legítima, e deixar
 *              passar calado vazaria. Então avisa e a pessoa decide.
 *
 * Esta função só confere e aponta. Quem chama decide o que fazer com o
 * resultado.
 */

export type Severidade = 'bloqueio' | 'aviso';

export type MotivoAchado = 'nome_conhecido' | 'email' | 'telefone' | 'matricula' | 'possivel_nome';

export interface Achado {
  severidade: Severidade;
  motivo: MotivoAchado;
  /** O trecho exato, como aparece no texto original. */
  trecho: string;
  /** Posições no texto original, para destacar o trecho para quem revisa. */
  inicio: number;
  fim: number;
}

export interface Veredicto {
  /** Verdadeiro quando não há nenhum bloqueio. Pode haver avisos. */
  liberado: boolean;
  achados: Achado[];
}

export interface OpcoesDeConferencia {
  /**
   * Nomes que o sistema conhece e que não podem aparecer: quem relatou, quem
   * apoiou, quem é owner. Vazio faz a conferência rodar só na camada de
   * suspeita — útil para texto que não veio de uma pauta.
   */
  nomesConhecidos?: readonly string[];
}

/**
 * Partículas de nome composto. Sozinhas não identificam ninguém, e "Santos" em
 * "Todos os Santos" não pode bloquear uma pauta.
 */
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van']);

/** Tamanho mínimo de um pedaço de nome para valer bloqueio sozinho. */
const MINIMO_DO_PEDACO = 3;

/**
 * Tratamentos que, em português, vêm colados num nome próprio. "estudante" e
 * "aluno" ficam de fora: aparecem o tempo todo falando de gente em geral
 * ("os estudantes pedem"), e virariam ruído em toda pauta.
 */
const TRATAMENTOS = [
  'professor',
  'professora',
  'prof',
  'profa',
  'coordenador',
  'coordenadora',
  'diretor',
  'diretora',
  'reitor',
  'reitora',
  'chefe',
  'senhor',
  'senhora',
  'sr',
  'sra',
  'seu',
  'dona',
  'dr',
  'dra',
  'doutor',
  'doutora',
];

const RE_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/**
 * Telefone brasileiro em formato reconhecível. Exige parênteses, traço ou
 * código do país: um número solto de oito dígitos é quase sempre outra coisa
 * (ano, quantia, protocolo), e a matrícula abaixo cobre as sequências longas.
 */
const RE_TELEFONE =
  /(?:\+?55[\s.-]?)?(?:\(\d{2}\)[\s.-]*\d{4,5}[\s.-]?\d{4}|\b\d{2}[\s.-]\d{4,5}[\s.-]?\d{4}\b|\b\d{4,5}-\d{4}\b)/g;

/** Matrícula da UFAL e qualquer outra sequência longa de dígitos. */
const RE_MATRICULA = /\b\d{8,12}\b/g;

const RE_COMBINANTES = /[̀-ͯ]/g;

interface TextoNormalizado {
  /** Minúsculas, sem acento. */
  texto: string;
  /** Para cada posição em `texto`, a posição correspondente no original. */
  indices: number[];
}

/**
 * Normaliza preservando o mapa de posições.
 *
 * Normalizar a string inteira de uma vez seria mais curto, mas a decomposição
 * muda o comprimento, e aí as posições encontradas não serviriam para destacar
 * nada no texto que a pessoa vê. Por isso o mapa, caractere a caractere.
 */
function normalizar(original: string): TextoNormalizado {
  let texto = '';
  const indices: number[] = [];

  for (let i = 0; i < original.length; i++) {
    const convertido = original
      .charAt(i)
      .normalize('NFD')
      .replace(RE_COMBINANTES, '')
      .toLowerCase();
    for (const c of convertido) {
      texto += c;
      indices.push(i);
    }
  }

  return { texto, indices };
}

interface Intervalo {
  inicio: number;
  fim: number;
}

/**
 * Converte um intervalo do texto normalizado no intervalo equivalente do
 * original. Devolve `undefined` quando o intervalo não existe — não acontece
 * com busca feita no próprio texto normalizado, mas deixa o tipo honesto.
 */
function paraOriginal(norm: TextoNormalizado, de: number, ate: number): Intervalo | undefined {
  const inicio = norm.indices[de];
  const ultimo = norm.indices[ate - 1];
  if (inicio === undefined || ultimo === undefined) return undefined;
  return { inicio, fim: ultimo + 1 };
}

function ehCaractereDePalavra(c: string | undefined): boolean {
  return c !== undefined && /[a-z0-9]/.test(c);
}

/** Verdadeiro quando o trecho não está grudado em outra palavra. */
function ehPalavraInteira(texto: string, inicio: number, fim: number): boolean {
  return !ehCaractereDePalavra(texto[inicio - 1]) && !ehCaractereDePalavra(texto[fim]);
}

function pedacosDoNome(nome: string): string[] {
  return normalizar(nome)
    .texto.split(/[^a-z0-9]+/)
    .filter((p) => p.length >= MINIMO_DO_PEDACO && !PARTICULAS.has(p));
}

function acharNomesConhecidos(
  original: string,
  norm: TextoNormalizado,
  nomes: readonly string[],
): Achado[] {
  const achados: Achado[] = [];

  // O nome inteiro primeiro: quando ele aparece completo, o trecho reportado
  // cobre os pedaços, e a limpeza no fim descarta os aninhados.
  const alvos = new Set<string>();
  for (const nome of nomes) {
    const pedacos = pedacosDoNome(nome);
    if (pedacos.length === 0) continue;
    if (pedacos.length > 1) alvos.add(pedacos.join(' '));
    for (const pedaco of pedacos) alvos.add(pedaco);
  }

  for (const alvo of alvos) {
    let de = norm.texto.indexOf(alvo);
    while (de !== -1) {
      const ate = de + alvo.length;
      const onde = ehPalavraInteira(norm.texto, de, ate) ? paraOriginal(norm, de, ate) : undefined;
      if (onde !== undefined) {
        achados.push({
          severidade: 'bloqueio',
          motivo: 'nome_conhecido',
          trecho: original.slice(onde.inicio, onde.fim),
          ...onde,
        });
      }
      de = norm.texto.indexOf(alvo, de + 1);
    }
  }

  return achados;
}

function acharPorPadrao(
  original: string,
  re: RegExp,
  motivo: MotivoAchado,
  severidade: Severidade,
): Achado[] {
  const achados: Achado[] = [];
  for (const m of original.matchAll(re)) {
    const trecho = m[0];
    if (trecho.trim() === '') continue;
    achados.push({
      severidade,
      motivo,
      trecho,
      inicio: m.index,
      fim: m.index + trecho.length,
    });
  }
  return achados;
}

/**
 * Tratamento seguido de palavra com inicial maiúscula: "a professora Marta".
 *
 * A inicial maiúscula é conferida no texto ORIGINAL, e é ela que separa a
 * pessoa do cargo: "coordenador do Restaurante" não dispara, porque o que vem
 * logo depois é "do", minúsculo.
 */
function acharPossiveisNomes(original: string, norm: TextoNormalizado): Achado[] {
  const achados: Achado[] = [];
  const re = new RegExp(`\\b(?:${TRATAMENTOS.join('|')})\\.?\\s+([a-z][a-z0-9]*)`, 'g');

  for (const m of norm.texto.matchAll(re)) {
    const palavra = m[1];
    if (palavra === undefined) continue;

    const deNorm = m.index + m[0].length - palavra.length;
    const daPalavra = paraOriginal(norm, deNorm, deNorm + palavra.length);
    const doTrecho = paraOriginal(norm, m.index, deNorm + palavra.length);
    if (daPalavra === undefined || doTrecho === undefined) continue;

    const primeira = original.charAt(daPalavra.inicio);
    if (primeira !== primeira.toUpperCase() || primeira === primeira.toLowerCase()) continue;

    achados.push({
      severidade: 'aviso',
      motivo: 'possivel_nome',
      trecho: original.slice(doTrecho.inicio, doTrecho.fim),
      ...doTrecho,
    });
  }

  return achados;
}

/**
 * Ordena por posição e descarta achado contido em outro.
 *
 * Sem isso, "João Gabriel Seixas" sairia quatro vezes — uma pelo nome inteiro e
 * uma por pedaço — e quem revisa veria a mesma coisa repetida.
 */
function limpar(achados: Achado[]): Achado[] {
  const peso: Record<Severidade, number> = { bloqueio: 0, aviso: 1 };
  const ordenados = [...achados].sort(
    (a, b) => a.inicio - b.inicio || b.fim - a.fim || peso[a.severidade] - peso[b.severidade],
  );

  const resultado: Achado[] = [];
  for (const achado of ordenados) {
    const anterior = resultado[resultado.length - 1];
    if (anterior !== undefined && achado.inicio >= anterior.inicio && achado.fim <= anterior.fim) {
      continue;
    }
    resultado.push(achado);
  }

  return resultado;
}

/**
 * Confere se o texto pode ir para o Fala.BR (RN08).
 *
 * Devolve `liberado: false` quando há qualquer bloqueio. Aviso não impede o
 * envio — serve para quem revisa olhar antes de protocolar.
 */
export function conferirAnonimato(
  texto: string,
  { nomesConhecidos = [] }: OpcoesDeConferencia = {},
): Veredicto {
  const norm = normalizar(texto);

  const achados = limpar([
    ...acharNomesConhecidos(texto, norm, nomesConhecidos),
    ...acharPorPadrao(texto, RE_EMAIL, 'email', 'bloqueio'),
    ...acharPorPadrao(texto, RE_TELEFONE, 'telefone', 'bloqueio'),
    ...acharPorPadrao(texto, RE_MATRICULA, 'matricula', 'bloqueio'),
    ...acharPossiveisNomes(texto, norm),
  ]);

  return {
    liberado: !achados.some((a) => a.severidade === 'bloqueio'),
    achados,
  };
}
