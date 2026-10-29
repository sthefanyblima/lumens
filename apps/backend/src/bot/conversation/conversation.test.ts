import { conversas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { CLEANUP_CRON, CLEANUP_TZ, registerCleanupJob } from '../../agendador/limpeza-conversas';
import { JOBS } from '../../queue';
import {
  defaultHandlers,
  GREETING_TEXT,
  MENU_TEXT,
  normalize,
  PHOTO_ASK_TEXT,
  PHOTO_RECEIVED_TEXT,
} from './handlers';
import { hashPhone } from './phone';
import { CANCEL_TEXT, handleIncoming, NEED_TEXT } from './router';
import { assertTransition, InvalidTransitionError, STEPS, Step, TRANSITIONS } from './steps';
import { ConversationStore } from './store';

const CHAVE = Buffer.alloc(32, 7);
const PHONE = '5582999990000';
const H = hashPhone(PHONE, CHAVE);
const HOUR = 3600_000;

let db: Db;
let clock: Date;
let store: ConversationStore;
const now = () => clock;
const send = (text: string) => handleIncoming({ phoneHmac: H, text }, { store });
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

// PGlite leva alguns segundos para subir no primeiro teste.
beforeEach(async () => {
  db = await criarBancoEmMemoria();
  clock = new Date('2026-10-21T12:00:00Z');
  store = new ConversationStore(db, now);
}, 20_000);

describe('steps', () => {
  it('tabela de transições cobre todo Step e só aponta para Steps válidos', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...STEPS].sort());
    expect(Object.keys(Step).sort()).toEqual([...STEPS].sort());
    for (const nexts of Object.values(TRANSITIONS)) {
      for (const n of nexts) expect(STEPS).toContain(n);
    }
    expect(Object.keys(defaultHandlers).sort()).toEqual([...STEPS].sort());
  });

  it('transição inválida lança erro tipado; globais sempre permitidas', () => {
    expect(() => {
      assertTransition('GREETING', 'NEW_ASK_PHOTO');
    }).toThrow(InvalidTransitionError);
    expect(() => {
      assertTransition('NEW_ASK_TITLE', 'VERIFY_ASK_CODE');
    }).toThrow(expect.objectContaining({ from: 'NEW_ASK_TITLE', to: 'VERIFY_ASK_CODE' }));
    for (const s of STEPS) {
      expect(() => {
        assertTransition(s, 'MENU');
      }).not.toThrow();
      expect(() => {
        assertTransition(s, 'GREETING');
      }).not.toThrow();
    }
    expect(() => {
      assertTransition('VERIFY_ASK_CODE', 'VERIFY_ASK_CODE');
    }).not.toThrow();
  });

  it('router rejeita handler que faz transição inválida e não salva', async () => {
    const handlers = {
      ...defaultHandlers,
      GREETING: () => ({ next: 'NEW_ASK_PHOTO' as const, replies: [] }),
    };
    await expect(handleIncoming({ phoneHmac: H, text: 'oi' }, { store, handlers })).rejects.toThrow(
      InvalidTransitionError,
    );
    expect(await store.get(H)).toBeNull();
  });
});

