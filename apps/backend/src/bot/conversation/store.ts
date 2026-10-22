import { and, conversationState, eq, gt, lt, type Db } from '@lumens/db';
import type { Step } from './steps';

export const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingCommand {
  kind: 'apoiar' | 'ajudar' | 'nova-pauta';
  id?: string;
}

export interface ConversationData extends Record<string, unknown> {
  pendingCommand?: PendingCommand;
}

export interface ConversationState {
  phoneHmac: string;
  step: Step;
  data: ConversationData;
  expiresAt: Date;
  updatedAt: Date;
}

/** Persistência do passo de cada conversa (tabela conversation_state). */
export class ConversationStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** O mesmo store, com o mesmo relógio, gravando por outra conexão (ex.: uma transação). */
  withDb(db: Db): ConversationStore {
    return new ConversationStore(db, this.now);
  }

  /** Estado atual; expirado (expiresAt <= agora) é tratado como ausente. */
  async get(phoneHmac: string): Promise<ConversationState | null> {
    const rows = await this.db
      .select()
      .from(conversationState)
      .where(
        and(
          eq(conversationState.phoneHmac, phoneHmac),
          gt(conversationState.expiresAt, this.now()),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return row;
  }

  /** Upsert do estado; renova expiresAt = agora + 24h e updatedAt = agora. */
  async save(phoneHmac: string, step: Step, data: ConversationData): Promise<ConversationState> {
    const now = this.now();
    const expiresAt = new Date(now.getTime() + CONVERSATION_TTL_MS);
    await this.db
      .insert(conversationState)
      .values({ phoneHmac, step, data, expiresAt, updatedAt: now })
      .onConflictDoUpdate({
        target: conversationState.phoneHmac,
        set: { step, data, expiresAt, updatedAt: now },
      });
    return { phoneHmac, step, data, expiresAt, updatedAt: now };
  }

  async delete(phoneHmac: string): Promise<void> {
    await this.db.delete(conversationState).where(eq(conversationState.phoneHmac, phoneHmac));
  }

  /** Apaga estados expirados; retorna quantos foram removidos. */
  async deleteExpired(now: Date = this.now()): Promise<number> {
    const rows = await this.db
      .delete(conversationState)
      .where(lt(conversationState.expiresAt, now))
      .returning({ phoneHmac: conversationState.phoneHmac });
    return rows.length;
  }

  /** Guarda um comando pendente (ex.: link "apoiar <id>") para depois do fluxo atual. */
  async setPendingCommand(phoneHmac: string, cmd: PendingCommand): Promise<void> {
    const current = await this.get(phoneHmac);
    const step: Step = current?.step ?? 'GREETING';
    await this.save(phoneHmac, step, { ...(current?.data ?? {}), pendingCommand: cmd });
  }

  /** Lê e limpa o comando pendente. */
  async takePendingCommand(phoneHmac: string): Promise<PendingCommand | null> {
    const current = await this.get(phoneHmac);
    const cmd = current?.data.pendingCommand;
    if (!current || !cmd) return null;
    const { pendingCommand: _drop, ...rest } = current.data;
    await this.save(phoneHmac, current.step, rest);
    return cmd;
  }
}
