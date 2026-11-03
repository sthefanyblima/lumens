import { sql, type Tx } from '@lumens/db';
import { fromDrizzle, type PgBoss } from 'pg-boss';

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
   *
   * Amarrado à tentativa (`retryCount`): se o job expirou e foi pego de novo enquanto esta
   * transação rodava, ele não é mais desta tentativa, `complete` lança e a transação desfaz —
   * quem pegou a tentativa nova aplica a mensagem, uma vez só.
   */
  complete(name: string, job: JobAttempt, tx: Tx): Promise<void>;
}

export interface SendOptions {
  /**
   * Chave de ordem (o `phoneHmac` da conversa). Numa fila `key_strict_fifo`, o pg-boss só
   * entrega o job mais antigo de cada chave, e só depois que o anterior terminou — em qualquer
   * instância do servidor.
   */
  chave?: string;
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
  unblockConversations: 'unblock-conversations',
} as const;

/**
 * A fila de verdade: pg-boss gravando pela transação do Drizzle (`fromDrizzle`), para que job e
 * efeito confirmem ou desfaçam juntos.
 */
export function filaPgBoss(boss: Pick<PgBoss, 'send' | 'complete'>): JobQueue {
  // O Tx é genérico no driver (PGlite nos testes), então o tipo do `execute` não sabe que
  // devolve `{ rows }`. Com o pg-boss o driver é sempre o node-postgres, que devolve.
  const naTransacao = (tx: Tx) => ({
    db: fromDrizzle(tx as unknown as Parameters<typeof fromDrizzle>[0], sql),
  });
  return {
    send: (name, data, tx, options) =>
      boss.send(name, data, {
        ...naTransacao(tx),
        ...(options?.chave ? { singletonKey: options.chave } : {}),
      }),
    complete: async (name, job, tx) => {
      // O tipo declara CommandResponse vazio, mas o pg-boss devolve `{ jobs, requested, affected }`
      // (mapCommandResponse); com a tentativa no argumento, `affected` é 0 se ela não vale mais.
      const resposta = (await boss.complete(name, job, null, naTransacao(tx))) as {
        affected?: number;
      };
      if (resposta.affected !== 1) throw new StaleJobError();
    },
  };
}