describe('router', () => {
  it('usuário novo recebe saudação + menu e fica em MENU', async () => {
    expect(await send('oi')).toEqual([GREETING_TEXT, MENU_TEXT]);
    const st = await store.get(H);
    expect(st?.step).toBe('MENU');
    expect(st?.expiresAt.getTime()).toBe(clock.getTime() + 24 * HOUR);
    expect(st?.updatedAt.getTime()).toBe(clock.getTime());
  });

  it('nunca guarda o número puro', async () => {
    await send('oi');
    const rows = await db.select().from(conversas);
    expect(rows.map((r) => r.telefoneHmac)).toEqual([H]);
    expect(H).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(PHONE);
  });

  it('retoma do passo salvo', async () => {
    await send('oi');
    await send('2');
    expect((await store.get(H))?.step).toBe('NEW_ASK_TITLE');
    // Nova instância do store (ex.: outro worker) continua do mesmo passo.
    store = new ConversationStore(db, now);
    const replies = await send('Bebedouro quebrado');
    expect(replies[0]).toContain('NEW_ASK_TITLE');
    expect((await store.get(H))?.step).toBe('NEW_ASK_PLACE');
  });

  it('menu inválido mantém em MENU', async () => {
    await send('oi');
    const r = await send('xyz');
    expect(r).toContain(MENU_TEXT);
    expect((await store.get(H))?.step).toBe('MENU');
  });

  it.each(['MENU', 'VERIFY_ASK_CODE', 'REPORT_PICK_SIMILAR', 'NEW_ASK_PHOTO'] as const)(
    "'cancelar' em %s volta ao MENU e limpa os dados",
    async (step) => {
      await store.save(H, step, { foo: 'bar', pendingCommand: { kind: 'apoiar', id: 'p1' } });
      expect(await send('  CANCELÁR ')).toEqual([CANCEL_TEXT, MENU_TEXT]);
      const st = await store.get(H);
      expect(st?.step).toBe('MENU');
      expect(st?.data).toEqual({});
    },
  );

  it("'menu' volta ao MENU mantendo pendingCommand", async () => {
    await store.save(H, 'NEW_ASK_PLACE', {
      title: 'x',
      pendingCommand: { kind: 'ajudar', id: 'p9' },
    });
    expect(await send('Menu')).toEqual([MENU_TEXT]);
    const st = await store.get(H);
    expect(st?.step).toBe('MENU');
    expect(st?.data).toEqual({ pendingCommand: { kind: 'ajudar', id: 'p9' } });
  });

  it('patch com undefined remove a chave dos dados', async () => {
    await store.save(H, 'MENU', { manter: 1, remover: 2 });
    const handlers = {
      ...defaultHandlers,
      MENU: () => ({ next: 'MENU' as const, data: { remover: undefined, nova: 3 }, replies: [] }),
    };
    await handleIncoming({ phoneHmac: H, text: 'x' }, { store, handlers });
    expect((await store.get(H))?.data).toEqual({ manter: 1, nova: 3 });
  });

  it('estado expirado (25h) é tratado como novo', async () => {
    await store.save(H, 'NEW_ASK_PLACE', { title: 'x' });
    advance(25 * HOUR);
    expect(await store.get(H)).toBeNull();
    expect(await send('oi')).toEqual([GREETING_TEXT, MENU_TEXT]);
    const st = await store.get(H);
    expect(st?.step).toBe('MENU');
    expect(st?.data).toEqual({});
  });

  it('cada save renova a expiração', async () => {
    await send('oi');
    advance(20 * HOUR);
    await send('1');
    advance(20 * HOUR);
    expect((await store.get(H))?.step).toBe('REPORT_ASK_TEXT');
  });
});

describe('store', () => {
  it('deleteExpired remove só os expirados', async () => {
    await store.save('old1', 'MENU', {});
    await store.save('old2', 'NEW_ASK_TITLE', {});
    advance(20 * HOUR);
    await store.save('fresh', 'MENU', {});
    advance(5 * HOUR);
    expect(await store.deleteExpired(clock)).toBe(2);
    const rows = await db.select().from(conversas);
    expect(rows.map((r) => r.telefoneHmac)).toEqual(['fresh']);
    expect(await store.deleteExpired(clock)).toBe(0);
  });

  it('setPendingCommand / takePendingCommand', async () => {
    expect(await store.takePendingCommand(H)).toBeNull();
    await store.setPendingCommand(H, { kind: 'nova-pauta' });
    const inicial = await store.get(H);
    expect(inicial?.step).toBe('GREETING');
    await store.save(H, 'REPORT_ASK_TEXT', { ...inicial?.data, text: 'a' });
    await store.setPendingCommand(H, { kind: 'apoiar', id: 'p1' });
    const st = await store.get(H);
    expect(st?.step).toBe('REPORT_ASK_TEXT');
    expect(st?.data).toEqual({ text: 'a', pendingCommand: { kind: 'apoiar', id: 'p1' } });
    expect(await store.takePendingCommand(H)).toEqual({ kind: 'apoiar', id: 'p1' });
    expect(await store.takePendingCommand(H)).toBeNull();
    expect((await store.get(H))?.data).toEqual({ text: 'a' });
  });
});

