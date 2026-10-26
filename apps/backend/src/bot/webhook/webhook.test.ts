import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mensagensProcessadas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { decifrar, type Chaves } from '../../cripto';
import { FakeQueue, mensagensNaFila, prepararFilaFalsa } from '../../queue.fake';
import { hashPhone } from '../conversation/phone';
import { FIXTURES_DIR } from '../sim/fixtures';
import { signBody } from '../whatsapp/signature';
import { DEDUP_TTL_MS, deleteOldDedup } from './process';

const config = { verifyToken: 'verify-SECRET-123', appSecret: 'segredo-app' };
const chaves: Chaves = { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) };
const PHONE = '5582988887777';

const jobs = mensagensNaFila;

function mensagem(wamid: string, body = 'oi') {
  return { id: wamid, from: PHONE, timestamp: '1700000000', type: 'text', text: { body } };
}

function payloadCom(value: object) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA_ID', changes: [{ field: 'messages', value }] }],
  };
}

const metadata = { display_phone_number: '5582999999999', phone_number_id: 'PNID' };

function textPayload(wamid = 'wamid.ABC', body = 'oi') {
  return payloadCom({
    messaging_product: 'whatsapp',
    metadata,
    contacts: [{ profile: { name: 'Maria' }, wa_id: PHONE }],
    messages: [mensagem(wamid, body)],
  });
}

function statusPayload() {
  return payloadCom({
    messaging_product: 'whatsapp',
    metadata,
    statuses: [
      { id: 'wamid.OUT', status: 'delivered', timestamp: '1700000001', recipient_id: PHONE },
    ],
  });
}

