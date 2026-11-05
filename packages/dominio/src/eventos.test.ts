import { eq, eventos, pautas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { ErroDeRegra } from './erros';
import { registrarEvento, TIPOS_EVENTO, type TipoEvento } from './eventos';
import { criarPauta } from './fabricas';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const eventosDa = (pautaId: string) =>
  db
    .select({ tipo: eventos.tipo, dados: eventos.dados, publico: eventos.publico })
    .from(eventos)
    .where(eq(eventos.pautaId, pautaId));

describe('registrarEvento (RN11)', () => {
  it('ação e evento gravam juntos na mesma transação', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria' });

    await db.transaction(async (tx) => {
      await tx.update(pautas).set({ status: 'juntando_apoios' }).where(eq(pautas.id, pauta.id));
      await registrarEvento(tx, {
        pautaId: pauta.id,
        tipo: 'status_alterado',
        dados: { de: 'em_curadoria', para: 'juntando_apoios' },
        origem: 'curadoria',
      });
    });

    const [lida] = await db.select().from(pautas).where(eq(pautas.id, pauta.id));
    expect(lida?.status).toBe('juntando_apoios');
    expect(await eventosDa(pauta.id)).toEqual([
      {
        tipo: 'status_alterado',
        dados: { de: 'em_curadoria', para: 'juntando_apoios' },
        publico: true,
      },
    ]);
  });

  it('erro depois de gravar desfaz a ação e o evento', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria' });

    await expect(
      db.transaction(async (tx) => {
        await tx.update(pautas).set({ status: 'juntando_apoios' }).where(eq(pautas.id, pauta.id));
        await registrarEvento(tx, {
          pautaId: pauta.id,
          tipo: 'pauta_aprovada',
          dados: {},
          origem: 'curadoria',
        });
        throw new Error('falha no meio do caminho');
      }),
    ).rejects.toThrow('falha no meio do caminho');

    const [lida] = await db.select().from(pautas).where(eq(pautas.id, pauta.id));
    expect(lida?.status).toBe('em_curadoria');
    expect(await eventosDa(pauta.id)).toEqual([]);
  });

  it.each([
    ['estudante_id', { estudante_id: 'abc' }],
    ['telefone', { telefone: '5582999999999' }],
    ['email', { email: 'fulano@ufal.br' }],
    ['aninhado', { caminho_id: 'c1', autor: { nome: 'Fulano' } }],
  ])('recusa dados com identidade (%s) e não grava nada', async (_, dados) => {
    const pauta = await criarPauta(db);

    const tentativa = db.transaction((tx) =>
      registrarEvento(tx, {
        pautaId: pauta.id,
        tipo: 'caminho_aberto',
        // Simula um chamador fora do TypeScript, que é exatamente o caso que a checagem pega.
        dados: dados as never,
        origem: 'bot',
      }),
    );

    await expect(tentativa).rejects.toThrow(ErroDeRegra);
    await expect(tentativa).rejects.toMatchObject({ codigo: 'dados_pessoais_no_evento' });
    expect(await eventosDa(pauta.id)).toEqual([]);
  });

  it('recusa tipo fora do catálogo', async () => {
    const pauta = await criarPauta(db);
    await expect(
      db.transaction((tx) =>
        registrarEvento(tx, {
          pautaId: pauta.id,
          tipo: 'pauta_apagada' as TipoEvento,
          dados: {},
          origem: 'bot',
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'evento_desconhecido' });
  });

  it('status_alterado para recusada não é público; os demais seguem o catálogo', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria' });

    const recusa = await db.transaction((tx) =>
      registrarEvento(tx, {
        pautaId: pauta.id,
        tipo: 'status_alterado',
        dados: { de: 'em_curadoria', para: 'recusada' },
        origem: 'curadoria',
      }),
    );
    const criacao = await db.transaction((tx) =>
      registrarEvento(tx, {
        pautaId: pauta.id,
        tipo: 'pauta_criada',
        dados: { status: 'em_curadoria' },
        origem: 'bot',
      }),
    );

    expect(recusa.publico).toBe(false);
    expect(criacao.publico).toBe(false);
  });

  it('o catálogo tem os 16 tipos da T7', () => {
    expect(TIPOS_EVENTO).toHaveLength(16);
  });
});
