# SCRUM-80 — apresentação e estabilização dos contratos do esquema

> Artefato de SDD gerado pelo Tour em 2026-11-03. Registro do que foi
> especificado, planejado e aprovado — a contraparte documental do código.

|                            |                                    |
| -------------------------- | ---------------------------------- |
| **Ticket**                 | SCRUM-80                           |
| **Dev**                    | @sthefanyblima                     |
| **Branch**                 | `codex/SCRUM-80-contratos-esquema` |
| **Commit no arquivamento** | `dfd91fe`                          |
| **Fase alcançada**         | REVIEW                             |
| **Tour**                   | v0.10.0                            |

## Documentos

| Arquivo                | O que contém                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| [`SPEC.md`](SPEC.md)   | O que foi especificado: comportamento, critérios de aceitação, o que ficou fora de escopo. |
| [`PLAN.md`](PLAN.md)   | Como foi planejado: abordagem, passos, riscos e divergências de padrão assumidas.          |
| [`TESTS.md`](TESTS.md) | Estratégia de testes: casos, oráculo de cada um, lacunas conhecidas.                       |

## Aprovação

2026-11-03 por @sthefanyblima

## Desvios do plano aprovado

- Na revisão, uma garantia ampla sobre `conversa.dados` foi corrigida para explicitar que o JSONB não recebe cifra ou validação automática.
- Após o REVIEW, a dev pediu as decisões recomendadas: decisões 3–9, transições e catálogo/visibilidade dos eventos foram fechados documentalmente em 2026-11-03, sem ampliar para implementação das regras futuras.
- Com autorização ampla da dev, os payloads mínimos foram fechados; `pauta_criada` deixou de duplicar `titulo` no seed append-only e ganhou teste de regressão aprovado pelo `tour-test-reviewer`.

## Dívida técnica aceita

_Nenhuma dívida registrada nesta feature._

## Exceções do processo

- Projeto sem configuração local do Tour; a sessão usa os defaults e não executa `tour init`/`upgrade` sem autorização.
- A dev autorizou substituir a sessão encerrada da SCRUM-79 e preparar a SCRUM-80 com pendências explícitas, sem inventar validações da equipe.
- Não há catálogo `.agent/patterns/`; as regras do `AGENTS.md`, os contratos executáveis e a documentação da T4 são as fontes locais.
- Comentários, pai/épico e vínculos do Jira não foram consultados; o conteúdo completo do ticket foi fornecido pela dev.
