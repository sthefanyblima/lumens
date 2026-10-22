import { readFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifySignature } from '../whatsapp/signature';
import type { MetaWebhookPayload } from '../whatsapp/types';
import { FIXTURES_DIR, fixtures } from './fixtures';
import {
  buildButtonReply,
  buildForwardedMessage,
  buildImageMessage,
  buildListReply,
  buildStatus,
  buildTextMessage,
} from './payloads';
import { sendSigned, signPayload } from './send';

function value(p: MetaWebhookPayload) {
  const v = p.entry[0]?.changes[0]?.value;
  if (!v) throw new Error('payload sem entry[0].changes[0].value');
  return v;
}

function msg(p: MetaWebhookPayload) {
  const m = value(p).messages?.[0];
  if (!m) throw new Error('payload sem mensagem');
  return m;
}

describe('construtores de payload', () => {
  it('envelope padrão da Meta', () => {
    const p = buildTextMessage({ body: 'oi' });
    expect(p.object).toBe('whatsapp_business_account');
    expect(p.entry[0]?.changes[0]?.field).toBe('messages');
    expect(value(p).messaging_product).toBe('whatsapp');
    expect(value(p).contacts?.[0]?.wa_id).toBe('5582999990000');
    expect(msg(p).id).toMatch(/^wamid\./);
    expect(msg(p).timestamp).toMatch(/^\d+$/);
  });

  it('texto', () => {
    const m = msg(
      buildTextMessage({ body: 'buraco no bloco 12', from: '558211', wamid: 'wamid.X' }),
    );
    expect(m).toMatchObject({
      type: 'text',
      text: { body: 'buraco no bloco 12' },
      from: '558211',
      id: 'wamid.X',
    });
    expect(m.context).toBeUndefined();
  });

  it('encaminhada tem context.forwarded', () => {
    const m = msg(buildForwardedMessage({ body: 'repassem' }));
    expect(m.type).toBe('text');
    expect(m.context?.forwarded).toBe(true);
  });

  it('botão', () => {
    const m = msg(buildButtonReply({ id: 'sim', title: 'Sim' }));
    expect(m).toMatchObject({
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'sim', title: 'Sim' } },
    });
  });

  it('lista', () => {
    const m = msg(buildListReply({ id: 'cat', title: 'Categoria' }));
    expect(m).toMatchObject({
      type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: 'cat', title: 'Categoria' } },
    });
  });

  it('imagem com e sem legenda', () => {
    const a = msg(buildImageMessage({ caption: 'poste' }));
    if (a.type !== 'image') throw new Error(`esperava imagem, veio ${a.type}`);
    expect(a.image.caption).toBe('poste');
    expect(a.image.mime_type).toBe('image/jpeg');
    const b = msg(buildImageMessage({}));
    if (b.type !== 'image') throw new Error(`esperava imagem, veio ${b.type}`);
    expect('caption' in b.image).toBe(false);
  });

  it('status não tem messages', () => {
    const v = value(buildStatus({ status: 'read', to: '5582', wamid: 'wamid.S' }));
    expect(v.messages).toBeUndefined();
    expect(v.statuses).toHaveLength(1);
    expect(v.statuses?.[0]).toMatchObject({ id: 'wamid.S', status: 'read', recipient_id: '5582' });
    expect(v.statuses?.[0]?.timestamp).toMatch(/^\d+$/);
  });
});

describe('assinatura e envio', () => {
  it('assinatura bate com verifySignature', () => {
    const { body, signature } = signPayload(buildTextMessage({ body: 'oi' }), 's3cr3t');
    expect(verifySignature(body, signature, 's3cr3t')).toBe(true);
    expect(verifySignature(body, signature, 'outro')).toBe(false);
  });

  it('sendSigned envia header e bytes corretos', async () => {
    let got: { headers: IncomingHttpHeaders; raw: Buffer; method?: string } | undefined;
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        got = { headers: req.headers, raw: Buffer.concat(chunks), method: req.method ?? '' };
        res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const { port } = server.address() as AddressInfo;
      const payload = buildTextMessage({ body: 'acentuação ✓', wamid: 'wamid.T' });
      const res = await sendSigned(payload, {
        url: `http://127.0.0.1:${String(port)}/webhook`,
        secret: 'abc',
      });
      expect(res).toEqual({ status: 200, body: 'ok' });
      if (!got) throw new Error('o servidor não recebeu a requisição');
      expect(got.method).toBe('POST');
      expect(got.headers['content-type']).toBe('application/json');
      const sig = got.headers['x-hub-signature-256'];
      expect(typeof sig).toBe('string');
      expect(verifySignature(got.raw, typeof sig === 'string' ? sig : undefined, 'abc')).toBe(true);
      expect(got.raw.equals(Buffer.from(JSON.stringify(payload)))).toBe(true);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

describe('fixtures', () => {
  for (const [name, expected] of Object.entries(fixtures())) {
    it(`${name}.json bate com o construtor`, () => {
      const parsed: unknown = JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), 'utf8'));
      expect(parsed).toEqual(expected);
    });
  }
});
