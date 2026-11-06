# SCRUM-88 — API de leitura pública

> Registro do que foi especificado, planejado e entregue — a contraparte documental do código.

|                            |                                   |
| -------------------------- | --------------------------------- |
| **Ticket**                 | SCRUM-88 (T15)                    |
| **Dev**                    | @guilhermek32                     |
| **Branch**                 | `feat/SCRUM-88-api-leitura`       |
| **Commit no arquivamento** | — (ainda não commitado)           |
| **Fase alcançada**         | IMPLEMENTAÇÃO, aguardando revisão |

## Documentos

| Arquivo                | O que contém                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| [`SPEC.md`](SPEC.md)   | O que foi especificado: comportamento, critérios de aceitação, o que ficou fora de escopo. |
| [`PLAN.md`](PLAN.md)   | Como foi planejado: abordagem, passos, riscos e divergências de padrão assumidas.          |
| [`TESTS.md`](TESTS.md) | Estratégia de testes: casos, oráculo de cada um, lacunas conhecidas.                       |

Referência das rotas para quem consome a API: [`docs/api.md`](../../api.md).

## Aprovação

Pendente.

## Entrega

- [x] Módulo `apps/backend/src/api` registrado no mesmo Fastify do webhook, com pool próprio aberto
      por `DATABASE_URL_LEITURA` (login `lumens_site`), separado do pool da aplicação.
- [x] Seis rotas `GET`, sem login: `/resumo`, `/blocos`, `/pautas`, `/pautas/:slug`, `/conquistas`
      e `/atividade`. Nenhuma rota de escrita.
- [x] As consultas leem só as views públicas da SCRUM-87.
- [x] Pacote `@lumens/contratos` com os esquemas zod e os tipos das respostas; o back-end converte
      os esquemas em JSON Schema de resposta, e o Fastify descarta campo não declarado.
- [x] `/pautas?bloco=<slug>` filtra pelo bloco; sem filtro, traz todas as pautas públicas.
- [x] `/pautas/:slug` de pauta inexistente, em curadoria ou recusada responde o mesmo `404`.
- [x] Slug, bloco, `limit` ou `offset` inválidos e parâmetro repetido respondem `400`.
- [x] `limit` padrão 20 e máximo 100, `offset` e `proximo` em `/pautas` e `/atividade`.
- [x] CORS só para as origens de `CORS_ORIGENS` (padrão `https://lumens-ufal.vercel.app`), com
      `Vary: Origin` e nunca `*`.
- [x] `Cache-Control: public, max-age=30, stale-while-revalidate=30` no `200` e `no-store` nos erros.
- [x] `CORS_ORIGENS` em `.env.example` e na validação do ambiente.
- [x] Rotas documentadas em `docs/api.md`, com exemplos do seed.
- [x] `/pautas/:slug` abaixo de 300 ms localmente com o seed.
- [x] `pnpm check` (typecheck, lint, format e testes) passou com PostgreSQL 17 local provisionado: 790 testes, 58 deles da API.

## Desvios do ticket

- **`/blocos`:** rota a mais, sobre `v_bloco`. O filtro de bloco do site lista todos os blocos,
  inclusive os sem pauta pública, e não teria de onde tirar a lista.
- **`/conquistas` sem paginação:** a lista é pequena (uma pauta no seed) e o site mostra todas.
- **Paginação por offset, não por cursor:** `v_atividade` não tem id para desempatar eventos com o
  mesmo `criado_em`; um cursor só por `criado_em` pularia eventos.
- **CORS sem `@fastify/cors`:** o ticket pede CORS só para o domínio do site; foi feito num hook
  próprio, sem dependência nova, com as origens em `CORS_ORIGENS` em vez de um domínio fixo.
- **Bloco desconhecido:** `?bloco=` com formato válido que não existe devolve lista vazia (`200`), e
  não `404`; o ticket só fala de `400` para bloco inválido.

## Dívida técnica aceita

- A paginação por offset pode repetir ou pular um item quando um evento novo chega entre duas
  páginas do feed. Aceito pelo volume pequeno; trocar por cursor exige um desempate na view.
- `dados` dos eventos sai como objeto livre (`Record<string, unknown>`): o contrato não descreve o
  payload de cada tipo do catálogo da T7. A garantia de que ele não tem dado pessoal continua no
  domínio (e na varredura da SCRUM-89).
- O limite de 300 ms é medido à mão com o seed local; nenhum teste automático mede tempo.

## Exceções do processo

- Ticket fornecido por quem pediu a tarefa; Jira não foi consultado diretamente.
- O ponto "combinar com a parte 4" (formato das respostas e se o site usa a API ou lê as views
  direto pelo Next.js) foi decidido sem reunião registrada: a API é o contrato; o site consome os
  tipos de `@lumens/contratos`. Ver o PLAN.
