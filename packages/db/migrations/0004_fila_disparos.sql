CREATE TYPE "public"."tipo_disparo" AS ENUM('conferencia', 'resposta_oficial', 'meta_batida', 'lembrete');--> statement-breakpoint
CREATE TABLE "disparo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_disparo" NOT NULL,
	"aviso" text NOT NULL,
	"estudante_id" uuid NOT NULL,
	"modelo" text NOT NULL,
	"parametros" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enfileirado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"reservado_em" timestamp with time zone,
	"enviado_em" timestamp with time zone,
	"wamid_hmac" text,
	"entregue_em" timestamp with time zone,
	"falhou_em" timestamp with time zone,
	"falha" text
);
--> statement-breakpoint
ALTER TABLE "disparo" ADD CONSTRAINT "disparo_estudante_id_estudante_id_fk" FOREIGN KEY ("estudante_id") REFERENCES "public"."estudante"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "disparo_aviso_unique" ON "disparo" USING btree ("tipo","aviso","estudante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disparo_wamid_hmac_unique" ON "disparo" USING btree ("wamid_hmac");--> statement-breakpoint
CREATE INDEX "disparo_estudante_id_idx" ON "disparo" USING btree ("estudante_id");--> statement-breakpoint
CREATE INDEX "disparo_pendente_idx" ON "disparo" USING btree ("enfileirado_em") WHERE "disparo"."enviado_em" IS NULL AND "disparo"."falhou_em" IS NULL;--> statement-breakpoint
CREATE INDEX "disparo_reservado_em_idx" ON "disparo" USING btree ("reservado_em");