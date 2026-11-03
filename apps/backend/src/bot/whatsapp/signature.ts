import { createHmac, timingSafeEqual } from 'node:crypto';

/** Gera o header X-Hub-Signature-256 ("sha256=<hex>") para um corpo bruto. */
export function signBody(rawBody: string | Buffer, appSecret: string): string {
  return 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
}

/** Confere o header X-Hub-Signature-256 em tempo constante. */
export function verifySignature(
  rawBody: string | Buffer,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(signBody(rawBody, appSecret));
  const got = Buffer.from(header);
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}
