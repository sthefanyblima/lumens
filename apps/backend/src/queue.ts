import type { Tx } from '@lumens/db';

/**
 * Abstração mínima da fila (pg-boss em produção, fake nos testes). As duas operações rodam
 * DENTRO de uma transação `tx`: só valem se ela confirmar.
 */
export interface JobQueue {
  /** Enfileira. Amarra o job ao que mais a transação gravar (dedup do webhook, estado da conversa). */
  send(name: string, data: object, tx: Tx): Promise<string | null>;
  /**
   * Conclui um job que está sendo processado. Feito na mesma transação do efeito do job, um
   * crash nunca deixa o efeito gravado com o job ainda pendente — o que faria o pg-boss
   * entregar o job de novo e aplicá-lo duas vezes.
   *
   * Amarrado à tentativa (`retryCount`): se o job expirou e foi pego de novo enquanto esta
   * transação rodava, ele não é mais desta tentativa, `complete` lança e a transação desfaz —
   * quem pegou a tentativa nova aplica a mensagem, uma vez só.
   */
  complete(name: string, job: JobAttempt, tx: Tx): Promise<void>;
}

/** Um job como o worker o recebeu: o id e a tentativa em que foi pego. */
export interface JobAttempt {
  id: string;
  retryCount: number;
}

export class StaleJobError extends Error {
  constructor() {
    super('O job não está mais nesta tentativa (expirou e foi pego de novo).');
    this.name = 'StaleJobError';
  }
}

export const JOBS = {
  incomingMessage: 'incoming-message',
  incomingMessageDead: 'incoming-message-dead',
  outgoingReplies: 'outgoing-replies',
  outgoingRepliesDead: 'outgoing-replies-dead',
  cleanupConversations: 'cleanup-expired-conversations',
} as const;
