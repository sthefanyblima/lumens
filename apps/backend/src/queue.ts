import type { Tx } from '@lumens/db';

/** Abstração mínima da fila (pg-boss em produção, fake nos testes). */
export interface JobQueue {
  /**
   * Enfileira DENTRO da transação `tx`: o job só existe se a transação confirmar. É o que
   * amarra o dedup do webhook ao enqueue — um sem o outro perde mensagem.
   */
  send(name: string, data: object, tx: Tx): Promise<string | null>;
}

export const JOBS = {
  incomingMessage: 'incoming-message',
  cleanupConversations: 'cleanup-expired-conversations',
} as const;