describe('webhook da Meta', () => {
  let app: FastifyInstance;
  let db: Db;
  let queue: FakeQueue;
  let logs: string[];

  // PGlite leva alguns segundos para subir no primeiro teste.
  beforeEach(async () => {
    db = await criarBancoEmMemoria();
    await prepararFilaFalsa(db);
    queue = new FakeQueue();
    logs = [];
    const logger = pino({ level: 'debug' }, { write: (linha: string) => logs.push(linha) });
    app = await buildApp({ config, db, queue, logger, chaves });
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
  const dedup = () => db.select().from(mensagensProcessadas);

  it('GET /webhook com token correto devolve o challenge', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/webhook',
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': config.verifyToken,
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

  it('GET /webhook com hub.challenge repetido → 403, não 500', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/webhook?hub.mode=subscribe&hub.verify_token=${config.verifyToken}&hub.challenge=1&hub.challenge=2`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('o META_VERIFY_TOKEN não aparece no log', async () => {
    await app.inject({
      method: 'GET',
      url: `/webhook?hub.mode=subscribe&hub.verify_token=${config.verifyToken}&hub.challenge=1`,
    });
    expect(logs.some((linha) => linha.includes('"url":"/webhook"'))).toBe(true);
    expect(logs.join('\n')).not.toContain(config.verifyToken);
  });

  it('POST com assinatura válida → 200 e enfileira', async () => {
    const res = await post(textPayload());
    expect(res.statusCode).toBe(200);
    const [job, ...resto] = await jobs(db);
    expect(resto).toHaveLength(0);
    expect(job?.data).toMatchObject({
      phoneHmac: hashPhone(PHONE, chaves.hmac),
      phoneNumberId: 'PNID',
      type: 'text',
      timestamp: '1700000000',
      content: { text: { body: 'oi' } },
    });
  });

  it('nem telefone, nem wamid, nem nome vão em claro para a fila, o banco ou o log', async () => {
    await post(textPayload('wamid.ABC'));
    const [job] = await jobs(db);
    if (!job) throw new Error('nada foi enfileirado');

    const tudo = JSON.stringify([job, await dedup(), logs]);
    expect(tudo).not.toContain(PHONE);
    expect(tudo).not.toContain('wamid.ABC');
    expect(tudo).not.toContain('Maria');
    // ...mas o worker consegue recuperar os dois para responder.
    expect(decifrar(job.data.phoneCifrado, chaves.cifra)).toBe(PHONE);
    expect(decifrar(job.data.wamidCifrado, chaves.cifra)).toBe('wamid.ABC');
  });

  it('POST com assinatura inválida → 401 e nada enfileirado', async () => {
    const res = await post(textPayload(), signBody('outro corpo', config.appSecret));
    expect(res.statusCode).toBe(401);
    expect(await jobs(db)).toHaveLength(0);
    expect(await dedup()).toHaveLength(0);
  });

  it('POST sem assinatura → 401', async () => {
    const res = await post(textPayload(), null);
    expect(res.statusCode).toBe(401);
    expect(await jobs(db)).toHaveLength(0);
  });

  it('POST com JSON inválido (assinado) → 400', async () => {
    const res = await post('{nao json');
    expect(res.statusCode).toBe(400);
  });

  it('POST assinado sem entry → 200 e nada enfileirado', async () => {
    const res = await post({ object: 'whatsapp_business_account' });
    expect(res.statusCode).toBe(200);
    expect(await jobs(db)).toHaveLength(0);
  });

  it('wamid duplicado enviado duas vezes → enfileira uma vez', async () => {
    expect((await post(textPayload('wamid.DUP'))).statusCode).toBe(200);
    expect((await post(textPayload('wamid.DUP'))).statusCode).toBe(200);
    expect(await jobs(db)).toHaveLength(1);
  });

  it('evento de status → 200 e nada enfileirado', async () => {
    const res = await post(statusPayload());
    expect(res.statusCode).toBe(200);
    expect(await jobs(db)).toHaveLength(0);
  });

  it('falha na fila → 500, nem dedup nem job ficam, e o retry enfileira', async () => {
    queue.failSend = true;
    const res = await post(textPayload('wamid.RETRY'));
    expect(res.statusCode).toBe(500);
    expect(await dedup()).toHaveLength(0);
    expect(await jobs(db)).toHaveLength(0);

    queue.failSend = false;
    const retry = await post(textPayload('wamid.RETRY'));
    expect(retry.statusCode).toBe(200);
    expect(await jobs(db)).toHaveLength(1);
  });

  it('mensagem sem metadata não marca o wamid: o reenvio completo ainda enfileira', async () => {
    const semMetadata = payloadCom({ messages: [mensagem('wamid.NOMETA')] });
    expect((await post(semMetadata)).statusCode).toBe(200);
    expect(await dedup()).toHaveLength(0);

    expect((await post(textPayload('wamid.NOMETA'))).statusCode).toBe(200);
    expect(await jobs(db)).toHaveLength(1);
  });

  it('contato sem profile não atrapalha o enfileiramento', async () => {
    const res = await post(
      payloadCom({ metadata, contacts: [{ wa_id: PHONE }], messages: [mensagem('wamid.NOPROF')] }),
    );
    expect(res.statusCode).toBe(200);
    expect(await jobs(db)).toHaveLength(1);
  });

  it.each([
    ['entry com null', { entry: [null] }],
    ['entry sem changes', { entry: [{}] }],
    ['change sem value', { entry: [{ changes: [{}] }] }],
    ['value null', { entry: [{ changes: [{ value: null }] }] }],
    ['mensagem sem id', payloadCom({ metadata, messages: [{ from: PHONE, type: 'text' }] })],
    ['id que não é texto', payloadCom({ metadata, messages: [{ ...mensagem('x'), id: 42 }] })],
    ['messages que não é lista', payloadCom({ metadata, messages: {} })],
  ])(
    'payload fora do formato (%s) → 200 e nada gravado, para a Meta não reenviar',
    async (_, p) => {
      const res = await post(p);
      expect(res.statusCode).toBe(200);
      expect(await dedup()).toHaveLength(0);
      expect(await jobs(db)).toHaveLength(0);
    },
  );

  it('num lote, a mensagem ruim é ignorada e a boa é enfileirada uma vez', async () => {
    const lote = payloadCom({ metadata, messages: [{ id: 'sem-from' }, mensagem('wamid.BOA')] });
    expect((await post(lote)).statusCode).toBe(200);
    expect((await post(lote)).statusCode).toBe(200);
    expect(await jobs(db)).toHaveLength(1);
  });

  it('texto com \\u0000 ou surrogate solto, que o jsonb recusa, é limpo e enfileirado', async () => {
    const res = await post(textPayload('wamid.NUL', 'a\u0000b \ud83d fim'));
    expect(res.statusCode).toBe(200);
    const [job] = await jobs(db);
    expect(job?.data.content.text?.body).toBe('ab � fim');
  });

  it.each([
    ['type', { type: 'text\u0000' }],
    ['timestamp', { timestamp: '1700\ud83d' }],
    ['image.id', { type: 'image', image: { id: 'i\u0000', mime_type: 'image/jpeg', sha256: 's' } }],
    [
      'interactive.type',
      {
        type: 'interactive',
        interactive: { type: 'b\u0000', button_reply: { id: '1', title: 't' } },
      },
    ],
  ])('\\u0000 ou surrogate solto em %s também é limpo, não vira 500', async (_, campos) => {
    const res = await post(payloadCom({ metadata, messages: [{ ...mensagem('w.X'), ...campos }] }));
    expect(res.statusCode).toBe(200);
    expect(await jobs(db)).toHaveLength(1);
  });

  it('\\u0000 no phone_number_id também é limpo', async () => {
    const res = await post(
      payloadCom({ metadata: { phone_number_id: 'PN\u0000ID' }, messages: [mensagem('w.PN')] }),
    );
    expect(res.statusCode).toBe(200);
    const [job] = await jobs(db);
    expect(job?.data.phoneNumberId).toBe('PNID');
  });

  it('um campo sujo no meio do lote não derruba as mensagens seguintes', async () => {
    const lote = payloadCom({
      metadata,
      messages: [mensagem('w.A'), { ...mensagem('w.B'), type: 'text\u0000' }, mensagem('w.C')],
    });
    expect((await post(lote)).statusCode).toBe(200);
    expect(await jobs(db)).toHaveLength(3);
  });

  it('falha de banco no enqueue: 500, e o log não traz o texto da mensagem', async () => {
    queue.failSendInQuery = true;
    const res = await post(textPayload('wamid.LOG', 'texto secreto da pessoa'));
    expect(res.statusCode).toBe(500);

    const erro = logs.find((linha) => linha.includes('falha ao processar webhook'));
    expect(erro).toContain('"codigo":"22P02"');
    expect(logs.join('\n')).not.toContain('texto secreto da pessoa');
  });

  it('o job leva só o conteúdo conhecido, sem o telefone do context.from', async () => {
    const citada = {
      ...mensagem('wamid.CTX'),
      context: { forwarded: true, from: '5582911112222', id: 'wamid.ORIGINAL' },
      campo_novo_da_meta: { x: 1 },
    };
    await post(payloadCom({ metadata, messages: [citada] }));
    const [job] = await jobs(db);
    expect(job?.data.content).toEqual({ text: { body: 'oi' }, context: { forwarded: true } });
  });

  it('deleteOldDedup apaga só o que passou da janela de reenvio da Meta', async () => {
    const agora = new Date('2026-10-22T12:00:00Z');
    await db.insert(mensagensProcessadas).values([
      { wamidHmac: 'velho', recebidaEm: new Date(agora.getTime() - DEDUP_TTL_MS - 1) },
      { wamidHmac: 'recente', recebidaEm: new Date(agora.getTime() - DEDUP_TTL_MS + 60_000) },
    ]);
    expect(await deleteOldDedup(db, agora)).toBe(1);
    expect((await dedup()).map((linha) => linha.wamidHmac)).toEqual(['recente']);
  });

  it('outras rotas continuam com parser JSON normal', async () => {
    const other = await buildApp({ config, db, queue, logger: pino({ level: 'silent' }), chaves });
    other.post('/echo', (req) => req.body);
    const res = await other.inject({ method: 'POST', url: '/echo', payload: { a: 1 } });
    expect(res.json()).toEqual({ a: 1 });
    await other.close();
  });

  it('fixture texto.json (corpo bruto assinado) → enfileira', async () => {
    const raw = readFileSync(join(FIXTURES_DIR, 'texto.json'), 'utf8');
    const res = await post(raw);
    expect(res.statusCode).toBe(200);
    const [job] = await jobs(db);
    expect(job?.data.content).toEqual({ text: { body: 'buraco no bloco 12' } });
  });
});
