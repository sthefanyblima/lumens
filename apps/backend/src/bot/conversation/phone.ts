import { createHmac } from 'node:crypto';

/**
 * HMAC-SHA256 (hex) do telefone. Nunca guardamos o número puro.
 *
 * `chave` são os bytes da CHAVE_HMAC (base64 decodificado), não a string do .env: é a mesma
 * chave que a busca por telefone da T17 vai usar, e as duas precisam gerar o mesmo hash.
 */
export function hashPhone(phone: string, chave: Buffer): string {
  return createHmac('sha256', chave).update(phone).digest('hex');
}
