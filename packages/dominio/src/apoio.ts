/**
 * Apoio a uma pauta e detecção da meta batida. É a função mais chamada do sistema: o "Apoiar" do
 * bot e do site passam por aqui.
 *
 * RN01: só estudante verificado (e que não saiu) apoia. RN02: um apoio por estudante por pauta.
 * RN05: bater a meta não bloqueia nada; grava `meta_batida_em`, emite o evento e avisa quem chamou,
 * mesmo com a pauta já em `cobrando`. RN12: o apoio conta na hora, só em pauta aprovada.
 */
import { apoios, eq, estudantes, pautas, sql, type StatusPauta, type Tx } from '@lumens/db';
import { registrarEvento } from './eventos';
import { transicionarStatus } from './status';

/** Pauta ainda não aprovada (ou recusada) não recebe apoio. */
const SEM_APOIO: ReadonlySet<StatusPauta> = new Set(['em_curadoria', 'recusada']);

export interface NovoApoio {
  pautaId: string;
  estudanteId: string;
  origem: 'bot' | 'site';
  agora?: Date;
}

export type ResultadoApoio =
  | {
      registrado: true;
      totalApoios: number;
      /** Este apoio bateu a meta: a parte 3 dispara o aviso coletivo (RF-B11). */
      metaBatidaAgora: boolean;
    }
  /** Segundo apoio do mesmo estudante: ignorado sem erro, a contagem não muda. */
  | { registrado: false; motivo: 'ja_apoiou'; totalApoios: number }
  | {
      registrado: false;
      motivo: 'pauta_inexistente' | 'pauta_sem_apoio' | 'estudante_nao_verificado';
    };

/** Registra o apoio na transação de quem chama. Recusas voltam como resultado, sem exceção. */
export async function registrarApoio(
  tx: Tx,
  { pautaId, estudanteId, origem, agora = new Date() }: NovoApoio,
): Promise<ResultadoApoio> {
  // FOR UPDATE na pauta enfileira apoios simultâneos da mesma pauta: cada um conta o total já com
  // o anterior gravado, e só um deles vê `meta_batida_em` nulo ao cruzar a meta.
  const [pauta] = await tx
    .select({ status: pautas.status, meta: pautas.meta, metaBatidaEm: pautas.metaBatidaEm })
    .from(pautas)
    .where(eq(pautas.id, pautaId))
    .for('update');

  if (pauta === undefined) return { registrado: false, motivo: 'pauta_inexistente' };
  if (SEM_APOIO.has(pauta.status)) return { registrado: false, motivo: 'pauta_sem_apoio' };

  const [estudante] = await tx
    .select({ verificadoEm: estudantes.verificadoEm, saiuEm: estudantes.saiuEm })
    .from(estudantes)
    .where(eq(estudantes.id, estudanteId));

  if (estudante?.verificadoEm == null || estudante.saiuEm !== null) {
    return { registrado: false, motivo: 'estudante_nao_verificado' };
  }

  const inseridos = await tx
    .insert(apoios)
    .values({ pautaId, estudanteId, origem, criadoEm: agora })
    .onConflictDoNothing()
    .returning({ pautaId: apoios.pautaId });

  const [contagem] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(apoios)
    .where(eq(apoios.pautaId, pautaId));
  const totalApoios = contagem?.total ?? 0;

  if (inseridos.length === 0) return { registrado: false, motivo: 'ja_apoiou', totalApoios };

  const metaBatidaAgora = pauta.metaBatidaEm === null && totalApoios >= pauta.meta;
  if (metaBatidaAgora) {
    await tx.update(pautas).set({ metaBatidaEm: agora }).where(eq(pautas.id, pautaId));
    // Apoio pelo site também chega como mensagem do bot; o evento só conhece bot/curadoria/agendador.
    await registrarEvento(tx, {
      pautaId,
      tipo: 'meta_batida',
      dados: { meta: pauta.meta, apoios: totalApoios },
      origem: 'bot',
    });
    // Só muda o status a partir de `juntando_apoios`: pauta já em `cobrando` segue cobrando (RN05).
    if (pauta.status === 'juntando_apoios') {
      await transicionarStatus(tx, { pautaId, para: 'meta_batida', origem: 'bot', agora });
    }
  }

  return { registrado: true, totalApoios, metaBatidaAgora };
}
