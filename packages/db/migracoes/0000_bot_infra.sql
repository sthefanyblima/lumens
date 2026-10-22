CREATE TYPE "public"."conversation_step" AS ENUM('GREETING', 'MENU', 'VERIFY_ASK_EMAIL', 'VERIFY_ASK_CODE', 'VERIFY_ASK_COURSE', 'REPORT_ASK_TEXT', 'REPORT_ASK_BLOCK', 'REPORT_PICK_SIMILAR', 'NEW_ASK_TITLE', 'NEW_ASK_PLACE', 'NEW_ASK_DESCRIPTION', 'NEW_ASK_PHOTO');--> statement-breakpoint
CREATE TABLE "conversation_state" (
	"phone_hmac" text PRIMARY KEY NOT NULL,
	"step" "conversation_step" NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_message" (
	"wamid" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
