ALTER TABLE "conversa" ADD COLUMN "expira_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "conversa_expira_em_idx" ON "conversa" USING btree ("expira_em");--> statement-breakpoint
-- O wamid em claro codifica o telefone e não vira HMAC sem a chave: a janela de dedup é curta,
-- então as linhas antigas são descartadas em vez de convertidas.
DELETE FROM "mensagem_processada";--> statement-breakpoint
ALTER TABLE "mensagem_processada" DROP COLUMN "wamid";--> statement-breakpoint
ALTER TABLE "mensagem_processada" ADD COLUMN "wamid_hmac" text PRIMARY KEY NOT NULL;
