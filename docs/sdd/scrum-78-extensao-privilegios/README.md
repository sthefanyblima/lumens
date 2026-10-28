# SCRUM-78 — evento append-only no PostgreSQL (extensão de privilégios)

> Artefato de SDD finalizado pelo Tour em 2026-10-27. Registro do que foi
> especificado, planejado e aprovado — a contraparte documental do código.

|                            |                                   |
| -------------------------- | --------------------------------- |
| **Ticket**                 | SCRUM-78                          |
| **Dev**                    | @sthefanyblima                    |
| **Branch**                 | `docs/SCRUM-36-deploy-automatico` |
| **Commit no arquivamento** | `9b5b2c5`                         |
| **Fase alcançada**         | REVIEW                            |
| **Tour**                   | v0.10.0                           |

## Documentos

| Arquivo                | O que contém                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| [`SPEC.md`](SPEC.md)   | O que foi especificado: comportamento, critérios de aceitação, o que ficou fora de escopo. |
| [`PLAN.md`](PLAN.md)   | Como foi planejado: abordagem, passos, riscos e divergências de padrão assumidas.          |
| [`TESTS.md`](TESTS.md) | Estratégia de testes: casos, oráculo de cada um, lacunas conhecidas.                       |

## Aprovação

- Plano original aprovado em 2026-10-26 por @sthefanyblima.
- Extensão de privilégios aprovada em 2026-10-27 por @sthefanyblima.

## Entrega

- [x] Trigger append-only bloqueia `UPDATE`, `DELETE` e `TRUNCATE` de `evento`.
- [x] FK impede apagar pauta que possui evento.
- [x] Login `lumens_app` é provisionado sem atributos elevados e separado do owner/migrador.
- [x] Privilégios permitem `SELECT`/`INSERT` em `evento` e negam mutações, inclusive via `PUBLIC`.
- [x] Upgrade incremental, rotação, ambientes local/CI e operação estão documentados.
- [x] `pnpm check` passou com typecheck, lint, formatação e 77 testes.
- [x] Revisões independentes de testes e código foram aprovadas sem pendências.

## Desvios do plano aprovado

- Nenhum.

## Dívida técnica aceita

_Nenhuma dívida registrada nesta feature._

## Exceções do processo

- Projeto sem configuração local do Tour; a sessão usa os defaults e não executa `tour init`/`upgrade` sem autorização.
- O conteúdo completo do ticket foi fornecido pela dev; Jira e seus comentários não estão acessíveis nesta sessão.
