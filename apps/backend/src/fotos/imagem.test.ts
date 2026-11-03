import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { removerMetadados, ErroImagemInvalida } from './imagem';

// As fotos de teste são geradas aqui mesmo, com metadados parecidos com os de
// uma foto real de celular (marca, modelo, autor, GPS, XMP e orientação 6).
// Assim não é preciso guardar imagens binárias no repositório.
const XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="Autor Secreto"/>' +
  '</rdf:RDF></x:xmpmeta>';

async function fotoComMetadados(formato: 'jpeg' | 'png' | 'webp', orientacao = 1) {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: '#c33' } })
    .withExif({
      IFD0: { Make: 'Apple', Model: 'iPhone 13', Artist: 'Autor Secreto' },
      IFD3: {
        GPSLatitudeRef: 'S',
        GPSLatitude: '9/1 39/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '35/1 44/1 0/1',
      },
    })
    .withXmp(XMP)
    .withMetadata({ orientation: orientacao })
    [formato]()
    .toBuffer();
}

describe.each(['jpeg', 'png', 'webp'] as const)('removerMetadados com %s', (formato) => {
  let entrada: Buffer;
  let saida: Buffer;

  beforeAll(async () => {
    entrada = await fotoComMetadados(formato);
    saida = await removerMetadados(entrada);
  });

  it('a foto de teste realmente tem metadados (sanidade)', async () => {
    const m = await sharp(entrada).metadata();
    expect(m.exif).toBeDefined();
    expect(m.xmp).toBeDefined();
  });

  it('a saída não tem EXIF, XMP nem IPTC', async () => {
    const m = await sharp(saida).metadata();
    expect(m.exif).toBeUndefined();
    expect(m.xmp).toBeUndefined();
    expect(m.iptc).toBeUndefined();
  });

  it('nenhum dado pessoal sobra nos bytes do arquivo', () => {
    const bytes = saida.toString('latin1');
    for (const texto of ['iPhone', 'Apple', 'Autor Secreto', 'GPS']) {
      expect(bytes).not.toContain(texto);
    }
  });

  it('mantém o formato de entrada', async () => {
    const m = await sharp(saida).metadata();
    expect(m.format).toBe(formato);
  });
});

describe('orientação', () => {
  it('foto com Orientation = 6 sai girada e sem a tag', async () => {
    const entrada = await fotoComMetadados('jpeg', 6); // 40x20 deitada
    const m = await sharp(await removerMetadados(entrada)).metadata();

    expect(m.width).toBe(20); // largura e altura trocadas
    expect(m.height).toBe(40);
    expect(m.orientation).toBeUndefined();
  });
});

describe('arquivos inválidos', () => {
  it('rejeita buffer vazio', async () => {
    await expect(removerMetadados(Buffer.alloc(0))).rejects.toThrow(ErroImagemInvalida);
  });

  it('rejeita arquivo que não é imagem', async () => {
    await expect(removerMetadados(Buffer.from('isto não é uma foto'))).rejects.toThrow(
      ErroImagemInvalida,
    );
  });

  it('rejeita JPEG corrompido (cortado no meio)', async () => {
    const jpeg = await fotoComMetadados('jpeg');
    const cortado = jpeg.subarray(0, Math.floor(jpeg.length / 2));
    await expect(removerMetadados(cortado)).rejects.toThrow(ErroImagemInvalida);
  });

  it('rejeita formato fora da lista (GIF)', async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#000' },
    })
      .gif()
      .toBuffer();
    await expect(removerMetadados(gif)).rejects.toThrow(/Formato não suportado/);
  });
});
