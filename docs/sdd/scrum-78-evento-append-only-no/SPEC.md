# Spec: SCRUM-78 — evento append-only no PostgreSQL

> Contexto (de DISCOVERY): proteger em `packages/db` a linha do tempo permanente de cada pauta contra alteração ou remoção, inclusive quando o acesso não passa pelo domínio.
> Ticket: SCRUM-78 — T5 · Trigger que impede UPDATE e DELETE na tabela evento + teste

## Comportamento principal

Depois da migração, uma conexão com permissão de escrita continua conseguindo inserir uma nova linha em `evento`. Qualquer tentativa de atualizar, apagar ou truncar eventos é interceptada antes da operação e falha com a mensagem `evento é somente inserção`. A FK de `evento.pauta_id` permanece `ON DELETE RESTRICT`, portanto uma pauta referenciada por evento também não pode ser apagada.

## Critérios de aceitação

- [x] Inserir um evento válido persiste a linha normalmente.
- [x] Atualizar qualquer coluna de `evento`, incluindo `dados`, falha com a mensagem `evento é somente inserção` e não altera a linha.
- [x] Apagar um evento falha com a mensagem `evento é somente inserção` e não reduz a contagem.
- [x] Executar `TRUNCATE evento` falha com a mensagem `evento é somente inserção`.
- [x] Apagar uma pauta que possui evento falha por violação da FK `evento_pauta_id_pauta_id_fk` configurada com `ON DELETE RESTRICT`.
- [x] A operação e a forma correta de corrigir a linha do tempo ficam documentadas em `packages/db/README.md`: correções geram um evento novo; reset local recria o banco em vez de truncar `evento`.

## Contextuais

- **Atores e contexto:** qualquer ator conectado ao PostgreSQL que alcance a tabela `evento`; a proteção não depende da aplicação ou do domínio.
- **Casos de borda:** o bloqueio de UPDATE não pode ficar restrito à coluna `dados`; `TRUNCATE` deve ser bloqueado por statement; a FK precisa impedir exclusão indireta da pauta.
- **Não-funcional:** integridade e auditabilidade (RN11/RNF08); a regra deve existir no banco e ser comprovada em PostgreSQL real.
- **Fora de escopo:** criar papéis de banco ou alterar credenciais da aplicação; a revogação recomendada depende de um usuário de aplicação separado do owner/migrador, inexistente hoje. Registrar eventos pelo domínio, views públicas e UI continuam nas tasks dependentes.

## Padrões aplicáveis

- Nenhum catálogo `.agent/patterns/` está configurado; seguir as convenções atuais das migrações Drizzle e dos testes Vitest/PostgreSQL de `packages/db/src/schema.test.ts`.
