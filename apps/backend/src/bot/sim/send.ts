// Assina (HMAC-SHA256, header X-Hub-Signature-256) e envia um payload ao webhook.
import { signBody } from '../whatsapp/signature';

export interface SignedRequest {
  /** Corpo exato (bytes) que é assinado e enviado. */
  body: string;
  /** Valor do header X-Hub-Signature-256 ("sha256=<hex>"). */
  signature: string;
}

/**
 * Destino padrão do simulador: o webhook local na PORT do .env. PORT vazia vale 3001, como no
 * servidor — depois de `cp .env.example .env` ela pode estar presente e vazia.
 */
export function urlPadrao(porta: string | undefined): string {
  return `http://localhost:${porta === undefined || porta === '' ? '3001' : porta}/webhook`;
}

/** Serializa o payload e calcula a assinatura sobre os mesmos bytes. */
export function signPayload(payload: unknown, secret: string): SignedRequest {
  const body = JSON.stringify(payload);
  return { body, signature: signBody(body, secret) };
}

/** Assina e faz POST do payload para `url`. Retorna status HTTP e corpo da resposta. */
export async function sendSigned(
  payload: unknown,
  opts: { url: string; secret: string },
): Promise<{ status: number; body: string }> {
  const { body, signature } = signPayload(payload, opts.secret);
  const res = await fetch(opts.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body,
  });
  return { status: res.status, body: await res.text() };
}
