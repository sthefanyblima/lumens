import { jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Esquema Drizzle. Toda mudança aqui vira migração com `pnpm --filter @lumens/db generate`,
 * nunca SQL escrito à mão.
 *
 * Por enquanto só tem as tabelas de infraestrutura do bot (parte 2). As tabelas de negócio
 * entram na T4 (SCRUM-77).
 */

/**
 * Dedup de mensagens da Meta: a Meta reenvia o mesmo wamid, e ele só pode ser processado uma vez.
 * Guarda o HMAC do wamid, não o wamid: o wamid da Meta é base64 de uma estrutura que contém o
 * telefone do remetente. A limpeza diária apaga as linhas mais velhas que a janela de reenvio.
 */
export const processedMessages = pgTable('processed_message', {
  wamidHmac: text('wamid_hmac').primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stepEnum = pgEnum('conversation_step', [
  'GREETING',
  'MENU',
  'VERIFY_ASK_EMAIL',
  'VERIFY_ASK_CODE',
  'VERIFY_ASK_COURSE',
  'REPORT_ASK_TEXT',
  'REPORT_ASK_BLOCK',
  'REPORT_PICK_SIMILAR',
  'NEW_ASK_TITLE',
  'NEW_ASK_PLACE',
  'NEW_ASK_DESCRIPTION',
  'NEW_ASK_PHOTO',
]);

/** Passo da conversa por telefone (2.3). phoneHmac = HMAC do número, nunca o número puro. */
export const conversationState = pgTable('conversation_state', {
  phoneHmac: text('phone_hmac').primaryKey(),
  step: stepEnum('step').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
