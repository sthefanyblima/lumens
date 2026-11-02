import { disparos, estudantes, eq, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TipoDisparo } from './envio';
import {
  RESERVA_EXPIRA_MS,
  enfileirarDisparos,
  registrarEntrega,
  registrarEnvio,
  registrarFalha,
  reservarLote,
  type NovoAviso,
} from './fila';

const T0 = new Date('2026-11-02T12:00:00.000Z');
const depois = (ms: number) => new Date(T0.getTime() + ms);
const MINUTO = 60_000;
const HORA = 60 * MINUTO;

let db: Db;
let seq = 0;

beforeEach(async () => {
  db = await criarBancoEmMemoria();
});

async function estudante(): Promise<string> {
  const n = String(++seq);
  const [linha] = await db
    .insert(estudantes)
    .values({ telefoneHmac: `tel-${n}`, telefoneCifrado: `cifrado-${n}` })
    .returning({ id: estudantes.id });
  if (linha === undefined) throw new Error('estudante não criado');
  return linha.id;
}

function aviso(tipo: TipoDisparo, estudanteId: string, avisoId = 'pauta-1'): NovoAviso {
  return { tipo, aviso: avisoId, estudanteId, modelo: `lumens_${tipo}`, parametros: ['Pauta'] };
}

const enfileirar = (avisos: NovoAviso[], agora = T0) =>
  db.transaction((tx) => enfileirarDisparos(tx, avisos, agora));
const reservar = (limite: number, agora: Date) =>
  db.transaction((tx) => reservarLote(tx, { limite, agora }));

/** Reserva um lote e registra todos como enviados, como faria quem envia. */
async function enviarLote(limite: number, agora: Date) {
  const lote = await reservar(limite, agora);
  for (const d of lote) {
    await db.transaction((tx) =>
      registrarEnvio(tx, { id: d.id, wamidHmac: `wamid-${d.id}`, agora }),
    );
  }
  return lote;
}

const resumo = (lote: { tipo: string; estudanteId: string }[]) =>
  lote.map((d) => `${d.tipo}:${d.estudanteId}`);

describe('enfileirarDisparos', () => {
  it('o mesmo aviso para a mesma pessoa entra uma vez só', async () => {
    const a = await estudante();

    expect(await enfileirar([aviso('meta_batida', a)])).toBe(1);
    expect(await enfileirar([aviso('meta_batida', a)])).toBe(0);

    expect(await db.select().from(disparos)).toHaveLength(1);
  });

  it('avisos diferentes para a mesma pessoa entram todos', async () => {
    const a = await estudante();

    const n = await enfileirar([
      aviso('meta_batida', a, 'pauta-1'),
      aviso('meta_batida', a, 'pauta-2'),
      aviso('lembrete', a, 'pauta-1'),
    ]);

    expect(n).toBe(3);
  });

  it('enfileirar de novo um aviso que já saiu não reenvia', async () => {
    const a = await estudante();
    await enfileirar([aviso('meta_batida', a)]);
    await enviarLote(10, T0);

    await enfileirar([aviso('meta_batida', a)], depois(2 * HORA));

    expect(await reservar(10, depois(30 * HORA))).toEqual([]);
  });

  it('guarda modelo e parâmetros para quem envia', async () => {
    const a = await estudante();
    await enfileirar([
      { ...aviso('conferencia', a), parametros: ['Bebedouro', '15/10/2026', 'trocar', '22/10'] },
    ]);

    const [reservado] = await reservar(10, T0);

    expect(reservado?.modelo).toBe('lumens_conferencia');
    expect(reservado?.parametros).toEqual(['Bebedouro', '15/10/2026', 'trocar', '22/10']);
  });
});

