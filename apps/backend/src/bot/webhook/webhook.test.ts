import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { processedMessages, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { JOBS, type JobQueue } from '../../queue';
import { FIXTURES_DIR } from '../sim/fixtures';
import { signBody } from '../whatsapp/signature';

const config = { verifyToken: 'verify-123', appSecret: 'segredo-app' };

class FakeQueue implements JobQueue {
  sent: { name: string; data: object }[] = [];
  fail = false;
  send(name: string, data: object) {
    if (this.fail) return Promise.reject(new Error('fila fora do ar'));
    this.sent.push({ name, data });
    return Promise.resolve(String(this.sent.length));
  }
}

function textPayload(wamid = 'wamid.ABC', body = 'oi') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5582999999999', phone_number_id: 'PNID' },
              contacts: [{ profile: { name: 'Maria' }, wa_id: '5582988887777' }],
              messages: [
                {
                  id: wamid,
                  from: '5582988887777',
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload() {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5582999999999', phone_number_id: 'PNID' },
              statuses: [
                {
                  id: 'wamid.OUT',
                  status: 'delivered',
                  timestamp: '1700000001',
                  recipient_id: '5582988887777',
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('webhook da Meta', () => {
  let app: FastifyInstance;
  let db: Db;
  let queue: FakeQueue;

  // PGlite leva alguns segundos para subir no primeiro teste.
  beforeEach(async () => {
    db = await criarBancoEmMemoria();
    queue = new FakeQueue();
    app = await buildApp({ config, db, queue, logger: pino({ level: 'silent' }) });
  }, 20_000);
  afterEach(async () => {
    await app.close();
  });

  const post = (payload: unknown, signature?: string | null) => {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const sig = signature === undefined ? signBody(body, config.appSecret) : signature;
    if (sig !== null) headers['x-hub-signature-256'] = sig;
    return app.inject({ method: 'POST', url: '/webhook', payload: body, headers });
  };

  it('GET /webhook com token correto devolve o challenge', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/webhook',
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-123',
        'hub.challenge': '987654',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.body).toBe('987654');
  });

  it('GET /webhook com token errado → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/webhook',
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': '1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST com assinatura válida → 200 e enfileira', async () => {
    const res = await post(textPayload());
    expect(res.statusCode).toBe(200);
    expect(queue.sent).toHaveLength(1);
    expect(queue.sent[0]?.name).toBe(JOBS.incomingMessage);
    expect(queue.sent[0]?.data).toMatchObject({
      wamid: 'wamid.ABC',
      from: '5582988887777',
      type: 'text',
      contactName: 'Maria',
      phoneNumberId: 'PNID',
      message: { text: { body: 'oi' } },
    });
  });

  it('POST com assinatura inválida → 401 e nada enfileirado', async () => {
    const res = await post(textPayload(), signBody('outro corpo', config.appSecret));
    expect(res.statusCode).toBe(401);
    expect(queue.sent).toHaveLength(0);
    expect(await db.select().from(processedMessages)).toHaveLength(0);
  });

  it('POST sem assinatura → 401', async () => {
    const res = await post(textPayload(), null);
    expect(res.statusCode).toBe(401);
    expect(queue.sent).toHaveLength(0);
  });

  it('POST com JSON inválido (assinado) → 400', async () => {
    const res = await post('{nao json');
    expect(res.statusCode).toBe(400);
  });

  it('POST assinado sem entry → 200 e nada enfileirado', async () => {
    const res = await post({ object: 'whatsapp_business_account' });
    expect(res.statusCode).toBe(200);
    expect(queue.sent).toHaveLength(0);
  });

  it('wamid duplicado enviado duas vezes → enfileira uma vez', async () => {
    expect((await post(textPayload('wamid.DUP'))).statusCode).toBe(200);
    expect((await post(textPayload('wamid.DUP'))).statusCode).toBe(200);
    expect(queue.sent).toHaveLength(1);
  });

  it('evento de status → 200 e nada enfileirado', async () => {
    const res = await post(statusPayload());
    expect(res.statusCode).toBe(200);
    expect(queue.sent).toHaveLength(0);
  });

  it('falha na fila → 500, dedup removido e retry funciona', async () => {
    queue.fail = true;
    const res = await post(textPayload('wamid.RETRY'));
    expect(res.statusCode).toBe(500);
    expect(await db.select().from(processedMessages)).toHaveLength(0);

    queue.fail = false;
    const retry = await post(textPayload('wamid.RETRY'));
    expect(retry.statusCode).toBe(200);
    expect(queue.sent).toHaveLength(1);
  });

  it('outras rotas continuam com parser JSON normal', async () => {
    const other = await buildApp({ config, db, queue, logger: pino({ level: 'silent' }) });
    other.post('/echo', (req) => req.body);
    const res = await other.inject({ method: 'POST', url: '/echo', payload: { a: 1 } });
    expect(res.json()).toEqual({ a: 1 });
    await other.close();
  });

  it('fixture texto.json (corpo bruto assinado) → enfileira', async () => {
    const raw = readFileSync(join(FIXTURES_DIR, 'texto.json'), 'utf8');
    const res = await post(raw);
    expect(res.statusCode).toBe(200);
    expect(queue.sent).toHaveLength(1);
    expect(queue.sent[0]?.data).toMatchObject({
      wamid: 'wamid.FIXTURE_TEXTO',
      contactName: 'Morador Simulado',
    });
  });
});
