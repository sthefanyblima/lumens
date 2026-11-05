import { and, criarCliente, eq, estudantes, eventos, pautas, type Db } from '@lumens/db';
import { criarBancoEmMemoria, criarBancoTemporario } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { registrarApoio, type NovoApoio } from './apoio';
import { criarEstudanteVerificado, criarPauta } from './fabricas';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const apoiar = (entrada: NovoApoio, banco: Db = db) =>
  banco.transaction((tx) => registrarApoio(tx, entrada));

const lerPauta = async (id: string, banco: Db = db) =>
  (await banco.select().from(pautas).where(eq(pautas.id, id)))[0];

const tiposDeEvento = async (id: string, banco: Db = db) =>
  (await banco.select({ tipo: eventos.tipo }).from(eventos).where(eq(eventos.pautaId, id))).map(
    (e) => e.tipo,
  );

describe('registrarApoio', () => {
  it('registra o apoio e devolve o total', async () => {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);

    const r = await apoiar({ pautaId: pauta.id, estudanteId: estudante.id, origem: 'bot' });

    expect(r).toEqual({ registrado: true, totalApoios: 1, metaBatidaAgora: false });
  });

  it('segundo apoio do mesmo estudante é ignorado e a contagem não muda (RN02)', async () => {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);
    await apoiar({ pautaId: pauta.id, estudanteId: estudante.id, origem: 'bot' });

    const r = await apoiar({ pautaId: pauta.id, estudanteId: estudante.id, origem: 'site' });

    expect(r).toEqual({ registrado: false, motivo: 'ja_apoiou', totalApoios: 1 });
  });

  it.each([
    ['não verificado', { verificadoEm: null }],
    ['que saiu do Lumens', { saiuEm: new Date() }],
  ])('estudante %s não apoia e nada é gravado (RN01)', async (_, campos) => {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);
    await db.update(estudantes).set(campos).where(eq(estudantes.id, estudante.id));

    const r = await apoiar({ pautaId: pauta.id, estudanteId: estudante.id, origem: 'bot' });
    const outro = await criarEstudanteVerificado(db);
    const depois = await apoiar({ pautaId: pauta.id, estudanteId: outro.id, origem: 'bot' });

    expect(r).toEqual({ registrado: false, motivo: 'estudante_nao_verificado' });
    expect(depois).toMatchObject({ totalApoios: 1 });
  });

  it.each(['em_curadoria', 'recusada'] as const)(
    'pauta em %s não recebe apoio (RN12)',
    async (status) => {
      const pauta = await criarPauta(db, { status });
      const estudante = await criarEstudanteVerificado(db);

      const r = await apoiar({ pautaId: pauta.id, estudanteId: estudante.id, origem: 'bot' });

      expect(r).toEqual({ registrado: false, motivo: 'pauta_sem_apoio' });
    },
  );

  it('pauta que não existe', async () => {
    const estudante = await criarEstudanteVerificado(db);
    const r = await apoiar({
      pautaId: '00000000-0000-0000-0000-000000000000',
      estudanteId: estudante.id,
      origem: 'bot',
    });
    expect(r).toEqual({ registrado: false, motivo: 'pauta_inexistente' });
  });

  describe('meta batida (RN05)', () => {
    it('o apoio que atinge a meta grava meta_batida_em e emite o evento uma vez só', async () => {
      const pauta = await criarPauta(db, { meta: 2 });
      const [a, b, c] = [
        await criarEstudanteVerificado(db),
        await criarEstudanteVerificado(db),
        await criarEstudanteVerificado(db),
      ];
      const agora = new Date('2026-11-05T12:00:00.000Z');

      const primeiro = await apoiar({ pautaId: pauta.id, estudanteId: a.id, origem: 'bot' });
      const bateu = await apoiar({ pautaId: pauta.id, estudanteId: b.id, origem: 'site', agora });
      const depois = await apoiar({ pautaId: pauta.id, estudanteId: c.id, origem: 'bot' });

      expect(primeiro).toMatchObject({ metaBatidaAgora: false });
      expect(bateu).toEqual({ registrado: true, totalApoios: 2, metaBatidaAgora: true });
      expect(depois).toEqual({ registrado: true, totalApoios: 3, metaBatidaAgora: false });

      const lida = await lerPauta(pauta.id);
      expect(lida?.metaBatidaEm).toEqual(agora);
      expect(lida?.status).toBe('meta_batida');
      expect(await tiposDeEvento(pauta.id)).toEqual(['meta_batida', 'status_alterado']);
    });

    it('pauta já em cobrando que bate a meta grava e emite, mas não volta o status', async () => {
      const pauta = await criarPauta(db, { status: 'cobrando', meta: 1 });
      const estudante = await criarEstudanteVerificado(db);

      const r = await apoiar({ pautaId: pauta.id, estudanteId: estudante.id, origem: 'bot' });

      expect(r).toMatchObject({ metaBatidaAgora: true });
      const lida = await lerPauta(pauta.id);
      expect(lida?.status).toBe('cobrando');
      expect(lida?.metaBatidaEm).not.toBeNull();
      expect(await tiposDeEvento(pauta.id)).toEqual(['meta_batida']);
    });

    it('o evento leva só a meta e o total, sem quem apoiou', async () => {
      const pauta = await criarPauta(db, { meta: 1 });
      const estudante = await criarEstudanteVerificado(db);
      await apoiar({ pautaId: pauta.id, estudanteId: estudante.id, origem: 'bot' });

      const [evento] = await db
        .select({ dados: eventos.dados, publico: eventos.publico })
        .from(eventos)
        .where(and(eq(eventos.tipo, 'meta_batida'), eq(eventos.pautaId, pauta.id)));
      expect(evento).toEqual({ dados: { meta: 1, apoios: 1 }, publico: true });
    });
  });
});

// Concorrência precisa de duas conexões ao mesmo tempo, o que o PGlite não tem.
const URL_TESTE = process.env.DATABASE_URL_TESTE;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');

describe.skipIf(!URL_TESTE)('registrarApoio com Postgres de verdade', () => {
  it('dois apoios simultâneos que cruzam a meta geram um evento meta_batida só', async () => {
    const temporario = await criarBancoTemporario(URL_TESTE ?? '');
    const { db: real, pool } = criarCliente(temporario.url);
    try {
      const pauta = await criarPauta(real, { meta: 2 });
      const [a, b, c] = [
        await criarEstudanteVerificado(real),
        await criarEstudanteVerificado(real),
        await criarEstudanteVerificado(real),
      ];
      await apoiar({ pautaId: pauta.id, estudanteId: a.id, origem: 'bot' }, real);

      const resultados = await Promise.all([
        apoiar({ pautaId: pauta.id, estudanteId: b.id, origem: 'bot' }, real),
        apoiar({ pautaId: pauta.id, estudanteId: c.id, origem: 'bot' }, real),
      ]);

      expect(resultados.filter((r) => r.registrado && r.metaBatidaAgora)).toHaveLength(1);
      expect((await tiposDeEvento(pauta.id, real)).filter((t) => t === 'meta_batida')).toHaveLength(
        1,
      );
    } finally {
      await pool.end();
      await temporario.apagar();
    }
  });
});
