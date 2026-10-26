import { and, conversas, eq, gt, lt, sql, type Db } from '@lumens/db';
import { isStep, type Step } from './steps';

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

/** Persistência do passo de cada conversa (tabela conversa). */
export class ConversationStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** O mesmo store, com o mesmo relógio, gravando por outra conexão (ex.: uma transação). */
  withDb(db: Db): ConversationStore {
    return new ConversationStore(db, this.now);
  }

  /**
   * Serializa, até o fim da transação, quem mexe na conversa deste telefone. Sem isso, duas
   * mensagens do mesmo número processadas ao mesmo tempo (duas instâncias, ou um job expirado
   * e reentregue ainda rodando) leriam o mesmo passo e a última gravação apagaria a outra.
   * Advisory lock e não `FOR UPDATE`: a primeira mensagem ainda não tem linha para travar.
   * Só tem efeito dentro de uma transação.
   */
  async lock(phoneHmac: string): Promise<void> {
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${phoneHmac}, 0))`);
  }

  /** Estado atual; expirado (expiraEm <= agora) ou com passo desconhecido é tratado como ausente. */
  async get(phoneHmac: string): Promise<ConversationState | null> {
    const rows = await this.db
      .select()
      .from(conversas)
      .where(and(eq(conversas.telefoneHmac, phoneHmac), gt(conversas.expiraEm, this.now())))
      .limit(1);
    const row = rows[0];
    if (!row || !isStep(row.passo)) return null;
    return {
      phoneHmac: row.telefoneHmac,
      step: row.passo,
      data: row.dados,
      expiresAt: row.expiraEm,
      updatedAt: row.atualizadoEm,
    };
  }

  /** Upsert do estado; renova expiresAt = agora + 24h e updatedAt = agora. */
  async save(phoneHmac: string, step: Step, data: ConversationData): Promise<ConversationState> {
    const now = this.now();
    const expiresAt = new Date(now.getTime() + CONVERSATION_TTL_MS);
    await this.db
      .insert(conversas)
      .values({
        telefoneHmac: phoneHmac,
        passo: step,
        dados: data,
        expiraEm: expiresAt,
        atualizadoEm: now,
      })
      .onConflictDoUpdate({
        target: conversas.telefoneHmac,
        set: { passo: step, dados: data, expiraEm: expiresAt, atualizadoEm: now },
      });
    return { phoneHmac, step, data, expiresAt, updatedAt: now };
  }

  async delete(phoneHmac: string): Promise<void> {
    await this.db.delete(conversas).where(eq(conversas.telefoneHmac, phoneHmac));
  }

  /** Apaga estados expirados; retorna quantos foram removidos. */
  async deleteExpired(now: Date = this.now()): Promise<number> {
    const rows = await this.db
      .delete(conversas)
      .where(lt(conversas.expiraEm, now))
      .returning({ phoneHmac: conversas.telefoneHmac });
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
