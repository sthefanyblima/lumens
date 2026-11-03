/**
 * RF-B17 · Gravação da resposta da conferência.
 *
 * Porta de escrita de `resposta_conferencia`: valida quem pode responder, se a
 * conferência está aberta, e só então grava. Nenhum módulo deve inserir nessa
 * tabela por fora.
 *
 * Não registra evento na linha do tempo, de propósito. Uma pauta de meta máxima
 * tem 300 apoiadores, e um evento por resposta encheria a linha do tempo com
 * trezentas linhas que ninguém lê, empurrando para fora o que importa. O evento
 * da conferência é um só e nasce da apuração, quando o prazo fecha (3.7b).
 */
import { and, eq, type Tx } from '@lumens/db';
import { apoios, promessas, respostasConferencia } from '@lumens/db';
import type { RespostaConferencia } from './conferencia';

export interface RegistroDeResposta {
  promessaId: string;
  estudanteId: string;
  resposta: RespostaConferencia;
  /** Injetável para teste; o padrão é agora. */
  agora?: Date;
}

export type MotivoRecusa =
  'promessa_inexistente' | 'conferencia_nao_abriu' | 'conferencia_encerrada' | 'nao_apoiou';

export type ResultadoRegistro =
  { registrada: true; alterouResposta: boolean } | { registrada: false; motivo: MotivoRecusa };

/**
 * Grava a resposta de um apoiador à conferência de uma promessa.
 *
 * Só aceita de quem apoiou a pauta: a apuração mede a fração de apoiadores que
 * respondeu (RN10), e voto de quem não apoiou falsearia tanto o numerador
 * quanto o quórum.
 *
 * Responder de novo dentro do prazo troca a resposta em vez de criar outra
 * linha — a chave é (promessa, estudante), então mudar de ideia é mudar o voto,
 * não votar duas vezes. `criado_em` guarda a primeira vez que a pessoa
 * respondeu e não é mexido depois.
 *
 * Roda dentro da transação de quem chama: a resposta e o avanço da conversa do
 * bot confirmam ou desfazem juntos.
 */
export async function registrarRespostaConferencia(
  tx: Tx,
  { promessaId, estudanteId, resposta, agora = new Date() }: RegistroDeResposta,
): Promise<ResultadoRegistro> {
  const [promessa] = await tx
    .select({
      pautaId: promessas.pautaId,
      abreEm: promessas.conferenciaAbreEm,
      fechaEm: promessas.conferenciaFechaEm,
      resultado: promessas.resultado,
    })
    .from(promessas)
    .where(eq(promessas.id, promessaId))
    .limit(1);

  if (promessa === undefined) return { registrada: false, motivo: 'promessa_inexistente' };

  // Resultado preenchido significa promessa encerrada: a apuração já rodou e
  // aceitar resposta depois mudaria a contagem que gerou um resultado público.
  if (promessa.resultado !== null || agora > promessa.fechaEm) {
    return { registrada: false, motivo: 'conferencia_encerrada' };
  }
  if (agora < promessa.abreEm) return { registrada: false, motivo: 'conferencia_nao_abriu' };

  const [apoio] = await tx
    .select({ estudanteId: apoios.estudanteId })
    .from(apoios)
    .where(and(eq(apoios.pautaId, promessa.pautaId), eq(apoios.estudanteId, estudanteId)))
    .limit(1);

  if (apoio === undefined) return { registrada: false, motivo: 'nao_apoiou' };

  const [anterior] = await tx
    .select({ resposta: respostasConferencia.resposta })
    .from(respostasConferencia)
    .where(
      and(
        eq(respostasConferencia.promessaId, promessaId),
        eq(respostasConferencia.estudanteId, estudanteId),
      ),
    )
    .limit(1);

  await tx
    .insert(respostasConferencia)
    .values({ promessaId, estudanteId, resposta, criadoEm: agora })
    .onConflictDoUpdate({
      target: [respostasConferencia.promessaId, respostasConferencia.estudanteId],
      set: { resposta },
    });

  return {
    registrada: true,
    alterouResposta: anterior !== undefined && anterior.resposta !== resposta,
  };
}
