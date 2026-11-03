import sharp from 'sharp';

/** Formatos aceitos por removerMetadados. */
export const FORMATOS_ACEITOS = ['jpeg', 'png', 'webp'] as const;
export type FormatoAceito = (typeof FORMATOS_ACEITOS)[number];

/** Qualidade usada ao recodificar JPEG e WebP (0–100). */
const QUALIDADE = 85;

/** Erro lançado quando a imagem não pode ser processada. */
export class ErroImagemInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroImagemInvalida';
  }
}

function ehFormatoAceito(formato: string): formato is FormatoAceito {
  return FORMATOS_ACEITOS.some((aceito) => aceito === formato);
}

/**
 * Remove todos os metadados (EXIF, GPS, XMP, IPTC, ICC) de uma imagem.
 *
 * - Aplica a orientação EXIF nos pixels antes de descartá-la, para que fotos
 *   tiradas com o celular na vertical continuem na posição certa.
 * - Mantém o formato de entrada (JPEG → JPEG, PNG → PNG, WebP → WebP).
 * - Trabalha só em memória: nada é gravado em disco.
 *
 * @param entrada Conteúdo do arquivo enviado.
 * @returns Nova imagem, sem metadados.
 * @throws {ErroImagemInvalida} Se o arquivo estiver vazio, corrompido ou num
 *   formato fora de FORMATOS_ACEITOS.
 */
export async function removerMetadados(entrada: Buffer): Promise<Buffer> {
  if (!Buffer.isBuffer(entrada) || entrada.length === 0) {
    throw new ErroImagemInvalida('Arquivo vazio.');
  }

  let formato: string;
  try {
    ({ format: formato } = await sharp(entrada).metadata());
  } catch {
    throw new ErroImagemInvalida('Arquivo corrompido ou não é uma imagem.');
  }

  if (!ehFormatoAceito(formato)) {
    throw new ErroImagemInvalida(`Formato não suportado: ${formato}. Envie JPEG, PNG ou WebP.`);
  }

  // Por padrão o sharp não copia metadados para a saída.
  // NÃO usar .withMetadata(), .keepMetadata(), .keepExif() nem .keepIccProfile().
  const imagem = sharp(entrada, { failOn: 'error' }).rotate();

  try {
    switch (formato) {
      case 'jpeg':
        return await imagem.jpeg({ quality: QUALIDADE, mozjpeg: true }).toBuffer();
      case 'png':
        return await imagem.png().toBuffer();
      case 'webp':
        return await imagem.webp({ quality: QUALIDADE }).toBuffer();
    }
  } catch {
    throw new ErroImagemInvalida('Não foi possível processar a imagem.');
  }
}
