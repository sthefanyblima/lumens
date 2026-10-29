import { and, eq, type Db } from '@lumens/db';
import {
  apoios,
  blocos,
  curadores,
  estudantes,
  pautas,
  promessas,
  respostasConferencia,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registrarRespostaConferencia } from './conferencia-registro';

const ABRE = new Date('2026-11-01T12:00:00.000Z');
const FECHA = new Date('2026-11-08T12:00:00.000Z');
const DENTRO = new Date('2026-11-03T12:00:00.000Z');

let db: Db;

interface Cenario {
  promessaId: string;
  apoiador: string;
  estranho: string;
}

let seq = 0;
/** Sufixo único por cenário, para as colunas `slug` e os HMAC, que são únicos. */
const unico = () => String(++seq).padStart(4, '0');

/** Pauta com uma promessa em conferência, um apoiador e um estudante que não apoiou. */
async function montarCenario(opcoes: { resultado?: string } = {}): Promise<Cenario> {
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
      status: 'prometido',
      meta: 120,
    })
    .returning({ id: pautas.id });

  const estudante = (prefixo: string) =>
    db
      .insert(estudantes)
      .values({ telefoneHmac: `${prefixo}-${n}`, telefoneCifrado: `cifrado-${prefixo}-${n}` })
      .returning({ id: estudantes.id });

  const [apoiador] = await estudante('apoiador');
  const [estranho] = await estudante('estranho');

  if (!pauta || !apoiador || !estranho) throw new Error('cenário incompleto');

  await db.insert(apoios).values({ pautaId: pauta.id, estudanteId: apoiador.id, origem: 'bot' });

  const [curador] = await db
    .insert(curadores)
    .values({
      emailHmac: `curador-${n}`,
      emailCifrado: `cifrado-curador-${n}`,
      nome: 'Curadoria da equipe',
    })
    .returning({ id: curadores.id });

  if (!curador) throw new Error('curador não criado');

  const [promessa] = await db
    .insert(promessas)
    .values({
      pautaId: pauta.id,
      resumo: 'Instalar 20 mesas até dezembro',
      dataEntrega: '2026-12-01',
      fonte: 'Ofício 123',
      registradaPor: curador.id,
      conferenciaAbreEm: ABRE,
      conferenciaFechaEm: FECHA,
      resultado: opcoes.resultado ?? null,
    })
    .returning({ id: promessas.id });

  if (!promessa) throw new Error('promessa não criada');
  return { promessaId: promessa.id, apoiador: apoiador.id, estranho: estranho.id };
}

const respostaGravada = (promessaId: string, estudanteId: string) =>
  db
    .select({ resposta: respostasConferencia.resposta, criadoEm: respostasConferencia.criadoEm })
    .from(respostasConferencia)
    .where(
      and(
        eq(respostasConferencia.promessaId, promessaId),
        eq(respostasConferencia.estudanteId, estudanteId),
      ),
    );

beforeAll(async () => {
  // PGlite leva alguns segundos para subir no primeiro teste.
  db = await criarBancoEmMemoria();
}, 60_000);

