import { criarDb, criarPool, type Db } from '@lumens/db';
import { criarBancoTemporario } from '@lumens/db/teste';
import { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { cifrar, type Chaves } from '../cripto';
import { filaPgBoss, JOBS } from '../queue';
import type { HandlerRegistry, StepHandler } from './conversation/handlers';
import { STEPS } from './conversation/steps';
import { ConversationStore } from './conversation/store';
import type { IncomingMessageJob } from './webhook/process';
import { desbloquearConversas, prepararFilaDeEntrada, registerIncomingWorker } from './worker';

/**
 * Worker com Postgres e pg-boss de verdade, em duas instâncias ao mesmo tempo: é o que o PGlite
 * (uma conexão só) não reproduz. Precisa do `DATABASE_URL_TESTE` (o `pnpm db:up` local e o CI).
 */
const URL_TESTE = process.env.DATABASE_URL_TESTE;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');

const chaves: Chaves = { cifra: Buffer.alloc(32, 7), hmac: Buffer.alloc(32, 8) };
const PHONE_HMAC = 'c'.repeat(64);
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Handler de teste: registra cada texto na ordem em que é aplicado e volta ao menu. Um texto em
 * `falhaUmaVez` lança na primeira vez, como um banco que piscou.
 */
function registrador(
  aplicadas: string[],
  atrasoMs: Record<string, number> = {},
  falhaUmaVez = new Set<string>(),
): HandlerRegistry {
  const handler: StepHandler = async ({ input }) => {
    if (falhaUmaVez.delete(input.text)) throw new Error('banco piscou');
    await esperar(atrasoMs[input.text] ?? 0);
    aplicadas.push(input.text);
    // 'quebra' pede uma transição inválida: bug do handler, a mensagem vai para a fila de mortas.
    return { next: input.text === 'quebra' ? 'NEW_ASK_PHOTO' : 'MENU', replies: [] };
  };
  return Object.fromEntries(STEPS.map((step) => [step, handler])) as HandlerRegistry;
}

let contador = 0;
function mensagem(texto: string): IncomingMessageJob {
  contador++;
  return {
    wamidHmac: `w${String(contador)}`,
    wamidCifrado: 'x',
    phoneHmac: PHONE_HMAC,
    phoneCifrado: 'telefone-cifrado',
    phoneNumberId: 'PNID',
    type: 'text',
    timestamp: '1700000000',
    contentCifrado: cifrar(JSON.stringify({ text: { body: texto } }), chaves.cifra),
  };
}

async function esperarAte(condicao: () => boolean | Promise<boolean>, limiteMs = 20_000) {
  const fim = Date.now() + limiteMs;
  while (!(await condicao())) {
    if (Date.now() > fim) throw new Error('tempo esgotado esperando a condição');
    await esperar(100);
  }
}

interface Ambiente {
  db: Db;
  pool: ReturnType<typeof criarPool>;
  bosses: PgBoss[];
  apagar: () => Promise<void>;
}
let ambiente: Ambiente | undefined;

async function montar(instancias: number): Promise<Ambiente> {
  if (!URL_TESTE) throw new Error('sem DATABASE_URL_TESTE');
  const banco = await criarBancoTemporario(URL_TESTE);
  const pool = criarPool(banco.url, { conexaoMs: 5000, consultaMs: 15_000 }, () => undefined);
  const bosses: PgBoss[] = [];
  for (let i = 0; i < instancias; i++) {
    const boss = new PgBoss({ connectionString: banco.url, supervise: false, schedule: false });
    boss.on('error', () => undefined);
    await boss.start();
    bosses.push(boss);
  }
  // A fila precisa existir antes de enfileirar; o worker de cada instância vem depois.
  const primeiro = bosses[0];
  if (!primeiro) throw new Error('nenhuma instância');
  await prepararFilaDeEntrada(primeiro);
  // As respostas vão para outgoing-replies na mesma transação; sem a fila, o send falha.
  await primeiro.createQueue(JOBS.outgoingReplies);
  ambiente = { db: criarDb(pool), pool, bosses, apagar: banco.apagar };
  return ambiente;
}

afterEach(async () => {
  if (!ambiente) return;
  const { bosses, pool, apagar } = ambiente;
  ambiente = undefined;
  await Promise.all(bosses.map((boss) => boss.stop({ graceful: false })));
  await pool.end();
  await apagar();
}, 30_000);

async function enfileirar(db: Db, boss: PgBoss, textos: string[]) {
  const fila = filaPgBoss(boss);
  // Uma transação por mensagem, como o webhook faz: cada job ganha o seu created_on.
  for (const texto of textos) {
    await db.transaction((tx) =>
      fila.send(JOBS.incomingMessage, mensagem(texto), tx, { chave: PHONE_HMAC }),
    );
  }
}

function depsPara(db: Db, boss: PgBoss, handlers: HandlerRegistry) {
  return {
    db,
    store: new ConversationStore(db),
    queue: filaPgBoss(boss),
    logger: pino({ level: 'silent' }),
    chaves,
    handlers,
  };
}

describe.skipIf(!URL_TESTE)('worker com Postgres e pg-boss de verdade', () => {
  it('duas instâncias aplicam as mensagens do mesmo telefone na ordem de chegada', async () => {
    const { db, bosses } = await montar(2);
    const [a, b] = bosses as [PgBoss, PgBoss];
    const textos = Array.from({ length: 12 }, (_, i) => String(i + 1));
    await enfileirar(db, a, textos);

    // A primeira mensagem demora: sem ordem por conversa entre instâncias, a segunda instância
    // pegaria um lote com as últimas e as aplicaria antes das do meio (1,11,2,12,3,...).
    const aplicadas: string[] = [];
    const handlers = registrador(aplicadas, { '1': 1500 });
    await registerIncomingWorker(a, depsPara(db, a, handlers));
    await esperar(300);
    await registerIncomingWorker(b, depsPara(db, b, handlers));

    await esperarAte(() => aplicadas.length >= textos.length);
    expect(aplicadas).toEqual(textos);
  }, 40_000);

  it('mensagem descartada vai para a fila de mortas e não trava a conversa', async () => {
    const { db, bosses } = await montar(1);
    const [a] = bosses as [PgBoss];
    await enfileirar(db, a, ['oi', 'quebra', 'depois']);

    const aplicadas: string[] = [];
    await registerIncomingWorker(a, depsPara(db, a, registrador(aplicadas)));

    await esperarAte(() => aplicadas.includes('depois'));
    const mortas = await a.findJobs(JOBS.incomingMessageDead);
    expect(mortas).toHaveLength(1);
    const pendentes = await a.findJobs(JOBS.incomingMessage, { queued: true });
    expect(pendentes).toHaveLength(0);
  }, 40_000);

  it('falha passageira volta pelo retry do pg-boss e segura as mensagens seguintes', async () => {
    const { db, bosses } = await montar(1);
    const [a] = bosses as [PgBoss];
    await enfileirar(db, a, ['oi', 'pisca', 'depois']);

    const aplicadas: string[] = [];
    const handlers = registrador(aplicadas, {}, new Set(['pisca']));
    await registerIncomingWorker(a, depsPara(db, a, handlers));

    // O retry do pg-boss espera alguns segundos (backoff); 'depois' não passa na frente.
    await esperarAte(() => aplicadas.includes('depois'));
    expect(aplicadas).toEqual(['oi', 'pisca', 'depois']);
    expect(await a.findJobs(JOBS.incomingMessageDead)).toHaveLength(0);
  }, 40_000);

  it('job que o pg-boss falhou sozinho (expirou demais) é tirado da frente da conversa', async () => {
    const { db, bosses } = await montar(1);
    const [a] = bosses as [PgBoss];
    // Simula o que o supervisor faz com um job que expirou além do retryLimit: falha terminal.
    // Com retryLimit 0, a primeira falha já é a última.
    await a.send(JOBS.incomingMessage, mensagem('travado'), {
      singletonKey: PHONE_HMAC,
      retryLimit: 0,
    });
    const [pego] = await a.fetch(JOBS.incomingMessage);
    if (!pego) throw new Error('nada para pegar');
    await a.fail(JOBS.incomingMessage, pego.id);
    await enfileirar(db, a, ['depois']);

    const aplicadas: string[] = [];
    await registerIncomingWorker(a, depsPara(db, a, registrador(aplicadas)));
    await esperar(1500);
    // Enquanto o job falhado estiver lá, a conversa não anda.
    expect(aplicadas).toEqual([]);

    expect(await desbloquearConversas(a, pino({ level: 'silent' }))).toBe(1);
    await esperarAte(() => aplicadas.includes('depois'));
    expect(aplicadas).toEqual(['depois']);
  }, 40_000);
});
