import { type Db, eq } from '@lumens/db';
import { blocos, caminhos, pautas } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type RegistroDeProtocolo, registrarProtocolo } from './caminho-registro';

const NUP = '23546.012345/2026-78';
const ABERTO_EM = '2026-10-01';

let db: Db;

let seq = 0;
/** Sufixo único por cenário, para as colunas `slug`, que são únicas. */
const unico = () => String(++seq).padStart(4, '0');

/** Uma pauta com um caminho aberto, do tipo pedido. */
async function montarCaminho(tipo: 'falabr' | 'comunidade' = 'falabr'): Promise<string> {
  const n = unico();

  const [bloco] = await db
    .insert(blocos)
    .values({ slug: `bloco-${n}`, nome: `Bloco ${n}`, baseEstudantes: 1200 })
    .returning({ id: blocos.id });

  const [pauta] = await db
    .insert(pautas)
    .values({
      slug: `mais-mesas-no-ru-${n}`,
      titulo: 'Mais mesas no RU',
      descricao: 'O Restaurante Universitário não tem mesa suficiente no horário do almoço.',
      categoria: 'infraestrutura',
      blocoId: bloco?.id,
      status: 'cobrando',
      meta: 120,
    })
    .returning({ id: pautas.id });

  if (pauta === undefined) throw new Error('pauta não criada');

  const [caminho] = await db
    .insert(caminhos)
    .values({ pautaId: pauta.id, tipo, status: 'aberto' })
    .returning({ id: caminhos.id });

  if (caminho === undefined) throw new Error('caminho não criado');
  return caminho.id;
}

const lerCaminho = async (id: string) =>
  (
    await db
      .select({ protocolo: caminhos.protocolo, prazo: caminhos.prazo })
      .from(caminhos)
      .where(eq(caminhos.id, id))
      .limit(1)
  )[0];

/** O port roda dentro da transação de quem chama; o teste faz o mesmo. */
const registrar = (entrada: RegistroDeProtocolo) =>
  db.transaction((tx) => registrarProtocolo(tx, entrada));

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

beforeEach(() => {
  seq += 100;
});

describe('registrarProtocolo (SCRUM-215)', () => {
  it('grava o número e o prazo no mesmo passo', async () => {
    const id = await montarCaminho();

    const r = await registrar({ caminhoId: id, protocolo: NUP, abertoEm: ABERTO_EM });

    expect(r).toEqual({ registrado: true, protocolo: NUP, prazo: '2026-10-31', jaEstava: false });
    expect(await lerCaminho(id)).toEqual({ protocolo: NUP, prazo: '2026-10-31' });
  });

  it('nunca deixa protocolo sem prazo', async () => {
    // É o prazo que sustenta a cobrança: protocolo sem prazo não é cobrável.
    const id = await montarCaminho();

    await registrar({ caminhoId: id, protocolo: NUP, abertoEm: ABERTO_EM });

    expect((await lerCaminho(id))?.prazo).not.toBeNull();
  });

  it('prorrogação dobra o prazo gravado', async () => {
    const id = await montarCaminho();

    const r = await registrar({
      caminhoId: id,
      protocolo: NUP,
      abertoEm: ABERTO_EM,
      prorrogado: true,
    });

    expect(r).toMatchObject({ registrado: true, prazo: '2026-11-30' });
  });

  it('arruma espaço e quebra de linha do número colado', async () => {
    const id = await montarCaminho();

    const r = await registrar({
      caminhoId: id,
      protocolo: `  23546.012345/2026-78\n `,
      abertoEm: ABERTO_EM,
    });

    expect(r).toMatchObject({ registrado: true, protocolo: NUP });
  });

  describe('reenvio', () => {
    it('mandar o mesmo número de novo não é erro e não regrava', async () => {
      // O bot pode perder a confirmação e o owner reenviar.
      const id = await montarCaminho();
      await registrar({ caminhoId: id, protocolo: NUP, abertoEm: ABERTO_EM });

      // Data diferente de propósito: o prazo da primeira vez é que vale.
      const r = await registrar({
        caminhoId: id,
        protocolo: NUP,
        abertoEm: '2026-11-20',
      });

      expect(r).toEqual({ registrado: true, protocolo: NUP, prazo: '2026-10-31', jaEstava: true });
      expect((await lerCaminho(id))?.prazo).toBe('2026-10-31');
    });

    it('reconhece o mesmo número escrito com outra pontuação', async () => {
      const id = await montarCaminho();
      await registrar({ caminhoId: id, protocolo: NUP, abertoEm: ABERTO_EM });

      const r = await registrar({
        caminhoId: id,
        protocolo: '23546012345202678',
        abertoEm: ABERTO_EM,
      });

      expect(r).toMatchObject({ registrado: true, jaEstava: true });
    });

    it('número diferente é recusado em vez de sobrescrever', async () => {
      // O protocolo liga a pauta a uma manifestação real; trocá-lo calado
      // perderia o vínculo sem deixar rastro.
      const id = await montarCaminho();
      await registrar({ caminhoId: id, protocolo: NUP, abertoEm: ABERTO_EM });

      const r = await registrar({
        caminhoId: id,
        protocolo: '99999.999999/2026-11',
        abertoEm: ABERTO_EM,
      });

      expect(r).toEqual({ registrado: false, motivo: 'protocolo_divergente' });
      expect((await lerCaminho(id))?.protocolo).toBe(NUP);
    });
  });

  describe('o que é recusado', () => {
    it('caminho que não existe', async () => {
      const r = await registrar({
        caminhoId: '00000000-0000-0000-0000-000000000000',
        protocolo: NUP,
        abertoEm: ABERTO_EM,
      });

      expect(r).toEqual({ registrado: false, motivo: 'caminho_inexistente' });
    });

    it('caminho que não emite protocolo', async () => {
      const id = await montarCaminho('comunidade');

      const r = await registrar({
        caminhoId: id,
        protocolo: NUP,
        abertoEm: ABERTO_EM,
      });

      expect(r).toEqual({ registrado: false, motivo: 'caminho_sem_protocolo' });
      expect((await lerCaminho(id))?.protocolo).toBeNull();
    });

    it.each([
      ['vazio', ''],
      ['só espaço', '   '],
      ['sem nenhum dígito', 'protocolo pendente'],
      ['comprido demais', '1'.repeat(61)],
    ])('protocolo %s', async (_caso, protocolo) => {
      const id = await montarCaminho();

      const r = await registrar({ caminhoId: id, protocolo, abertoEm: ABERTO_EM });

      expect(r).toEqual({ registrado: false, motivo: 'protocolo_invalido' });
      expect((await lerCaminho(id))?.protocolo).toBeNull();
    });

    it('aceita formato fora do NUP, desde que tenha dígito', async () => {
      // Deliberado: o que o owner copia varia conforme a tela e o e-mail. Uma
      // regra estrita impediria quem tem o protocolo na mão de registrá-lo.
      const id = await montarCaminho();

      const r = await registrar({
        caminhoId: id,
        protocolo: 'OUV-2026-004512',
        abertoEm: ABERTO_EM,
      });

      expect(r).toMatchObject({ registrado: true });
    });

    it('data de abertura inválida sobe como erro, não grava protocolo torto', async () => {
      const id = await montarCaminho();

      await expect(
        registrar({ caminhoId: id, protocolo: NUP, abertoEm: '01/10/2026' }),
      ).rejects.toThrow(RangeError);

      expect((await lerCaminho(id))?.protocolo).toBeNull();
    });
  });
});
