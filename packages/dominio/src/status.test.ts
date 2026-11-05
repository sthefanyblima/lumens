import { eq, eventos, pautas, type Db, type StatusPauta } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import type { OrigemEvento } from './eventos';
import { criarPauta } from './fabricas';
import { podeTransicionar, transicionarStatus } from './status';

const STATUS: StatusPauta[] = [
  'em_curadoria',
  'recusada',
  'juntando_apoios',
  'meta_batida',
  'cobrando',
  'prometido',
  'entregue_em_parte',
  'descumprida',
  'conquistada',
];

// Escrita à mão a partir do card (T11), e não derivada de TRANSICOES, para o teste ter oráculo
// próprio. Inclui as duas saídas de `descumprida` combinadas com a equipe.
const VALIDAS: [StatusPauta, StatusPauta, OrigemEvento][] = [
  ['em_curadoria', 'juntando_apoios', 'curadoria'],
  ['em_curadoria', 'recusada', 'curadoria'],
  ['juntando_apoios', 'meta_batida', 'bot'],
  ['juntando_apoios', 'cobrando', 'bot'],
  ['meta_batida', 'cobrando', 'bot'],
  ['cobrando', 'prometido', 'curadoria'],
  ['prometido', 'conquistada', 'agendador'],
  ['prometido', 'entregue_em_parte', 'agendador'],
  ['prometido', 'descumprida', 'agendador'],
  ['entregue_em_parte', 'prometido', 'curadoria'],
  ['descumprida', 'prometido', 'curadoria'],
  ['descumprida', 'cobrando', 'bot'],
];

const ehValida = (de: StatusPauta, para: StatusPauta) =>
  VALIDAS.some(([d, p]) => d === de && p === para);

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const lerPauta = async (id: string) => (await db.select().from(pautas).where(eq(pautas.id, id)))[0];
const eventosDa = (id: string) =>
  db
    .select({ tipo: eventos.tipo, dados: eventos.dados, publico: eventos.publico })
    .from(eventos)
    .where(eq(eventos.pautaId, id));

describe('podeTransicionar', () => {
  const pares = STATUS.flatMap((de) => STATUS.map((para) => [de, para] as const));

  it.each(pares)('%s → %s', (de, para) => {
    expect(podeTransicionar(de, para)).toBe(ehValida(de, para));
  });

  it('recusada e conquistada são finais', () => {
    for (const para of STATUS) {
      expect(podeTransicionar('recusada', para)).toBe(false);
      expect(podeTransicionar('conquistada', para)).toBe(false);
    }
  });
});

describe('transicionarStatus', () => {
  it.each(VALIDAS)('%s → %s muda o status e grava um evento', async (de, para, origem) => {
    const pauta = await criarPauta(db, { status: de });

    const r = await db.transaction((tx) =>
      transicionarStatus(tx, { pautaId: pauta.id, para, origem, motivo: 'duplicada' }),
    );

    expect(r).toEqual({ de, para });
    expect((await lerPauta(pauta.id))?.status).toBe(para);
    expect(await eventosDa(pauta.id)).toEqual([
      { tipo: 'status_alterado', dados: { de, para }, publico: para !== 'recusada' },
    ]);
  });

  it('transição fora da tabela lança e não grava nada', async () => {
    const pauta = await criarPauta(db, { status: 'juntando_apoios' });

    await expect(
      db.transaction((tx) =>
        transicionarStatus(tx, { pautaId: pauta.id, para: 'conquistada', origem: 'agendador' }),
      ),
    ).rejects.toMatchObject({ codigo: 'transicao_invalida' });

    expect((await lerPauta(pauta.id))?.status).toBe('juntando_apoios');
    expect(await eventosDa(pauta.id)).toEqual([]);
  });

  it.each(['bot', 'curadoria'] as const)(
    'nem o %s leva a pauta a conquistada: só a apuração',
    async (origem) => {
      const pauta = await criarPauta(db, { status: 'prometido' });

      await expect(
        db.transaction((tx) =>
          transicionarStatus(tx, { pautaId: pauta.id, para: 'conquistada', origem }),
        ),
      ).rejects.toMatchObject({ codigo: 'transicao_invalida' });

      expect((await lerPauta(pauta.id))?.status).toBe('prometido');
    },
  );

  it('falha depois da transição desfaz o status e o evento', async () => {
    const pauta = await criarPauta(db, { status: 'cobrando' });

    await expect(
      db.transaction(async (tx) => {
        await transicionarStatus(tx, { pautaId: pauta.id, para: 'prometido', origem: 'curadoria' });
        throw new Error('a promessa não foi gravada');
      }),
    ).rejects.toThrow('a promessa não foi gravada');

    expect((await lerPauta(pauta.id))?.status).toBe('cobrando');
    expect(await eventosDa(pauta.id)).toEqual([]);
  });

  it.each([undefined, '', '   '])('recusar sem motivo (%j) é erro', async (motivo) => {
    const pauta = await criarPauta(db, { status: 'em_curadoria' });

    await expect(
      db.transaction((tx) =>
        transicionarStatus(tx, {
          pautaId: pauta.id,
          para: 'recusada',
          origem: 'curadoria',
          motivo,
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'motivo_obrigatorio' });

    expect((await lerPauta(pauta.id))?.status).toBe('em_curadoria');
  });

  it('recusar grava o motivo na pauta e o evento não é público', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria' });

    await db.transaction((tx) =>
      transicionarStatus(tx, {
        pautaId: pauta.id,
        para: 'recusada',
        origem: 'curadoria',
        motivo: '  Já existe pauta igual.  ',
      }),
    );

    expect((await lerPauta(pauta.id))?.motivoRecusa).toBe('Já existe pauta igual.');
    expect((await eventosDa(pauta.id))[0]?.publico).toBe(false);
  });

  it('aprovar grava aprovada_em com o relógio de quem chama', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria' });
    const agora = new Date('2026-11-05T12:00:00.000Z');

    await db.transaction((tx) =>
      transicionarStatus(tx, {
        pautaId: pauta.id,
        para: 'juntando_apoios',
        origem: 'curadoria',
        agora,
      }),
    );

    expect((await lerPauta(pauta.id))?.aprovadaEm).toEqual(agora);
  });

  it('pauta que não existe é erro', async () => {
    await expect(
      db.transaction((tx) =>
        transicionarStatus(tx, {
          pautaId: '00000000-0000-0000-0000-000000000000',
          para: 'cobrando',
          origem: 'bot',
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'pauta_inexistente' });
  });
});
