# SCRUM-78 — evento append-only no PostgreSQL

Entrega de @sthefanyblima · 2026-10-26 · branch `docs/SCRUM-36-deploy-automatico`.

## Propósito e resultado

Proteger no PostgreSQL a linha do tempo permanente das pautas. A migração adiciona uma função
que rejeita alterações com a mensagem `evento é somente inserção`, um trigger `BEFORE` por linha
para `UPDATE`/`DELETE` e outro `BEFORE` por statement para `TRUNCATE`. Inserções continuam
permitidas e a FK existente impede apagar uma pauta que possui eventos.

A [spec](SPEC.md) registra o contrato aprovado, o [plano](PLAN.md) rastreia cada critério até sua
prova e a [estratégia de testes](TESTS.md) documenta os oráculos usados na integração real com
PostgreSQL.

## Decisões

- O trigger de `UPDATE` não é limitado a colunas; a regressão cobre `dados` e `publico`.
- `TRUNCATE` usa trigger separado porque triggers por linha não interceptam essa operação.
- `evento.pauta_id` já usava `ON DELETE RESTRICT`; a suíte agora prova o comportamento exigido.
- Não foi criado `REVOKE` nominal: aplicação e migração usam hoje o mesmo owner, que mantém
  privilégios implícitos. A segunda camada depende de separar os papéis do banco.
- Correções da linha do tempo são registradas como evento novo, nunca por edição ou remoção.

## Checklist e evidências

- [x] Migração customizada versionada com função e triggers de UPDATE, DELETE e TRUNCATE.
- [x] INSERT válido persiste e pode ser lido de volta.
- [x] UPDATE falha com SQLSTATE `P0001`, mensagem esperada e linha inalterada.
- [x] DELETE falha, mantém a contagem e preserva a linha.
- [x] TRUNCATE falha e preserva os eventos.
- [x] DELETE da pauta referenciada falha em `evento_pauta_id_pauta_id_fk` (`23503`).
- [x] Reaplicação do comando de migração mantém exatamente duas entradas no journal.
- [x] README do pacote documenta correções por novo evento e reset por recriação do banco.
- [x] `pnpm check` passou: typecheck, lint, formatação e 57 testes.
- [x] Revisão independente dos testes aprovada sem ajustes.
- [x] Revisão independente do código aprovada sem ajustes.

A suíte final contém 28 testes de banco, 12 de domínio e 17 de backend. Os testes de banco criam
uma base temporária, aplicam as migrações do zero, reaplicam o comando público e removem a base ao
final sem tocar nas bases permanentes.

## Desvios do plano aprovado

Nenhum.

## Pendências reais

- Separar o papel de aplicação do owner/migrador antes de adicionar uma segunda camada efetiva de
  revogação de `UPDATE`/`DELETE`.
- Comentários posteriores e documentos externos do ticket não foram consultados; a implementação
  usa o conteúdo completo fornecido pela dev nesta sessão.

## Aprovação

Plano aprovado em 2026-10-26 por @sthefanyblima. Fase REVIEW concluída com Tour v0.10.0.
