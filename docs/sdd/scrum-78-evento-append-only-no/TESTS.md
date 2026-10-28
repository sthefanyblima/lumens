# Plano de testes — SCRUM-78: evento append-only

<!-- Gerado pela skill /tour:test-authoring (passo 1, subagente independente).
     Aprovado pelo mesmo gate do WORKING_PLAN.md antes da escrita dos testes. -->

Aprovado em: 2026-10-26 por @sthefanyblima
Linguagem/framework: TypeScript, Vitest, `pg`, PostgreSQL real
Exemplos do repo usados como base: `packages/db/src/schema.test.ts`
Oráculo: critérios de aceite do ticket SCRUM-78 registrados em `WORKING_SPEC.md`

## Casos

- [principal · integração · smoke] **persiste um evento válido** — oráculo: INSERT permitido e SELECT independente devolve os campos explícitos da fixture — pega: trigger indevidamente acionado em INSERT.
- [negativo · integração] **rejeita alteração de dados e de outra coluna sem modificar o evento** — oráculo: casos parametrizados para `dados` e `publico`, ambos com SQLSTATE `P0001`, mensagem `evento é somente inserção` e linha relida igual à original — pega: UPDATE aceito, parcialmente aplicado ou trigger limitado a uma coluna.
- [negativo · integração] **rejeita exclusão de evento sem reduzir a contagem** — oráculo: SQLSTATE `P0001`, mensagem exigida, contagem igual e linha ainda presente — pega: DELETE aceito ou remoção parcial.
- [operação alternativa · integração] **rejeita TRUNCATE de evento** — oráculo: SQLSTATE `P0001`, mensagem exigida e linhas preservadas — pega: bypass do trigger por limpeza da tabela.
- [integridade referencial · integração · regressão] **rejeita exclusão de pauta referenciada por evento** — oráculo: SQLSTATE `23503`, constraint `evento_pauta_id_pauta_id_fk`, pauta e evento preservados — pega: FK sem `ON DELETE RESTRICT` ou remoção indireta.
- [reaplicação · integração · regressão] **reaplica migrações sem duplicar objetos** — oráculo: journal contém exatamente duas migrações e a proteção continua instalada — pega: migração customizada não registrada ou não idempotente no runner.

## Dimensões não-funcionais (ISO 25010) conferidas

- **Security:** mutações SQL diretas, TRUNCATE e exclusão indireta cobertos; bypass administrativo e criação de papéis ficam fora de escopo.
- **Reliability:** estado persistido é relido após cada falha; o banco temporário e as fixtures não dependem da ordem dos testes.
- **Performance:** ponto cego assumido; o ticket não define volume ou orçamento de latência, e o custo constante do trigger não justifica teste de carga nesta task.
- **Compatibility:** a suíte atual continua rodando e a reaplicação do comando público continua coberta.

## Lacunas / TBD

- `P0001` foi confirmado pela suíte como SQLSTATE emitido por `RAISE EXCEPTION`.
- A segunda camada por privilégios depende da separação futura entre owner/migrador e usuário da aplicação; não é honestamente testável na configuração atual.

## Execução e revisão

- `pnpm --filter @lumens/db test`: 28 testes passaram em PostgreSQL real.
- `pnpm check`: typecheck, lint, formatação e 57 testes passaram.
- Revisão independente dos testes: aprovada, sem ajustes.
- Revisão independente do código: aprovada, sem ajustes.
