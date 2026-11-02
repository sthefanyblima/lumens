/**
 * RNF06 · Fila persistida dos avisos que o bot inicia (SCRUM-202).
 *
 * Porta de escrita da tabela `disparo`. A política — quem sai agora, quem
 * espera — continua em `envio.ts`; aqui ela ganha memória: o que já saiu, quem
 * já foi alcançado nas últimas 24h e quem recebeu de fato.
 *
 * O ciclo de quem envia é:
 *
 *   1. `reservarLote` numa transação curta: escolhe o lote e marca a reserva.
 *   2. Para cada disparo, chama a Meta fora da transação.
 *   3. `registrarEnvio` quando a Meta aceita, ou `registrarFalha` quando ela
 *      recusa de vez. Erro passageiro (rede, 5xx) não registra nada: a reserva
 *      vence e o disparo volta sozinho.
 *   4. `registrarEntrega` quando o webhook confirma a entrega.
 *
 * Se o processo cai entre 1 e 3, a reserva vence em `RESERVA_EXPIRA_MS` e o
 * disparo volta ao próximo lote. Isso pode reenviar quem a Meta já tinha
 * aceitado no instante da queda — e é de propósito: aviso repetido incomoda,
 * mas conferência que não chegou tira o voto de alguém (RN10).
 */
import { and, disparos, eq, gt, inArray, isNull, lt, or, sql, type Tx } from '@lumens/db';
import { planejarEnvio, type Disparo, type TipoDisparo } from './envio';

/** Quanto tempo uma reserva segura o disparo antes de ele voltar para a fila. */
export const RESERVA_EXPIRA_MS = 10 * 60_000;

/** A janela móvel em que a Meta conta pessoas distintas. */
const JANELA_META_MS = 24 * 60 * 60_000;

/**
 * Chave do lock que serializa quem monta lote. Sem ele, dois processos lendo a
 * fila ao mesmo tempo veriam o mesmo limite livre e, juntos, passariam dele.
 */
const LOCK_DA_FILA = 202;

export interface NovoAviso {
  tipo: TipoDisparo;
  /** Id do que o aviso comunica: pauta, promessa ou caminho. */
  aviso: string;
  estudanteId: string;
  /** Nome da mensagem modelo aprovada pela Meta. */
  modelo: string;
  /** Valores das variáveis do modelo, na ordem. Só dado público da pauta. */
  parametros: readonly string[];
}

export interface DisparoReservado {
  id: string;
  tipo: TipoDisparo;
  aviso: string;
  estudanteId: string;
  modelo: string;
  parametros: string[];
}

/**
 * Põe avisos na fila. Devolve quantos entraram de fato.
 *
 * O mesmo aviso para a mesma pessoa entra uma vez só, mesmo que a rotina rode
 * de novo ou que duas rotinas enfileirem juntas: quem garante é o índice único
 * do banco, não uma leitura antes da escrita. Isso vale também para aviso que
 * já saiu ou falhou — enfileirar de novo não reenvia.
 */
export async function enfileirarDisparos(
  tx: Tx,
  avisos: readonly NovoAviso[],
  agora: Date = new Date(),
): Promise<number> {
  if (avisos.length === 0) return 0;

  const inseridos = await tx
    .insert(disparos)
    .values(
      avisos.map((a) => ({
        tipo: a.tipo,
        aviso: a.aviso,
        estudanteId: a.estudanteId,
        modelo: a.modelo,
        parametros: [...a.parametros],
        enfileiradoEm: agora,
      })),
    )
    .onConflictDoNothing({ target: [disparos.tipo, disparos.aviso, disparos.estudanteId] })
    .returning({ id: disparos.id });

  return inseridos.length;
}

export interface ParametrosDeLote {
  /** Pessoas distintas por 24h móveis que a Meta permite hoje ao portfólio. */
  limite: number;
  /** Injetável para teste; o padrão é agora. */
  agora?: Date;
}

/**
 * Escolhe o próximo lote e o reserva. Devolve os disparos já na ordem de envio.
 *
 * Quem já foi alcançado nas últimas 24h é quem tem reserva nesse período. A
 * reserva conta, e não só o envio confirmado, porque é a reserva que impede o
 * próximo lote de prometer a mesma vaga. O erro, quando há, é para o lado
 * seguro: uma reserva que falhou ainda ocupa a vaga até as 24h passarem.
 *
 * Precisa rodar dentro de uma transação: o lock é liberado no commit.
 */
