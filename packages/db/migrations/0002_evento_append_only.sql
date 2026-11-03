CREATE FUNCTION "bloquear_alteracao_evento"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'evento é somente inserção';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "evento_bloquear_update_delete"
BEFORE UPDATE OR DELETE ON "evento"
FOR EACH ROW
EXECUTE FUNCTION "bloquear_alteracao_evento"();
--> statement-breakpoint
CREATE TRIGGER "evento_bloquear_truncate"
BEFORE TRUNCATE ON "evento"
FOR EACH STATEMENT
EXECUTE FUNCTION "bloquear_alteracao_evento"();
