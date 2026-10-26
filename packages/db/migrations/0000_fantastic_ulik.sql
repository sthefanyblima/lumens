CREATE TYPE "public"."moderacao_relato" AS ENUM('pendente', 'aprovado', 'recusado');--> statement-breakpoint
CREATE TYPE "public"."origem_apoio" AS ENUM('bot', 'site');--> statement-breakpoint
CREATE TYPE "public"."origem_evento" AS ENUM('bot', 'curadoria', 'agendador');--> statement-breakpoint
CREATE TYPE "public"."papel_na_pauta" AS ENUM('owner', 'co_owner');--> statement-breakpoint
CREATE TYPE "public"."resposta_conferencia_valor" AS ENUM('sim', 'em_parte', 'nao');--> statement-breakpoint
CREATE TYPE "public"."status_pauta" AS ENUM('em_curadoria', 'recusada', 'juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada');--> statement-breakpoint
CREATE TYPE "public"."status_proposta" AS ENUM('aberta', 'executada');--> statement-breakpoint
CREATE TYPE "public"."tipo_caminho" AS ENUM('falabr', 'comunidade', 'representante');--> statement-breakpoint
CREATE TABLE "apoio" (
	"pauta_id" uuid NOT NULL,
	"estudante_id" uuid NOT NULL,
	"origem" "origem_apoio" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apoio_pauta_id_estudante_id_pk" PRIMARY KEY("pauta_id","estudante_id")
);
--> statement-breakpoint
CREATE TABLE "bloco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"base_estudantes" integer NOT NULL,
	CONSTRAINT "bloco_slug_unique" UNIQUE("slug"),
	CONSTRAINT "bloco_base_estudantes_nao_negativa" CHECK ("bloco"."base_estudantes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "caminho" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pauta_id" uuid NOT NULL,
	"tipo" "tipo_caminho" NOT NULL,
	"status" text NOT NULL,
	"protocolo" text,
	"prazo" date,
	"aberto_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codigo_verificacao" (
	"telefone_hmac" text PRIMARY KEY NOT NULL,
	"codigo_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "codigo_verificacao_tentativas_nao_negativas" CHECK ("codigo_verificacao"."tentativas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "conversa" (
	"telefone_hmac" text PRIMARY KEY NOT NULL,
	"passo" text NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hmac" text NOT NULL,
	"email_cifrado" text NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "curador_email_hmac_unique" UNIQUE("email_hmac")
);
--> statement-breakpoint
CREATE TABLE "estudante" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telefone_hmac" text NOT NULL,
	"telefone_cifrado" text NOT NULL,
	"email_hmac" text,
	"email_cifrado" text,
	"curso" text,
	"verificado_em" timestamp with time zone,
	"saiu_em" timestamp with time zone,
	CONSTRAINT "estudante_telefone_hmac_unique" UNIQUE("telefone_hmac"),
	CONSTRAINT "estudante_email_hmac_unique" UNIQUE("email_hmac")
);
--> statement-breakpoint
CREATE TABLE "evento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pauta_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origem" "origem_evento" NOT NULL,
	"publico" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagem_processada" (
	"wamid" text PRIMARY KEY NOT NULL,
	"recebida_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papel_pauta" (
	"pauta_id" uuid NOT NULL,
	"estudante_id" uuid NOT NULL,
	"papel" "papel_na_pauta" NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"ate" timestamp with time zone,
	"ultima_atividade_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "papel_pauta_pauta_id_estudante_id_desde_pk" PRIMARY KEY("pauta_id","estudante_id","desde")
);
--> statement-breakpoint
CREATE TABLE "pauta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text NOT NULL,
	"bloco_id" uuid,
	"categoria" text NOT NULL,
	"status" "status_pauta" DEFAULT 'em_curadoria' NOT NULL,
	"meta" integer NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aprovada_em" timestamp with time zone,
	"meta_batida_em" timestamp with time zone,
	"motivo_recusa" text,
	"busca" "tsvector" GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig, "titulo" || ' ' || "descricao")) STORED NOT NULL,
	CONSTRAINT "pauta_slug_unique" UNIQUE("slug"),
	CONSTRAINT "pauta_meta_positiva" CHECK ("pauta"."meta" > 0)
);
--> statement-breakpoint
CREATE TABLE "promessa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pauta_id" uuid NOT NULL,
	"resumo" text NOT NULL,
	"data_entrega" date NOT NULL,
	"fonte" text NOT NULL,
	"registrada_por" uuid NOT NULL,
	"conferencia_abre_em" timestamp with time zone NOT NULL,
	"conferencia_fecha_em" timestamp with time zone NOT NULL,
	"resultado" text
);
--> statement-breakpoint
CREATE TABLE "proposta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pauta_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"pessoas_necessarias" integer NOT NULL,
	"status" "status_proposta" DEFAULT 'aberta' NOT NULL,
	"executada_em" timestamp with time zone,
	CONSTRAINT "proposta_pessoas_necessarias_positivas" CHECK ("proposta"."pessoas_necessarias" > 0)
);
--> statement-breakpoint
CREATE TABLE "relato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pauta_id" uuid NOT NULL,
	"estudante_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"foto_chave" text,
	"moderacao" "moderacao_relato" DEFAULT 'pendente' NOT NULL,
	"moderado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resposta_conferencia" (
	"promessa_id" uuid NOT NULL,
	"estudante_id" uuid NOT NULL,
	"resposta" "resposta_conferencia_valor" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resposta_conferencia_promessa_id_estudante_id_pk" PRIMARY KEY("promessa_id","estudante_id")
);
--> statement-breakpoint
CREATE TABLE "voluntario" (
	"proposta_id" uuid NOT NULL,
	"estudante_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voluntario_proposta_id_estudante_id_pk" PRIMARY KEY("proposta_id","estudante_id")
);
--> statement-breakpoint
ALTER TABLE "apoio" ADD CONSTRAINT "apoio_pauta_id_pauta_id_fk" FOREIGN KEY ("pauta_id") REFERENCES "public"."pauta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apoio" ADD CONSTRAINT "apoio_estudante_id_estudante_id_fk" FOREIGN KEY ("estudante_id") REFERENCES "public"."estudante"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caminho" ADD CONSTRAINT "caminho_pauta_id_pauta_id_fk" FOREIGN KEY ("pauta_id") REFERENCES "public"."pauta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento" ADD CONSTRAINT "evento_pauta_id_pauta_id_fk" FOREIGN KEY ("pauta_id") REFERENCES "public"."pauta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papel_pauta" ADD CONSTRAINT "papel_pauta_pauta_id_pauta_id_fk" FOREIGN KEY ("pauta_id") REFERENCES "public"."pauta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papel_pauta" ADD CONSTRAINT "papel_pauta_estudante_id_estudante_id_fk" FOREIGN KEY ("estudante_id") REFERENCES "public"."estudante"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pauta" ADD CONSTRAINT "pauta_bloco_id_bloco_id_fk" FOREIGN KEY ("bloco_id") REFERENCES "public"."bloco"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promessa" ADD CONSTRAINT "promessa_pauta_id_pauta_id_fk" FOREIGN KEY ("pauta_id") REFERENCES "public"."pauta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promessa" ADD CONSTRAINT "promessa_registrada_por_curador_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."curador"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposta" ADD CONSTRAINT "proposta_pauta_id_pauta_id_fk" FOREIGN KEY ("pauta_id") REFERENCES "public"."pauta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relato" ADD CONSTRAINT "relato_pauta_id_pauta_id_fk" FOREIGN KEY ("pauta_id") REFERENCES "public"."pauta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relato" ADD CONSTRAINT "relato_estudante_id_estudante_id_fk" FOREIGN KEY ("estudante_id") REFERENCES "public"."estudante"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_conferencia" ADD CONSTRAINT "resposta_conferencia_promessa_id_promessa_id_fk" FOREIGN KEY ("promessa_id") REFERENCES "public"."promessa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_conferencia" ADD CONSTRAINT "resposta_conferencia_estudante_id_estudante_id_fk" FOREIGN KEY ("estudante_id") REFERENCES "public"."estudante"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voluntario" ADD CONSTRAINT "voluntario_proposta_id_proposta_id_fk" FOREIGN KEY ("proposta_id") REFERENCES "public"."proposta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voluntario" ADD CONSTRAINT "voluntario_estudante_id_estudante_id_fk" FOREIGN KEY ("estudante_id") REFERENCES "public"."estudante"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apoio_estudante_id_idx" ON "apoio" USING btree ("estudante_id");--> statement-breakpoint
CREATE INDEX "caminho_pauta_id_idx" ON "caminho" USING btree ("pauta_id");--> statement-breakpoint
CREATE INDEX "evento_pauta_criado_em_idx" ON "evento" USING btree ("pauta_id","criado_em");--> statement-breakpoint
CREATE INDEX "papel_pauta_estudante_id_idx" ON "papel_pauta" USING btree ("estudante_id");--> statement-breakpoint
CREATE INDEX "pauta_bloco_id_idx" ON "pauta" USING btree ("bloco_id");--> statement-breakpoint
CREATE INDEX "pauta_status_idx" ON "pauta" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pauta_busca_idx" ON "pauta" USING gin ("busca");--> statement-breakpoint
CREATE INDEX "promessa_pauta_id_idx" ON "promessa" USING btree ("pauta_id");--> statement-breakpoint
CREATE INDEX "promessa_registrada_por_idx" ON "promessa" USING btree ("registrada_por");--> statement-breakpoint
CREATE UNIQUE INDEX "promessa_ativa_por_pauta_unique" ON "promessa" USING btree ("pauta_id") WHERE "promessa"."resultado" IS NULL;--> statement-breakpoint
CREATE INDEX "proposta_pauta_id_idx" ON "proposta" USING btree ("pauta_id");--> statement-breakpoint
CREATE INDEX "relato_pauta_id_idx" ON "relato" USING btree ("pauta_id");--> statement-breakpoint
CREATE INDEX "relato_estudante_id_idx" ON "relato" USING btree ("estudante_id");--> statement-breakpoint
CREATE INDEX "resposta_conferencia_estudante_id_idx" ON "resposta_conferencia" USING btree ("estudante_id");--> statement-breakpoint
CREATE INDEX "voluntario_estudante_id_idx" ON "voluntario" USING btree ("estudante_id");