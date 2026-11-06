# Plano de testes — SCRUM-88: API de leitura pública

Linguagem/framework: TypeScript, Vitest, Fastify (`fastify.inject`) e PGlite
Exemplos do repo usados como base: `packages/db/src/views-publicas.test.ts` (PGlite com
`SET ROLE lumens_site`), testes do webhook em `apps/backend/src/`
Oráculo: ticket SCRUM-88, o contrato em `packages/contratos/src/index.ts` e o seed escrito à mão em
`packages/db/seed/data.ts`, conferido linha a linha. Os valores esperados nunca saem da própria
resposta nem da view.

## Casos — integração (`apps/backend/src/api/`, PGlite, roda sem Docker)

O banco em memória recebe as migrações e o seed; o pool de leitura da API roda com
`SET ROLE lumens_site`, então uma consulta que tocasse tabela falharia com `42501`. Cada requisição
passa por `fastify.inject`.

### `/resumo`

- [principal] **totais do seed** = `{ pautas_abertas: 4, apoios: 978, conquistas: 1 }` (os apoios
  da pauta recusada ficam de fora).

### `/blocos`

- [principal] **seis blocos do seed, em ordem de nome**, com `slug`, `nome` e `base_estudantes`.

### `/pautas`

- [principal] **sem filtro, as sete pautas públicas**, sem `mais-arvores-no-campus` (em curadoria)
  nem `tomadas-nas-mesas-da-biblioteca` (recusada); `proximo: null`.
- [dados] **ordem `apoios DESC, criada_em DESC`**: as duas de 300 apoios vêm primeiro, a de
  laboratórios (mais recente) antes da de internet.
- [dados] **campos de uma pauta**: bloco, meta, apoios, `cursos_responsaveis`, instantes em ISO UTC
  e `proxima_etapa` conferidos contra o seed.
- [filtro] **`?bloco=bloco-18`** traz só `acessibilidade-no-bloco-18` e `bebedouros-no-bloco-18`.
- [filtro] **bloco válido que não existe** responde `200` com `itens: []`.
- [paginação] **`?limit=2`** traz duas e `proximo: 2`; **`?limit=2&offset=6`** traz uma e
  `proximo: null`; **offset além do fim** traz `itens: []`.
- [paginação] **sem `limit`** usa 20.
- [400] **`bloco` fora do formato** (maiúscula, espaço, mais de 120 caracteres).
- [400] **`limit=0`, `limit=101`, `limit=abc`, `offset=-1`**.
- [400] **parâmetro repetido** (`?bloco=a&bloco=b`).

### `/pautas/:slug`

- [principal] **pauta com relatos, caminhos e linha do tempo** (`iluminacao-no-bloco-de-artes`):
  relato aprovado com o curso; Fala.BR com protocolo e `prazo: "2026-03-20"`; proposta com
  `voluntarios: 2`; linha do tempo em ordem cronológica, sem `pauta_criada`.
- [negativo] **relato pendente não aparece** (`sala-de-descanso-na-saude`).
- [404] **pauta em curadoria**, **pauta recusada** e **slug inexistente** respondem `404` com
  corpos idênticos.
- [400] **slug fora do formato**.

### `/conquistas`

- [principal] **a pauta conquistada do seed**, com `conquistada_em`, `apoios: 300` e
  `proposta_executada: false`.

### `/atividade`

- [principal] **começa pelo evento público mais recente** (`entregue_em_parte` de
  `acessibilidade-no-bloco-18`, 24/03) e segue em `criado_em` decrescente.
- [dados] **25 eventos públicos no total**, sem nenhum `pauta_criada` nem a recusa.
- [paginação] **`limit` e `offset`** com `proximo` correto; `limit` acima de 100 é `400`.

### Cabeçalhos e métodos

- [segurança] **CORS:** origem da lista volta em `Access-Control-Allow-Origin` com `Vary: Origin`;
  origem fora da lista não recebe o cabeçalho; nunca `*`.
- [cache] **`Cache-Control`** `public, max-age=30, stale-while-revalidate=30` no `200` e
  `no-store` no `400` e no `404`.
- [segurança] **sem rota de escrita:** `POST`, `PUT`, `PATCH` e `DELETE` nas rotas não respondem
  `2xx`.

## Casos — contrato

- [segurança] **campo não declarado é descartado:** uma linha com campo a mais (por exemplo,
  `estudante_id`) passa pelo serializador da rota e sai sem ele.
- [segurança] **nenhum campo proibido no contrato:** as chaves de todos os esquemas de resposta
  não casam com `telefone|email|hmac|cifrado|estudante_id|(^|_)id$`.
- [contrato] **respostas validam no esquema zod** de cada rota com o seed.

## Prova de que os testes pegam a falha

Cada mutação abaixo, aplicada sozinha, deve derrubar ao menos o teste indicado:

| Mutação                                                | Teste que falha                   |
| ------------------------------------------------------ | --------------------------------- |
| consultar a tabela `pauta` em vez de `v_pauta_publica` | todos os de `/pautas` (`42501`)   |
| tirar o `WHERE` de bloco                               | filtro `?bloco=bloco-18`          |
| devolver corpo diferente para pauta escondida          | 404 com corpos idênticos          |
| trocar `criado_em DESC` por `ASC` em `/atividade`      | começa pelo evento mais recente   |
| remover `slug` do JSON Schema de resposta              | campos de uma pauta               |
| responder `Access-Control-Allow-Origin: *`             | CORS                              |
| não normalizar `prazo`                                 | Fala.BR com `prazo: "2026-03-20"` |

`<N>` testes no total; resultado a preencher depois da verificação.

## Lacunas

- PGlite não testa o login real por `DATABASE_URL_LEITURA`; isso já é coberto por
  `privileges.test.ts` da SCRUM-87, com PostgreSQL real no CI. A diferença de tipos de data entre
  PGlite e `node-postgres` é tratada na consulta, mas só o caminho do PGlite roda sem Docker.
- O limite de 300 ms de `/pautas/:slug` é medido à mão com o seed; nenhum teste mede tempo.
- O conteúdo de `dados` dos eventos não é varrido além das chaves `id`/`*_id`; isso cabe à SCRUM-89.
- Repetição ou salto de item na paginação por offset com eventos chegando entre páginas não é
  testado; é dívida aceita.