describe('limpeza agendada das conversas', () => {
  it('cria fila, agenda diário em Maceió e o worker chama deleteExpired', async () => {
    const calls: unknown[][] = [];
    let worker: (() => Promise<unknown>) | undefined;
    const boss = {
      getQueue: () => Promise.resolve(null),
      createQueue: (...a: unknown[]) => {
        calls.push(['createQueue', ...a]);
        return Promise.resolve();
      },
      schedule: (...a: unknown[]) => {
        calls.push(['schedule', ...a]);
        return Promise.resolve();
      },
      work: (_n: string, h: () => Promise<unknown>) => {
        worker = h;
        return Promise.resolve('w1');
      },
    };
    await store.save('old', 'MENU', {});
    advance(25 * HOUR);
    await registerCleanupJob(boss as unknown as Parameters<typeof registerCleanupJob>[0], {
      store,
      db,
    });
    expect(calls).toEqual([
      ['createQueue', JOBS.cleanupConversations],
      ['schedule', JOBS.cleanupConversations, CLEANUP_CRON, null, { tz: CLEANUP_TZ }],
    ]);
    if (!worker) throw new Error('registerCleanupJob não registrou o worker');
    expect(await worker()).toEqual({ deleted: 1, dedupDeleted: 0 });
  });
});

describe('experiência da pessoa', () => {
  const foto = { id: 'midia-1', mimeType: 'image/jpeg' };
  const sendFoto = () => handleIncoming({ phoneHmac: H, text: '', image: foto }, { store });

  it.each([
    ['Cancelar.', 'cancelar'],
    ['  MENU! ', 'menu'],
    ['1.', '1'],
    ['2)', '2'],
    ['Pular...', 'pular'],
  ])('normalize(%j) = %j', (entrada, esperado) => {
    expect(normalize(entrada)).toBe(esperado);
  });

  it("'Cancelar.' com pontuação cancela no meio do fluxo", async () => {
    await send('oi');
    await send('2');
    expect(await send('Cancelar.')).toEqual([CANCEL_TEXT, MENU_TEXT]);
    expect((await store.get(H))?.step).toBe('MENU');
  });

  it('fim de fluxo mostra o menu de novo', async () => {
    await send('oi');
    await send('3');
    await send('aluno@ufal.br');
    await send('123456');
    const replies = await send('Computação');
    expect(replies.at(-1)).toBe(MENU_TEXT);
    expect((await store.get(H))?.step).toBe('MENU');
  });

  it('nova pauta aceita a foto no último passo e guarda o id da mídia', async () => {
    for (const t of ['oi', '2', 'Bebedouro', 'Bloco 12', 'Vazando']) await send(t);
    expect((await store.get(H))?.step).toBe('NEW_ASK_PHOTO');

    expect(await sendFoto()).toEqual([PHOTO_RECEIVED_TEXT, MENU_TEXT]);
    const st = await store.get(H);
    expect(st?.step).toBe('MENU');
    expect(st?.data).toMatchObject({ fotoMediaId: 'midia-1' });
  });

  it("no passo da foto, texto qualquer pede a foto de novo e 'pular' segue sem ela", async () => {
    for (const t of ['oi', '2', 'Bebedouro', 'Bloco 12', 'Vazando']) await send(t);
    expect(await send('já mandei')).toEqual([PHOTO_ASK_TEXT]);
    expect((await store.get(H))?.step).toBe('NEW_ASK_PHOTO');
    expect((await send('Pular')).at(-1)).toBe(MENU_TEXT);
    expect((await store.get(H))?.step).toBe('MENU');
  });

  it('foto fora do passo da foto pede texto e não mexe na conversa', async () => {
    await send('oi');
    await send('2');
    expect(await sendFoto()).toEqual([NEED_TEXT]);
    expect((await store.get(H))?.step).toBe('NEW_ASK_TITLE');
  });

  it('foto como primeira mensagem recebe a saudação', async () => {
    expect(await sendFoto()).toEqual([GREETING_TEXT, MENU_TEXT]);
  });
});
