import { describe, expect, it, vi } from 'vitest';
import { carregarEnv, type FonteDeAmbiente } from './env';

const CHAVE_A = Buffer.alloc(32, 1).toString('base64');
const CHAVE_B = Buffer.alloc(32, 2).toString('base64');

function ambienteCompleto(): FonteDeAmbiente {
  return {
    DATABASE_URL: 'postgresql://lumens:senha@localhost:5432/lumens',
    DATABASE_URL_LEITURA: 'postgresql://leitura:senha@localhost:5432/lumens',
    CHAVE_CIFRA: CHAVE_A,
    CHAVE_HMAC: CHAVE_B,
    META_TOKEN: 'token',
    META_APP_SECRET: 'segredo',
    META_VERIFY_TOKEN: 'frase',
    META_PHONE_NUMBER_ID: '1234567890',
    EMAIL_HOST: 'smtp.exemplo.com',
    EMAIL_PORT: '587',
    EMAIL_USUARIO: 'usuario',
    EMAIL_SENHA: 'senha',
    EMAIL_REMETENTE: 'lumens@exemplo.com',
    AWS_REGION: 'us-east-1',
    S3_BUCKET_FOTOS: 'lumens-fotos',
  };
}

function mensagemDeErro(fonte: FonteDeAmbiente): string {
  try {
    carregarEnv(fonte);
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
  throw new Error('esperava que carregarEnv lançasse, mas ela retornou');
}

describe('carregarEnv', () => {
  it('aceita um ambiente completo e converte a porta para número', () => {
    const env = carregarEnv(ambienteCompleto());

    expect(env.EMAIL_PORT).toBe(587);
    expect(env.DATABASE_URL).toBe('postgresql://lumens:senha@localhost:5432/lumens');
  });

  it('usa process.env quando nenhuma fonte é passada — o caminho que o main.ts percorre', () => {
    // stubEnv mexe só nas chaves: trocar o objeto process.env inteiro apagaria
    // PATH e companhia para o worker, e viraria flake se os testes rodarem em paralelo.
    for (const [chave, valor] of Object.entries(ambienteCompleto())) {
      vi.stubEnv(chave, valor ?? '');
    }
    try {
      expect(carregarEnv().EMAIL_PORT).toBe(587);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('nomeia a variável que está faltando', () => {
    const { DATABASE_URL: _removida, ...semBanco } = ambienteCompleto();

    // Com dois-pontos para não casar por prefixo com DATABASE_URL_LEITURA.
    expect(mensagemDeErro(semBanco)).toContain('DATABASE_URL:');
  });

  it('lista todas as variáveis faltantes de uma vez, não só a primeira', () => {
    const { META_TOKEN: _a, EMAIL_HOST: _b, AWS_REGION: _c, ...incompleto } = ambienteCompleto();

    const mensagem = mensagemDeErro(incompleto);

    expect(mensagem).toContain('META_TOKEN');
    expect(mensagem).toContain('EMAIL_HOST');
    expect(mensagem).toContain('AWS_REGION');
  });

  it('recusa variável presente mas vazia', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), META_APP_SECRET: '' })).toContain(
      'META_APP_SECRET',
    );
  });

  it('recusa EMAIL_PORT que não é número', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), EMAIL_PORT: 'quinhentos' })).toContain(
      'EMAIL_PORT',
    );
  });

  it('recusa EMAIL_PORT zero ou negativa', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), EMAIL_PORT: '0' })).toContain('EMAIL_PORT');
  });

  it('recusa chave de cifra que não tem 32 bytes', () => {
    const curta = Buffer.alloc(16, 9).toString('base64');

    expect(mensagemDeErro({ ...ambienteCompleto(), CHAVE_CIFRA: curta })).toContain('CHAVE_CIFRA');
  });

  it('recusa chave com lixo fora do alfabeto base64, mesmo que decodifique para 32 bytes', () => {
    // O Node descarta os caracteres inválidos em silêncio: este valor decodifica
    // para 32 bytes, mas não é o base64 que o dev colou no CI.
    const comLixo = `!!!${CHAVE_A}`;
    expect(Buffer.from(comLixo, 'base64')).toHaveLength(32);

    expect(mensagemDeErro({ ...ambienteCompleto(), CHAVE_CIFRA: comLixo })).toContain(
      'não é base64 válido',
    );
  });

  it('recusa chave com quebra de linha colada junto', () => {
    const comQuebra = `${CHAVE_A}\n`;

    expect(mensagemDeErro({ ...ambienteCompleto(), CHAVE_HMAC: comQuebra })).toContain(
      'não é base64 válido',
    );
  });

  it('recusa CHAVE_HMAC igual à CHAVE_CIFRA', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), CHAVE_HMAC: CHAVE_A })).toContain('DIFERENTE');
  });

  it('trata opcional ausente e opcional vazia da mesma forma', () => {
    const semChave = carregarEnv(ambienteCompleto());
    const chaveVazia = carregarEnv({
      ...ambienteCompleto(),
      S3_ENDPOINT: '',
      DATABASE_URL_TESTE: '',
    });

    expect(semChave.S3_ENDPOINT).toBeUndefined();
    // Depois de `cp .env.example .env` a chave existe e está vazia: tem de virar undefined.
    expect(chaveVazia.S3_ENDPOINT).toBeUndefined();
    expect(chaveVazia.DATABASE_URL_TESTE).toBeUndefined();
  });

  it('usa PORT 3001 e LOG_LEVEL info quando ausentes ou vazios', () => {
    for (const fonte of [ambienteCompleto(), { ...ambienteCompleto(), PORT: '', LOG_LEVEL: '' }]) {
      const env = carregarEnv(fonte);
      expect(env.PORT).toBe(3001);
      expect(env.LOG_LEVEL).toBe('info');
    }
  });

  it('converte PORT para número', () => {
    expect(carregarEnv({ ...ambienteCompleto(), PORT: '8080' }).PORT).toBe(8080);
  });

  it('recusa PORT que não é número', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), PORT: 'oitenta' })).toContain('PORT');
  });

  it('recusa LOG_LEVEL fora da lista do pino', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), LOG_LEVEL: 'verbose' })).toContain('LOG_LEVEL');
  });

  it('preserva opcional preenchida', () => {
    const env = carregarEnv({ ...ambienteCompleto(), S3_ENDPOINT: 'http://localhost:9000' });

    expect(env.S3_ENDPOINT).toBe('http://localhost:9000');
  });
});
