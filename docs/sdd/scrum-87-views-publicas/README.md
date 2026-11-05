# SCRUM-87 — views públicas e usuário do banco só de leitura

> Registro do que foi especificado, planejado e entregue — a contraparte documental do código.

|                            |                                   |
| -------------------------- | --------------------------------- |
| **Ticket**                 | SCRUM-87 (T14)                    |
| **Dev**                    | @guilhermek32                     |
| **Branch**                 | `feat/SCRUM-87-views-publicas`    |
| **Commit no arquivamento** | — (ainda não commitado)           |
| **Fase alcançada**         | IMPLEMENTAÇÃO, aguardando revisão |

## Documentos

| Arquivo                | O que contém                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| [`SPEC.md`](SPEC.md)   | O que foi especificado: comportamento, critérios de aceitação, o que ficou fora de escopo. |
| [`PLAN.md`](PLAN.md)   | Como foi planejado: abordagem, passos, riscos e divergências de padrão assumidas.          |
| [`TESTS.md`](TESTS.md) | Estratégia de testes: casos, oráculo de cada um, lacunas conhecidas.                       |

## Aprovação

Pendente.

## Entrega

- [x] Sete views públicas na migração `0006_views_publicas.sql`, sem id, HMAC, cifra, telefone ou
      e-mail; a pauta sai pelo `slug`.
- [x] Pautas `em_curadoria`/`recusada`, relatos não aprovados e eventos não públicos ficam de fora.
- [x] "Próxima etapa" derivada do status em `v_pauta_publica`.
- [x] Login `lumens_site` provisionado por `pnpm db:provision` (senha `POSTGRES_SITE_PASSWORD`),
      com `SELECT` só nas sete views e nada nas tabelas, inclusive nas futuras.
- [x] `DATABASE_URL_LEITURA` aponta para `lumens_site` em `.env.example`, CI e README.
- [x] Índice parcial `evento_publico_criado_em_idx` para `v_atividade`.
- [x] Colunas de cada view documentadas em `packages/db/README.md`.
- [x] Testes em PGlite (rodam sem Docker) e testes com o login real em `privileges.test.ts`.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check` e `pnpm test` (603 testes) passaram.

## Desvios do ticket

- **Voluntários em `v_caminho_publico`:** no schema, voluntário pertence à proposta, não ao caminho.
  A view junta caminhos e propostas (`tipo = 'proposta'`); só a proposta tem `voluntarios`.
- **Data da conquista:** a pauta não guarda essa data; `v_conquista.conquistada_em` vem do evento
  público `status_alterado` com `para = conquistada`.
- **Migração em duas partes:** `0005_indice_atividade_publica.sql` (gerada pelo drizzle-kit a partir
  do schema) e `0006_views_publicas.sql` (custom), como na SCRUM-78 (0002 + 0003).
- **`security_barrier`:** acrescentado às views; o ticket não pedia, mas sem ele um filtro de quem
  consulta poderia rodar antes do filtro da view.

## Dívida técnica aceita

- `evento.dados` sai sem as chaves `id` e `*_id`, mas o resto do payload passa como está. O
  catálogo da T7 proíbe dado pessoal no payload, mas o banco não valida o JSONB; essa garantia é do
  domínio.
- `relato.foto_chave` é exposta como está; o formato da chave é decidido na T20 e não pode conter
  identificação de quem relatou.

## Exceções do processo

- Ticket fornecido por quem pediu a tarefa; Jira não foi consultado diretamente.
- A suíte com PostgreSQL real rodou contra um PostgreSQL 17 local, com `lumens_app` e `lumens_site`
  criados por `db:provision` com senhas descartáveis e removidos no fim; o `.env` local ainda é do
  formato anterior à SCRUM-78 (sem `.env.database`), então `pnpm test` puro não serve de prova.
