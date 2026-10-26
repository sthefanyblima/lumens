import type { Tx } from '@lumens/db';

/**
 * Abstração mínima da fila (pg-boss em produção, fake nos testes). As duas operações rodam
 * DENTRO de uma transação `tx`: só valem se ela confirmar.
 */
export interface JobQueue {
  /** Enfileira. Amarra o job ao que mais a transação gravar (dedup do webhook, estado da conversa). */
  send(name: string, data: object, tx: Tx, options?: SendOptions): Promise<string | null>;
  /**
   * Conclui um job que está sendo processado. Feito na mesma transação do efeito do job, um
   * crash nunca deixa o efeito gravado com o job ainda pendente — o que faria o pg-boss
   * entregar o job de novo e aplicá-lo duas vezes.
   */
  complete(name: string, id: string, tx: Tx): Promise<void>;
}

export interface SendOptions {
  /**
   * Grupo do job (o `phoneHmac` da conversa). Com o `groupConcurrency: 1` dos workers, dois jobs
   * do mesmo grupo nunca rodam ao mesmo tempo, nem em instâncias diferentes.
   */
  group?: string;
}

export const JOBS = {
  incomingMessage: 'incoming-message',
  incomingMessageDead: 'incoming-message-dead',
  outgoingReplies: 'outgoing-replies',
  outgoingRepliesDead: 'outgoing-replies-dead',
  cleanupConversations: 'cleanup-expired-conversations',
} as const;
