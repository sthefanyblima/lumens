import { describe, expect, it } from 'vitest';
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

describe('carregarEnv', () => {
  it('aceita um ambiente completo e converte a porta para número', () => {
    const env = carregarEnv(ambienteCompleto());

    expect(env.EMAIL_PORT).toBe(587);
    expect(env.DATABASE_URL).toBe('postgresql://lumens:senha@localhost:5432/lumens');
  });

  it('nomeia a variável que está faltando', () => {
    const { DATABASE_URL: _removida, ...semBanco } = ambienteCompleto();

    expect(() => carregarEnv(semBanco)).toThrow(/DATABASE_URL/);
  });

  it('lista todas as variáveis faltantes de uma vez, não só a primeira', () => {
    const { META_TOKEN: _a, EMAIL_HOST: _b, AWS_REGION: _c, ...incompleto } = ambienteCompleto();

    let mensagem = '';
    try {
      carregarEnv(incompleto);
    } catch (erro) {
      mensagem = erro instanceof Error ? erro.message : String(erro);
    }

    expect(mensagem).toContain('META_TOKEN');
    expect(mensagem).toContain('EMAIL_HOST');
    expect(mensagem).toContain('AWS_REGION');
  });

  it('recusa variável presente mas vazia', () => {
    expect(() => carregarEnv({ ...ambienteCompleto(), META_APP_SECRET: '' })).toThrow(
      /META_APP_SECRET/,
    );
  });

  it('recusa chave de cifra que não tem 32 bytes', () => {
    expect(() =>
      carregarEnv({ ...ambienteCompleto(), CHAVE_CIFRA: Buffer.alloc(16, 9).toString('base64') }),
    ).toThrow(/CHAVE_CIFRA/);
  });

  it('recusa CHAVE_HMAC igual à CHAVE_CIFRA', () => {
    expect(() => carregarEnv({ ...ambienteCompleto(), CHAVE_HMAC: CHAVE_A })).toThrow(
      /CHAVE_HMAC.*DIFERENTE/s,
    );
  });

  it('aceita as variáveis opcionais ausentes', () => {
    const env = carregarEnv(ambienteCompleto());

    expect(env.S3_ENDPOINT).toBeUndefined();
    expect(env.DATABASE_URL_TESTE).toBeUndefined();
  });
});