export async function reservarLote(
  tx: Tx,
  { limite, agora = new Date() }: ParametrosDeLote,
): Promise<DisparoReservado[]> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_DA_FILA})`);

  const inicioDaJanela = new Date(agora.getTime() - JANELA_META_MS);
  const reservaVencida = new Date(agora.getTime() - RESERVA_EXPIRA_MS);

  const alcancados = await tx
    .selectDistinct({ estudanteId: disparos.estudanteId })
    .from(disparos)
    .where(gt(disparos.reservadoEm, inicioDaJanela));

  const pendentes = await tx
    .select({
      id: disparos.id,
      tipo: disparos.tipo,
      aviso: disparos.aviso,
      estudanteId: disparos.estudanteId,
      modelo: disparos.modelo,
      parametros: disparos.parametros,
      enfileiradoEm: disparos.enfileiradoEm,
    })
    .from(disparos)
    .where(
      and(
        isNull(disparos.enviadoEm),
        isNull(disparos.falhouEm),
        or(isNull(disparos.reservadoEm), lt(disparos.reservadoEm, reservaVencida)),
      ),
    );

  const porId = new Map(pendentes.map((p) => [p.id, p]));
  const plano = planejarEnvio({
    pendentes: pendentes.map((p): Disparo => ({
      id: p.id,
      tipo: p.tipo,
      aviso: p.aviso,
      destinatario: p.estudanteId,
      enfileiradoEm: p.enfileiradoEm,
    })),
    limite,
    alcancados: new Set(alcancados.map((a) => a.estudanteId)),
  });

  const ids = plano.enviarAgora.map((d) => d.id);
  if (ids.length === 0) return [];

  await tx.update(disparos).set({ reservadoEm: agora }).where(inArray(disparos.id, ids));

  return ids.map((id) => {
    const linha = porId.get(id);
    if (linha === undefined) throw new Error(`disparo ${id} sumiu do lote`);
    return {
      id: linha.id,
      tipo: linha.tipo,
      aviso: linha.aviso,
      estudanteId: linha.estudanteId,
      modelo: linha.modelo,
      parametros: linha.parametros,
    };
  });
}

/**
 * A Meta aceitou o envio. Devolve `false` se o disparo já estava registrado
 * como enviado — chamar de novo não troca o wamid nem o instante.
 */
export async function registrarEnvio(
  tx: Tx,
  { id, wamidHmac, agora = new Date() }: { id: string; wamidHmac: string; agora?: Date },
): Promise<boolean> {
  const atualizados = await tx
    .update(disparos)
    .set({ enviadoEm: agora, wamidHmac })
    .where(and(eq(disparos.id, id), isNull(disparos.enviadoEm)))
    .returning({ id: disparos.id });
  return atualizados.length > 0;
}

/**
 * O webhook confirmou a entrega (status `delivered` ou `read`). É o registro
 * que a curadoria usa como prova de que a pessoa foi avisada.
 *
 * Devolve `false` quando não há disparo com esse wamid ainda sem entrega. O
 * status da Meta pode chegar antes de `registrarEnvio` confirmar; quem chama
 * deve tentar de novo mais tarde em vez de descartar.
 */
export async function registrarEntrega(
  tx: Tx,
  { wamidHmac, agora = new Date() }: { wamidHmac: string; agora?: Date },
): Promise<boolean> {
  const atualizados = await tx
    .update(disparos)
    .set({ entregueEm: agora })
    .where(and(eq(disparos.wamidHmac, wamidHmac), isNull(disparos.entregueEm)))
    .returning({ id: disparos.id });
  return atualizados.length > 0;
}

/**
 * A Meta recusou de vez (número sem WhatsApp, modelo pausado, pessoa bloqueou).
 * O disparo sai da fila e fica registrado com o motivo. Erro passageiro não
 * deve chegar aqui: deixe a reserva vencer.
 */
export async function registrarFalha(
  tx: Tx,
  { id, motivo, agora = new Date() }: { id: string; motivo: string; agora?: Date },
): Promise<boolean> {
  const atualizados = await tx
    .update(disparos)
    .set({ falhouEm: agora, falha: motivo })
    .where(and(eq(disparos.id, id), isNull(disparos.enviadoEm), isNull(disparos.falhouEm)))
    .returning({ id: disparos.id });
  return atualizados.length > 0;
}
