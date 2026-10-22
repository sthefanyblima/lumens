import type { PgBoss } from 'pg-boss';
import type { ConversationStore } from '../bot/conversation/store';
import { JOBS } from '../queue';

export const CLEANUP_CRON = '0 4 * * *';
export const CLEANUP_TZ = 'America/Maceio';

type Boss = Pick<PgBoss, 'getQueue' | 'createQueue' | 'schedule' | 'work'>;

/** Agenda a limpeza diária das conversas expiradas do bot (04:00 em Maceió). */
export async function registerCleanupJob(
  boss: Boss,
  store: ConversationStore,
  onDone?: (deleted: number) => void,
): Promise<void> {
  const name = JOBS.cleanupConversations;
  if (!(await boss.getQueue(name))) await boss.createQueue(name);
  await boss.schedule(name, CLEANUP_CRON, null, { tz: CLEANUP_TZ });
  await boss.work(name, async () => {
    const deleted = await store.deleteExpired();
    onDone?.(deleted);
    return { deleted };
  });
}
