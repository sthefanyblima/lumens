# Plano: SCRUM-88 — API de leitura pública

> Aprovação: pendente.

## Abordagem

Registrar um módulo `apps/backend/src/api` no Fastify que já serve o webhook, com um pool
`pg` próprio aberto por `DATABASE_URL_LEITURA` (login `lumens_site`). Cada rota faz uma consulta
SQL só sobre as views da SCRUM-87 e responde pelo esquema do pacote novo `@lumens/contratos`,
convertido em JSON Schema de resposta, para o Fastify serializar só os campos declarados.

## Fontes e decisões

- **Regra vigente:** ticket SCRUM-88; views e colunas da SCRUM-87 em
  `packages/db/README.md` ("Views públicas"); ordem e tipos provisórios do site em
  `apps/site/src/dados/`; servidor e ambiente do back-end em `app.ts`, `main.ts` e `config/env.ts`.
- **Contrato em zod, serializado pelo Fastify:** os esquemas ficam em `@lumens/contratos`
  (`packages/contratos/src/index.ts`) e são convertidos para JSON Schema draft-07 com
  `z.toJSONSchema` no registro de cada rota. O serializador do Fastify descarta todo campo não
  declarado, então uma coluna acrescentada a uma view **não** chega ao site até ser declarada no
  contrato. Nenhuma dependência HTTP nova: sem `@fastify/cors` e sem type provider; zod já era
  dependência do back-end.
- **Pool só de leitura:** separado do pool da aplicação (`DATABASE_URL`), aberto com
  `DATABASE_URL_LEITURA`. As consultas tocam só views. Nos testes, o PGlite roda as consultas com
  `SET ROLE lumens_site`; uma consulta que tocasse tabela falharia com `42501`.
- **Ordenação** (as views não garantem ordem; cada consulta ordena):
  - `/pautas`: `apoios DESC, criada_em DESC, slug` — a mesma de `pautasPublicas` do site, com o
    `slug` como desempate final para a paginação ser estável;
  - `/atividade`: `criado_em DESC`, a ordem do índice parcial `evento_publico_criado_em_idx`;
  - `/conquistas`: `conquistada_em DESC NULLS LAST`;
  - `/blocos`: `nome`;
  - linha do tempo de `/pautas/:slug`: `criado_em ASC`.
- **Paginação por `limit`/`offset`, não por cursor:** `v_atividade` não tem id para desempatar
  eventos com o mesmo `criado_em` (ver o README de `@lumens/db`); um cursor só por `criado_em`
  pularia um deles. A resposta é `{ itens, proximo }`, com `proximo` = offset da página seguinte ou
  `null`. `limit` padrão 20, máximo 100 (`LIMITE_PADRAO`, `LIMITE_MAXIMO`).
- **Validação de entrada:** `slug` e `bloco` seguem `SLUG` (minúsculas, dígitos e hífens, até 120
  caracteres); fora disso, `400`. Parâmetro de query repetido também é `400`, em vez de usar o
  primeiro ou o último em silêncio.
- **Bloco desconhecido:** `?bloco=` com formato válido que não existe devolve lista vazia (`200`),
  não `404`. É filtro de lista, não recurso; e o site já trata bloco inexistente como "sem
  resultado".
- **404 sem diferenciar:** pauta inexistente e pauta escondida (`em_curadoria`, `recusada`) recebem
  o mesmo corpo. Como a consulta vem de `v_pauta_publica`, a pauta escondida simplesmente não existe
  para a API; a resposta não revela que o slug está em curadoria.
- **CORS:** variável nova `CORS_ORIGENS`, lista separada por vírgula. Padrão
  `https://lumens-ufal.vercel.app` (endereço de homologação, SCRUM-242); o `.env.example` usa
  `http://localhost:3000`. A resposta ecoa a origem que está na lista, sempre com `Vary: Origin`, e
  nunca `*`. As rotas são `GET` simples e não precisam de preflight.
- **Cache-Control:** `public, max-age=30, stale-while-revalidate=30` no `200`; `no-store` nos
  erros, para um `400` ou `404` não ficar em cache.
- **Datas:** instantes saem como ISO 8601 em UTC; `prazo` como `AAAA-MM-DD`. A normalização é feita
  na camada de consulta, porque PGlite e `node-postgres` devolvem tipos diferentes para `date` e
  `timestamptz` (`Date` num, string no outro, conforme o tipo).
- **Ponto aberto — "combinar com a parte 4":** o ticket pede combinar o formato das respostas e se
  o site usa a API ou lê as views direto pelo Next.js. Decisão tomada nesta entrega: **a API é o
  contrato**; o site consome os tipos de `@lumens/contratos`. Falta a parte 4 confirmar e migrar os
  tipos provisórios de `apps/site/src/dados/tipos.ts`, que divergem do contrato (por exemplo,
  `owners[]` com `papel`/`desde` em vez de `cursos_responsaveis`, `eventos` em vez de
  `linha_do_tempo`, `Relato` sem `curso` e com `moderado_em` obrigatório).
- **Fora de escopo:** rotas do painel de curadoria (parte 5), card em imagem (RF-S05, RF-B08),
  varredura de identidade no CI (SCRUM-89), telas do site.

## Passos

1. Pacote `packages/contratos` (`@lumens/contratos`) com os esquemas zod de query, params e
   resposta, os tipos inferidos e as constantes (`SLUG`, `LIMITE_PADRAO`, `LIMITE_MAXIMO`,
   `STATUS_PUBLICOS`). Dependência `workspace:*` no back-end.
2. `CORS_ORIGENS` em `config/env.ts` (com o padrão) e em `.env.example`.
3. Módulo `apps/backend/src/api`: pool de leitura, consultas por rota (com a normalização de datas),
   rotas com o JSON Schema de resposta, hooks de CORS e `Cache-Control`, tratamento de `400`/`404`.
4. Registrar o módulo em `app.ts` e abrir/fechar o pool de leitura em `main.ts`.
5. Testes de integração com `fastify.inject` sobre PGlite com migrações, seed e
   `SET ROLE lumens_site`; teste de contrato.
6. Documentar as rotas em `docs/api.md` e apontar para ela no README da raiz.
7. Medir `/pautas/:slug` localmente com o seed.

## Impactos e verificação

- **Consumidores:** o site passa a ter uma API e tipos estáveis; o webhook e o worker não mudam.
- **Ambientes existentes:** `DATABASE_URL_LEITURA` já existe desde a SCRUM-87. É preciso definir
  `CORS_ORIGENS` onde o site não roda em `https://lumens-ufal.vercel.app` (desenvolvimento:
  `http://localhost:3000`). Sem `pnpm db:provision` e `pnpm db:migrate` da SCRUM-87, o login
  `lumens_site` não existe e as rotas falham.
- **Dados e deploy:** nenhuma migração; nenhum dado é alterado.

## Riscos & decisões

- **Campo sensível entrando por view:** mitigado em duas camadas: o login `lumens_site` só vê
  views sem identidade, e o contrato lista cada campo; um campo novo precisa ser declarado de
  propósito.
- **Cache de origem cruzada:** mitigado com `Vary: Origin`.
- **Offset em feed vivo:** um evento novo entre duas páginas desloca o feed; aceito (ver README).
- **Divergência de padrão:** nenhuma; reaproveita o servidor e a validação de ambiente existentes.
