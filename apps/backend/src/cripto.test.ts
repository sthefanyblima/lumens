import { describe, expect, it } from 'vitest';
import { chavesDoEnv, cifrar, decifrar, hmacHex } from './cripto';

const CHAVE = Buffer.alloc(32, 3);
const OUTRA = Buffer.alloc(32, 4);

describe('cripto', () => {
  it('decodifica as chaves do env em 32 bytes', () => {
    const chaves = chavesDoEnv({
      CHAVE_CIFRA: CHAVE.toString('base64'),
      CHAVE_HMAC: OUTRA.toString('base64'),
    });
    expect(chaves.cifra.equals(CHAVE)).toBe(true);
    expect(chaves.hmac.equals(OUTRA)).toBe(true);
  });

  it('cifrar e decifrar fazem o caminho de volta, com IV novo a cada chamada', () => {
    const a = cifrar('5582999990000', CHAVE);
    const b = cifrar('5582999990000', CHAVE);
    expect(a).not.toBe(b);
    expect(a).not.toContain('5582999990000');
    expect(decifrar(a, CHAVE)).toBe('5582999990000');
    expect(decifrar(b, CHAVE)).toBe('5582999990000');
  });

  it('decifrar recusa chave errada e conteúdo alterado', () => {
    const cifrado = cifrar('segredo', CHAVE);
    expect(() => decifrar(cifrado, OUTRA)).toThrow();
    const bytes = Buffer.from(cifrado, 'base64');
    bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1;
    expect(() => decifrar(bytes.toString('base64'), CHAVE)).toThrow();
  });

  it('decifrar recusa tag truncada', () => {
    const bytes = Buffer.from(cifrar('', CHAVE), 'base64');
    // Sem texto cifrado: os bytes são iv | tag. Cortar a tag não pode virar tag curta aceita.
    expect(() => decifrar(bytes.subarray(0, 12 + 4).toString('base64'), CHAVE)).toThrow();
    expect(() => decifrar(bytes.subarray(0, 12 + 15).toString('base64'), CHAVE)).toThrow();
  });

  it('hmacHex é determinístico e depende da chave', () => {
    expect(hmacHex('x', CHAVE)).toBe(hmacHex('x', CHAVE));
    expect(hmacHex('x', CHAVE)).not.toBe(hmacHex('x', OUTRA));
    expect(hmacHex('x', CHAVE)).toMatch(/^[0-9a-f]{64}$/);
  });
});