describe('registrarRespostaConferencia (RF-B17)', () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await montarCenario();
  });

  it('grava a resposta de quem apoiou', async () => {
    const r = await db.transaction((tx) =>
      registrarRespostaConferencia(tx, {
        promessaId: cenario.promessaId,
        estudanteId: cenario.apoiador,
        resposta: 'sim',
        agora: DENTRO,
      }),
    );

    expect(r).toEqual({ registrada: true, alterouResposta: false });
    expect(await respostaGravada(cenario.promessaId, cenario.apoiador)).toMatchObject([
      { resposta: 'sim' },
    ]);
  });

  it('recusa quem não apoiou a pauta', async () => {
    // A RN10 mede a fração de APOIADORES que respondeu: voto de fora falsearia
    // o numerador e o quórum ao mesmo tempo.
    const r = await db.transaction((tx) =>
      registrarRespostaConferencia(tx, {
        promessaId: cenario.promessaId,
        estudanteId: cenario.estranho,
        resposta: 'sim',
        agora: DENTRO,
      }),
    );

    expect(r).toEqual({ registrada: false, motivo: 'nao_apoiou' });
    expect(await respostaGravada(cenario.promessaId, cenario.estranho)).toHaveLength(0);
  });

  it('responder de novo troca o voto, não cria outra linha', async () => {
    const comum = {
      promessaId: cenario.promessaId,
      estudanteId: cenario.apoiador,
      agora: DENTRO,
    };
    await db.transaction((tx) => registrarRespostaConferencia(tx, { ...comum, resposta: 'sim' }));
    const r = await db.transaction((tx) =>
      registrarRespostaConferencia(tx, { ...comum, resposta: 'nao' }),
    );

    expect(r).toEqual({ registrada: true, alterouResposta: true });
    const linhas = await respostaGravada(cenario.promessaId, cenario.apoiador);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.resposta).toBe('nao');
  });

  it('repetir a mesma resposta não conta como mudança', async () => {
    const comum = {
      promessaId: cenario.promessaId,
      estudanteId: cenario.apoiador,
      resposta: 'sim' as const,
      agora: DENTRO,
    };
    await db.transaction((tx) => registrarRespostaConferencia(tx, comum));
    const r = await db.transaction((tx) => registrarRespostaConferencia(tx, comum));

    expect(r).toEqual({ registrada: true, alterouResposta: false });
  });

  it('a troca preserva a hora da primeira resposta', async () => {
    const comum = { promessaId: cenario.promessaId, estudanteId: cenario.apoiador };
    await db.transaction((tx) =>
      registrarRespostaConferencia(tx, { ...comum, resposta: 'sim', agora: DENTRO }),
    );
    const depois = new Date('2026-11-05T12:00:00.000Z');
    await db.transaction((tx) =>
      registrarRespostaConferencia(tx, { ...comum, resposta: 'nao', agora: depois }),
    );

    const linhas = await respostaGravada(cenario.promessaId, cenario.apoiador);
    expect(linhas[0]?.criadoEm).toEqual(DENTRO);
  });

  describe('janela da conferência', () => {
    it('recusa antes de abrir', async () => {
      const r = await db.transaction((tx) =>
        registrarRespostaConferencia(tx, {
          promessaId: cenario.promessaId,
          estudanteId: cenario.apoiador,
          resposta: 'sim',
          agora: new Date('2026-10-31T12:00:00.000Z'),
        }),
      );

      expect(r).toEqual({ registrada: false, motivo: 'conferencia_nao_abriu' });
    });

    it('recusa depois de fechar', async () => {
      const r = await db.transaction((tx) =>
        registrarRespostaConferencia(tx, {
          promessaId: cenario.promessaId,
          estudanteId: cenario.apoiador,
          resposta: 'sim',
          agora: new Date('2026-11-09T12:00:00.000Z'),
        }),
      );

      expect(r).toEqual({ registrada: false, motivo: 'conferencia_encerrada' });
    });

    it('aceita no instante exato da abertura', async () => {
      const r = await db.transaction((tx) =>
        registrarRespostaConferencia(tx, {
          promessaId: cenario.promessaId,
          estudanteId: cenario.apoiador,
          resposta: 'sim',
          agora: ABRE,
        }),
      );

      expect(r).toMatchObject({ registrada: true });
    });
  });

  it('recusa quando a promessa já foi apurada', async () => {
    // Resultado preenchido é promessa encerrada: aceitar resposta depois mudaria
    // a contagem que gerou um resultado já publicado.
    const apurada = await montarCenario({ resultado: 'conquistada' });

    const r = await db.transaction((tx) =>
      registrarRespostaConferencia(tx, {
        promessaId: apurada.promessaId,
        estudanteId: apurada.apoiador,
        resposta: 'nao',
        agora: DENTRO,
      }),
    );

    expect(r).toEqual({ registrada: false, motivo: 'conferencia_encerrada' });
  });

  it('recusa promessa que não existe', async () => {
    const r = await db.transaction((tx) =>
      registrarRespostaConferencia(tx, {
        promessaId: '00000000-0000-4000-8000-000000000000',
        estudanteId: cenario.apoiador,
        resposta: 'sim',
        agora: DENTRO,
      }),
    );

    expect(r).toEqual({ registrada: false, motivo: 'promessa_inexistente' });
  });
});
