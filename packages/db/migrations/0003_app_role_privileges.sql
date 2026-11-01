GRANT USAGE ON SCHEMA "public" TO "lumens_app";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "lumens_app";
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA "public" TO "lumens_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "lumens_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
GRANT USAGE ON SEQUENCES TO "lumens_app";
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "evento" FROM "lumens_app";
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "evento" FROM PUBLIC;