describe('reservarLote (RNF06)', () => {
  it('respeita o limite de pessoas e a prioridade', async () => {
    const [a, b, c] = [await estudante(), await estudante(), await estudante()];
    await enfileirar([aviso('meta_batida', a)], T0);
    await enfileirar([aviso('meta_batida', b)], depois(1000));
    await enfileirar([aviso('meta_batida', c)], depois(2000));
    await enfileirar([aviso('conferencia', c, 'promessa-1')], depois(MINUTO));

    const lote = await reservar(2, T0);

    // A conferência de C passa na frente; a meta batida de C sai de graça
    // porque C já entrou neste lote; B espera.
    expect(resumo(lote)).toEqual([`conferencia:${c}`, `meta_batida:${a}`, `meta_batida:${c}`]);
  });

  it('o que foi reservado não sai de novo no lote seguinte', async () => {
    const a = await estudante();
    await enfileirar([aviso('meta_batida', a)]);

    expect(await reservar(10, T0)).toHaveLength(1);
    expect(await reservar(10, depois(MINUTO))).toEqual([]);
  });

  describe('retomada', () => {
    it('reserva que não virou envio volta depois que vence', async () => {
      // O processo caiu entre reservar e chamar a Meta.
      const a = await estudante();
      await enfileirar([aviso('conferencia', a)]);
      const [primeiro] = await reservar(10, T0);

      expect(await reservar(10, depois(RESERVA_EXPIRA_MS - 1))).toEqual([]);

      const [retomado] = await reservar(10, depois(RESERVA_EXPIRA_MS + 1));
      expect(retomado?.id).toBe(primeiro?.id);
    });

    it('retomar não gasta vaga de novo: a pessoa já estava contada', async () => {
      const [a, b] = [await estudante(), await estudante()];
      await enfileirar([aviso('meta_batida', a)], T0);
      await enfileirar([aviso('meta_batida', b)], depois(1000));
      await reservar(1, T0);

      // Limite de 1, já ocupado por A. A reserva de A vence e ela volta de
      // graça; B continua esperando.
      const lote = await reservar(1, depois(RESERVA_EXPIRA_MS + 1));

      expect(resumo(lote)).toEqual([`meta_batida:${a}`]);
    });

    it('o que a Meta aceitou nunca volta, nem com a reserva vencida', async () => {
      const a = await estudante();
      await enfileirar([aviso('meta_batida', a)]);
      await enviarLote(10, T0);

      expect(await reservar(10, depois(2 * RESERVA_EXPIRA_MS))).toEqual([]);
    });

    it('o que falhou de vez sai da fila', async () => {
      const a = await estudante();
      await enfileirar([aviso('meta_batida', a)]);
      const [d] = await reservar(10, T0);

      await db.transaction((tx) =>
        registrarFalha(tx, { id: d?.id ?? '', motivo: '131026', agora: T0 }),
      );

      expect(await reservar(10, depois(2 * RESERVA_EXPIRA_MS))).toEqual([]);
      const [linha] = await db.select().from(disparos);
      expect(linha?.falha).toBe('131026');
    });
  });

  describe('janela móvel de 24h', () => {
    it('a vaga só volta 24h depois de usada, não à meia-noite', async () => {
      const [a, b] = [await estudante(), await estudante()];
      await enfileirar([aviso('meta_batida', a)], T0);
      await enfileirar([aviso('meta_batida', b)], depois(1000));
      await enviarLote(1, T0);

      // 12h depois já é outro dia em qualquer fuso do Brasil, e B ainda espera.
      expect(await reservar(1, depois(12 * HORA))).toEqual([]);
      expect(await reservar(1, depois(24 * HORA - MINUTO))).toEqual([]);

      const lote = await reservar(1, depois(24 * HORA + MINUTO));
      expect(resumo(lote)).toEqual([`meta_batida:${b}`]);
    });

    it('segundo aviso para quem já recebeu nas 24h sai mesmo com o limite cheio', async () => {
      const [a, b] = [await estudante(), await estudante()];
      await enfileirar([aviso('meta_batida', a)]);
      await enviarLote(1, T0);

      await enfileirar([
        aviso('conferencia', a, 'promessa-1'),
        aviso('conferencia', b, 'promessa-1'),
      ]);
      const lote = await reservar(1, depois(HORA));

      expect(resumo(lote)).toEqual([`conferencia:${a}`]);
    });
  });
});

describe('registro de entrega', () => {
  async function umEnviado() {
    const a = await estudante();
    await enfileirar([aviso('resposta_oficial', a)]);
    const [d] = await reservar(10, T0);
    if (d === undefined) throw new Error('nada reservado');
    return d.id;
  }

  it('registrarEnvio vale uma vez só', async () => {
    const id = await umEnviado();

    const primeiro = await db.transaction((tx) =>
      registrarEnvio(tx, { id, wamidHmac: 'w-1', agora: T0 }),
    );
    const segundo = await db.transaction((tx) =>
      registrarEnvio(tx, { id, wamidHmac: 'w-2', agora: depois(MINUTO) }),
    );

    expect([primeiro, segundo]).toEqual([true, false]);
    const [linha] = await db.select().from(disparos).where(eq(disparos.id, id));
    expect(linha?.wamidHmac).toBe('w-1');
  });

  it('a entrega casa pelo wamid e guarda quando chegou', async () => {
    const id = await umEnviado();
    await db.transaction((tx) => registrarEnvio(tx, { id, wamidHmac: 'w-1', agora: T0 }));

    const entregue = await db.transaction((tx) =>
      registrarEntrega(tx, { wamidHmac: 'w-1', agora: depois(MINUTO) }),
    );

    expect(entregue).toBe(true);
    const [linha] = await db.select().from(disparos).where(eq(disparos.id, id));
    expect(linha?.entregueEm).toEqual(depois(MINUTO));
  });

  it('`read` depois de `delivered` não muda o instante da entrega', async () => {
    const id = await umEnviado();
    await db.transaction((tx) => registrarEnvio(tx, { id, wamidHmac: 'w-1', agora: T0 }));
    await db.transaction((tx) => registrarEntrega(tx, { wamidHmac: 'w-1', agora: depois(MINUTO) }));

    const denovo = await db.transaction((tx) =>
      registrarEntrega(tx, { wamidHmac: 'w-1', agora: depois(HORA) }),
    );

    expect(denovo).toBe(false);
    const [linha] = await db.select().from(disparos).where(eq(disparos.id, id));
    expect(linha?.entregueEm).toEqual(depois(MINUTO));
  });

  it('status de um wamid que ainda não foi registrado devolve false', async () => {
    // A Meta pode mandar o status antes de registrarEnvio confirmar.
    expect(
      await db.transaction((tx) => registrarEntrega(tx, { wamidHmac: 'desconhecido', agora: T0 })),
    ).toBe(false);
  });

  it('falha não sobrescreve um envio já registrado', async () => {
    const id = await umEnviado();
    await db.transaction((tx) => registrarEnvio(tx, { id, wamidHmac: 'w-1', agora: T0 }));

    const falhou = await db.transaction((tx) =>
      registrarFalha(tx, { id, motivo: 'tarde demais', agora: depois(MINUTO) }),
    );

    expect(falhou).toBe(false);
  });
});
