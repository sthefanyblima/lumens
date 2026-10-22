/** Abstração mínima da fila (pg-boss em produção, fake nos testes). */
export interface JobQueue {
  send(name: string, data: object): Promise<string | null>;
}

export const JOBS = {
  incomingMessage: 'incoming-message',
  cleanupConversations: 'cleanup-expired-conversations',
} as const;
