# API de leitura pública

SCRUM-88 · T15. API REST **só de leitura** e **sem login** sobre as
[views públicas](../packages/db/README.md#views-públicas-contrato-com-o-site) (SCRUM-87 · T14). É o
contrato entre o banco e o site (parte 4): o site lê pautas, relatos, caminhos, conquistas e a
atividade por aqui, nunca pelas tabelas.

- **Servidor:** o mesmo Fastify do webhook da Meta (`apps/backend`), na porta `PORT` do `.env`
  (vazia = `3001`). Em desenvolvimento: `pnpm dev` e `http://localhost:3001`.
- **Conexão com o banco:** um pool próprio, separado do pool da aplicação, aberto com
  `DATABASE_URL_LEITURA` (login `lumens_site`). Esse login só tem `SELECT` nas views públicas e
  recebe `permission denied` (`42501`) em qualquer tabela, então nenhuma rota consegue ler
  telefone, e-mail, HMAC ou `estudante_id`, nem por bug (RNF01).
- **Só `GET`:** não existe rota de escrita.
- **Contrato:** os esquemas zod do pacote [`@lumens/contratos`](../packages/contratos/src/index.ts).
  O back-end converte cada esquema em JSON Schema de resposta, e o Fastify descarta todo campo que
  não está declarado. Uma coluna nova numa view **não** chega ao site até ser declarada no contrato.

## Rotas

| Método e caminho    | View de origem                                                                    | Requisito |
| ------------------- | --------------------------------------------------------------------------------- | --------- |
| `GET /resumo`       | `v_resumo`                                                                        | RF-S01    |
| `GET /blocos`       | `v_bloco`                                                                         | RF-S02    |
| `GET /pautas`       | `v_pauta_publica`                                                                 | RF-S01/02 |
| `GET /pautas/:slug` | `v_pauta_publica` + `v_relato_publico` + `v_caminho_publico` + `v_linha_do_tempo` | RF-S03    |
| `GET /conquistas`   | `v_conquista`                                                                     | RF-S06    |
| `GET /atividade`    | `v_atividade`                                                                     | RF-S07    |

`/blocos` não estava no ticket: o filtro de bloco do site precisa da lista de blocos, inclusive os
sem pauta pública.

Os exemplos abaixo saem do seed de desenvolvimento (`packages/db/seed/data.ts`, `pnpm db:fresh`).

### `GET /resumo`

Totais da página inicial, sobre todas as pautas públicas (sem filtro de bloco).

| Campo            | Tipo | Conteúdo                                                              |
| ---------------- | ---- | --------------------------------------------------------------------- |
| `pautas_abertas` | int  | pautas em `juntando_apoios`, `meta_batida`, `cobrando` ou `prometido` |
| `apoios`         | int  | apoios somados de todas as pautas públicas                            |
| `conquistas`     | int  | pautas em `conquistada`                                               |

```json
{ "pautas_abertas": 4, "apoios": 978, "conquistas": 1 }
```

Os 4 apoios da pauta recusada não entram na soma.

### `GET /blocos`

Todos os blocos, em ordem de `nome`. Sem paginação.

| Campo                     | Tipo   | Conteúdo                                 |
| ------------------------- | ------ | ---------------------------------------- |
| `itens[].slug`            | string | identificador público do bloco           |
| `itens[].nome`            | string |                                          |
| `itens[].base_estudantes` | int    | estudantes do bloco, base da meta (RN04) |

```json
{
  "itens": [
    { "slug": "biblioteca-central", "nome": "Biblioteca Central", "base_estudantes": 120 },
    { "slug": "bloco-18", "nome": "Bloco 18 (fictício)", "base_estudantes": 1200 },
    { "slug": "saude", "nome": "Bloco da Saúde (fictício)", "base_estudantes": 650 },
    { "slug": "engenharias", "nome": "Bloco das Engenharias (fictício)", "base_estudantes": 5000 },
    { "slug": "artes", "nome": "Bloco de Artes (fictício)", "base_estudantes": 800 },
    {
      "slug": "residencia-universitaria",
      "nome": "Residência Universitária",
      "base_estudantes": 3000
    }
  ]
}
```

### `GET /pautas`

Pautas públicas, paginadas. Ordem: `apoios` decrescente; no empate, `criada_em` decrescente (a mais
recente primeiro); depois `slug`, para a ordem ser estável entre páginas. É a mesma ordem de
`pautasPublicas` no site.

| Query    | Tipo | Padrão | Limites                             |
| -------- | ---- | ------ | ----------------------------------- |
| `bloco`  | slug | —      | formato de slug, até 120 caracteres |
| `limit`  | int  | `20`   | de `1` a `100`                      |
| `offset` | int  | `0`    | `0` ou mais                         |

- Sem `bloco`, vêm todas as pautas públicas, inclusive as do campus inteiro (`bloco_slug` nulo).
- Com `bloco`, só as daquele bloco; as do campus inteiro ficam de fora.
- `bloco` com formato válido que não existe devolve lista vazia (`200`), não `404`.

Cada item de `itens`:

| Campo                 | Tipo           | Conteúdo                                                                                |
| --------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `slug`                | string         | identificador público da pauta                                                          |
| `titulo`              | string         |                                                                                         |
| `descricao`           | string         |                                                                                         |
| `categoria`           | string         |                                                                                         |
| `status`              | string         | um dos sete status públicos (`STATUS_PUBLICOS`)                                         |
| `meta`                | int            | apoios necessários                                                                      |
| `apoios`              | int            | apoios recebidos                                                                        |
| `bloco_slug`          | string, nulo   | nulo quando a pauta é do campus inteiro                                                 |
| `bloco_nome`          | string, nulo   | idem                                                                                    |
| `cursos_responsaveis` | string[]       | cursos distintos, em ordem alfabética, de owners e co-owners ativos; `[]` se não houver |
| `criada_em`           | instante       |                                                                                         |
| `aprovada_em`         | instante, nulo |                                                                                         |
| `meta_batida_em`      | instante, nulo |                                                                                         |
| `proxima_etapa`       | string, nulo   | texto pronto, derivado do status; nulo em `conquistada`                                 |

Os textos de `proxima_etapa` estão na
[tabela de `v_pauta_publica`](../packages/db/README.md#v_pauta_publica).

`GET /pautas?limit=2`:

```json
{
  "itens": [
    {
      "slug": "laboratorios-abertos-nas-engenharias",
      "titulo": "Laboratórios de informática abertos no contraturno",
      "descricao": "Garantir acesso monitorado aos laboratórios para trabalhos e projetos de extensão.",
      "categoria": "ensino",
      "status": "conquistada",
      "meta": 300,
      "apoios": 300,
      "bloco_slug": "engenharias",
      "bloco_nome": "Bloco das Engenharias (fictício)",
      "cursos_responsaveis": ["Administração", "Arquitetura e Urbanismo", "Ciência da Computação"],
      "criada_em": "2026-02-10T12:00:00.000Z",
      "aprovada_em": "2026-02-11T12:00:00.000Z",
      "meta_batida_em": "2026-02-12T12:00:00.000Z",
      "proxima_etapa": null
    },
    {
      "slug": "internet-na-residencia",
      "titulo": "Internet estável na residência universitária",
      "descricao": "Restabelecer a cobertura Wi-Fi nos quartos e áreas coletivas da residência.",
      "categoria": "tecnologia",
      "status": "descumprida",
      "meta": 300,
      "apoios": 300,
      "bloco_slug": "residencia-universitaria",
      "bloco_nome": "Residência Universitária",
      "cursos_responsaveis": ["Engenharia Civil", "Jornalismo"],
      "criada_em": "2026-02-09T12:00:00.000Z",
      "aprovada_em": "2026-02-10T12:00:00.000Z",
      "meta_batida_em": "2026-02-11T12:00:00.000Z",
      "proxima_etapa": "Retomar a cobrança"
    }
  ],
  "proximo": 2
}
```

As duas têm 300 apoios; a de laboratórios vem antes por ser mais recente. Com o seed, `GET /pautas`
traz as sete públicas e `proximo: null`; `GET /pautas?bloco=bloco-18` traz
`acessibilidade-no-bloco-18` (124 apoios) e `bebedouros-no-bloco-18` (72).

### `GET /pautas/:slug`

Uma pauta pública com relatos, caminhos e linha do tempo.

| Parâmetro | Tipo | Limites                             |
| --------- | ---- | ----------------------------------- |
| `slug`    | slug | formato de slug, até 120 caracteres |

Todos os campos de um item de `/pautas`, mais:

| Campo                            | Tipo           | Conteúdo                                                                |
| -------------------------------- | -------------- | ----------------------------------------------------------------------- |
| `relatos[].texto`                | string         | só relatos aprovados                                                    |
| `relatos[].foto_chave`           | string, nulo   | chave da foto no armazenamento (T20)                                    |
| `relatos[].curso`                | string, nulo   | curso de quem relatou, nunca quem é                                     |
| `relatos[].moderado_em`          | instante, nulo | quando o relato foi aprovado                                            |
| `caminhos[].tipo`                | string         | `falabr`, `comunidade`, `representante` ou `proposta`                   |
| `caminhos[].status`              | string         | texto livre do caminho; na proposta, `aberta` ou `executada`            |
| `caminhos[].protocolo`           | string, nulo   | protocolo do Fala.BR                                                    |
| `caminhos[].prazo`               | data, nulo     | prazo de resposta (`AAAA-MM-DD`)                                        |
| `caminhos[].aberto_em`           | instante, nulo | nulo na proposta                                                        |
| `caminhos[].descricao`           | string, nulo   | o que a proposta pede; nulo nos demais tipos                            |
| `caminhos[].pessoas_necessarias` | int, nulo      | só na proposta                                                          |
| `caminhos[].voluntarios`         | int, nulo      | quantos já se voluntariaram; só na proposta                             |
| `caminhos[].executada_em`        | instante, nulo | só na proposta                                                          |
| `linha_do_tempo[].tipo`          | string         | tipo do [catálogo da T7](esquema.md#tipos-de-evento-decididos)          |
| `linha_do_tempo[].dados`         | objeto         | payload do catálogo sem as chaves `id` e `*_id`; `{}` se não for objeto |
| `linha_do_tempo[].criado_em`     | instante       |                                                                         |

Os relatos vêm por `moderado_em` crescente; os caminhos por `aberto_em` crescente (a proposta, sem
`aberto_em`, por último), com `tipo` no desempate.

A linha do tempo vem em ordem cronológica (`criado_em` crescente) e só com eventos públicos: o
`pauta_criada` do seed, por exemplo, não aparece. As propostas entram em `caminhos` com
`tipo = 'proposta'`, porque no schema os voluntários pertencem à proposta.

Pauta inexistente e pauta que existe mas não é pública (`em_curadoria`, `recusada`) recebem o
**mesmo** `404`, com o mesmo corpo: a resposta não revela se o slug existe.

`GET /pautas/iluminacao-no-bloco-de-artes`:

```json
{
  "slug": "iluminacao-no-bloco-de-artes",
  "titulo": "Iluminação no entorno do Bloco de Artes",
  "descricao": "Trocar luminárias apagadas e iluminar o trajeto até o ponto de ônibus.",
  "categoria": "seguranca",
  "status": "cobrando",
  "meta": 80,
  "apoios": 84,
  "bloco_slug": "artes",
  "bloco_nome": "Bloco de Artes (fictício)",
  "cursos_responsaveis": ["Enfermagem", "Engenharia Civil", "Jornalismo"],
  "criada_em": "2026-02-06T12:00:00.000Z",
  "aprovada_em": "2026-02-07T12:00:00.000Z",
  "meta_batida_em": "2026-02-08T12:00:00.000Z",
  "proxima_etapa": "Prazo do Fala.BR em 20/03",
  "relatos": [
    {
      "texto": "A saída das aulas noturnas fica muito escura perto do ponto.",
      "foto_chave": null,
      "curso": "Pedagogia",
      "moderado_em": "2026-02-13T12:00:00.000Z"
    }
  ],
  "caminhos": [
    {
      "tipo": "falabr",
      "status": "em análise",
      "protocolo": "SEED-FALABR-2026-0001",
      "prazo": "2026-03-20",
      "aberto_em": "2026-02-10T12:00:00.000Z",
      "descricao": null,
      "pessoas_necessarias": null,
      "voluntarios": null,
      "executada_em": null
    },
    {
      "tipo": "proposta",
      "status": "executada",
      "protocolo": null,
      "prazo": null,
      "aberto_em": null,
      "descricao": "Fazer caminhada noturna e registrar os pontos sem iluminação.",
      "pessoas_necessarias": 6,
      "voluntarios": 2,
      "executada_em": "2026-02-16T12:00:00.000Z"
    }
  ],
  "linha_do_tempo": [
    {
      "tipo": "status_alterado",
      "dados": { "de": "em_curadoria", "para": "juntando_apoios" },
      "criado_em": "2026-02-07T12:00:00.000Z"
    },
    {
      "tipo": "status_alterado",
      "dados": { "de": "juntando_apoios", "para": "meta_batida" },
      "criado_em": "2026-02-08T12:00:00.000Z"
    },
    {
      "tipo": "status_alterado",
      "dados": { "de": "meta_batida", "para": "cobrando" },
      "criado_em": "2026-02-09T12:00:00.000Z"
    }
  ]
}
```

Com o seed, `GET /pautas/mais-arvores-no-campus` (em curadoria),
`GET /pautas/tomadas-nas-mesas-da-biblioteca` (recusada) e `GET /pautas/nao-existe` devolvem o
mesmo `404`.

### `GET /conquistas`

Pautas conquistadas, da conquista mais recente para a mais antiga; sem data de conquista vão para o
fim (`conquistada_em DESC NULLS LAST`). Sem paginação: a lista é pequena.

| Campo                        | Tipo           | Conteúdo                                                              |
| ---------------------------- | -------------- | --------------------------------------------------------------------- |
| `itens[].pauta_slug`         | string         |                                                                       |
| `itens[].titulo`             | string         |                                                                       |
| `itens[].bloco_nome`         | string, nulo   | nulo quando a pauta é do campus inteiro                               |
| `itens[].conquistada_em`     | instante, nulo | instante do evento público `status_alterado` com `para = conquistada` |
| `itens[].apoios`             | int            | quantas pessoas apoiaram                                              |
| `itens[].proposta_executada` | boolean        | se alguma proposta da pauta foi executada                             |

```json
{
  "itens": [
    {
      "pauta_slug": "laboratorios-abertos-nas-engenharias",
      "titulo": "Laboratórios de informática abertos no contraturno",
      "bloco_nome": "Bloco das Engenharias (fictício)",
      "conquistada_em": "2026-03-19T12:00:00.000Z",
      "apoios": 300,
      "proposta_executada": false
    }
  ]
}
```

### `GET /atividade`

Eventos públicos de todas as pautas públicas, do mais recente para o mais antigo
(`criado_em DESC`), paginados.

| Query    | Tipo | Padrão | Limites        |
| -------- | ---- | ------ | -------------- |
| `limit`  | int  | `20`   | de `1` a `100` |
| `offset` | int  | `0`    | `0` ou mais    |

| Campo                  | Tipo     | Conteúdo                                    |
| ---------------------- | -------- | ------------------------------------------- |
| `itens[].pauta_slug`   | string   |                                             |
| `itens[].pauta_titulo` | string   |                                             |
| `itens[].tipo`         | string   | como em `linha_do_tempo` de `/pautas/:slug` |
| `itens[].dados`        | objeto   | idem                                        |
| `itens[].criado_em`    | instante |                                             |

`GET /atividade?limit=3`:

```json
{
  "itens": [
    {
      "tipo": "status_alterado",
      "dados": { "de": "prometido", "para": "entregue_em_parte" },
      "criado_em": "2026-03-24T12:00:00.000Z",
      "pauta_slug": "acessibilidade-no-bloco-18",
      "pauta_titulo": "Acessibilidade nas entradas do Bloco 18"
    },
    {
      "tipo": "status_alterado",
      "dados": { "de": "prometido", "para": "conquistada" },
      "criado_em": "2026-03-19T12:00:00.000Z",
      "pauta_slug": "laboratorios-abertos-nas-engenharias",
      "pauta_titulo": "Laboratórios de informática abertos no contraturno"
    },
    {
      "tipo": "status_alterado",
      "dados": { "de": "prometido", "para": "descumprida" },
      "criado_em": "2026-03-10T12:00:00.000Z",
      "pauta_slug": "internet-na-residencia",
      "pauta_titulo": "Internet estável na residência universitária"
    }
  ],
  "proximo": 3
}
```

O seed tem 25 eventos públicos; o `status_alterado` da pauta recusada e todos os `pauta_criada` não
são públicos e não aparecem.

## Formatos

- **Instante** (`timestamptz`): string ISO 8601 em UTC, com `Z` (`2026-02-10T12:00:00.000Z`).
- **Data** (`date`, só `prazo`): string `AAAA-MM-DD`, sem fuso.
- **Slug** (pauta e bloco): minúsculas, dígitos e hífens, sem hífen nas pontas nem repetido
  (`SLUG` no contrato), de 1 a 120 caracteres.

## Paginação

`/pautas` e `/atividade` paginam por `limit` e `offset` e respondem `{ "itens": [...], "proximo": n }`:

- `proximo` é o `offset` da página seguinte, ou `null` quando não há mais itens.
- Para a página seguinte, repita a consulta com `offset=<proximo>` e o mesmo `limit` e filtros.
- `offset` além do fim devolve `itens: []` e `proximo: null`.

A paginação é por offset, e não por cursor, porque `v_atividade` não tem id para desempatar dois
eventos com o mesmo `criado_em`: um cursor só por `criado_em` pularia um deles. Um evento novo que
chega entre duas páginas desloca o feed, e a página seguinte pode repetir um item; o site deve
tolerar isso.

`/blocos` e `/conquistas` não paginam e respondem só `{ "itens": [...] }`.

## Status e erros

| Status | Quando                                                                                                                                                      | Corpo                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `200`  | sucesso, inclusive lista vazia (por exemplo, `bloco` que não existe)                                                                                        | o da rota                  |
| `400`  | `slug` ou `bloco` fora do formato; `limit` fora de 1–100 ou não inteiro; `offset` negativo ou não inteiro; parâmetro de query repetido (`?bloco=a&bloco=b`) | `{ "erro": "<mensagem>" }` |
| `404`  | `/pautas/:slug` de pauta inexistente **ou** não pública, sem diferenciar                                                                                    | `{ "erro": "<mensagem>" }` |

Só o formato `{ "erro": string }` faz parte do contrato; o texto da mensagem pode mudar. Na versão
atual o 404 tem sempre o mesmo texto, seja qual for o motivo. Uma falha inesperada (banco fora do
ar, por exemplo) responde `500` com `{ "erro": "Erro interno." }`; o texto do erro do banco fica só
no log.

O servidor aceita parâmetros de rota de até 240 caracteres (`maxParamLength`; o padrão do Fastify é
100), para que um slug válido de até 120 caracteres chegue à rota e receba o `404` da API em vez do
404 genérico do Fastify.

## Cabeçalhos

### CORS

A variável `CORS_ORIGENS` lista as origens aceitas, separadas por vírgula. Vazia, vale
`https://lumens-ufal.vercel.app` (endereço de homologação, SCRUM-242); o `.env.example` usa
`http://localhost:3000`, o `next dev` do site.

- Se o `Origin` da requisição está na lista, a resposta devolve essa origem em
  `Access-Control-Allow-Origin`. Nunca sai `*`.
- Toda resposta leva `Vary: Origin`, para um cache intermediário não servir a resposta de uma
  origem a outra.
- Origem fora da lista: a resposta sai sem `Access-Control-Allow-Origin`, e o navegador bloqueia a
  leitura.
- As rotas são `GET` simples, sem cabeçalho customizado, então o navegador não faz preflight
  (`OPTIONS`).
- CORS só vale para o navegador. Uma chamada feita no servidor do Next.js (Server Component,
  route handler) não depende dele.

### Cache-Control

| Resposta | `Cache-Control`                                 |
| -------- | ----------------------------------------------- |
| `200`    | `public, max-age=30, stale-while-revalidate=30` |
| erro     | `no-store`                                      |

Trinta segundos de cache aliviam o banco nos picos (RNF11) sem deixar o número de apoios velho por
muito tempo. Um erro nunca fica em cache.

## Usando os tipos no site

O pacote `@lumens/contratos` exporta os esquemas zod e os tipos inferidos deles (`Resumo`, `Bloco`,
`Pauta`, `PautaDetalhe`, `Conquista`, `AtividadeItem`, `Pautas`, `Atividade`, `Erro`…), além de
`SLUG`, `LIMITE_PADRAO`, `LIMITE_MAXIMO` e `STATUS_PUBLICOS`.

1. Em `apps/site/package.json`, adicione `"@lumens/contratos": "workspace:*"` às dependências e
   rode `pnpm install`.
2. Importe só os tipos:

   ```ts
   import type { PautaDetalhe, Pautas } from '@lumens/contratos';

   const resposta = await fetch(`${API}/pautas/${slug}`);
   if (resposta.status === 404) notFound();
   const pauta: PautaDetalhe = await resposta.json();
   ```

`import type` some na compilação, então o site não carrega zod no navegador. O pacote publica o
código-fonte TypeScript (`exports` aponta para `src/index.ts`); para importar **valores** (os
esquemas, para validar a resposta em tempo de execução, ou as constantes), o Next.js precisa
transpilar o pacote (`transpilePackages: ['@lumens/contratos']` em `next.config.ts`) e o site passa
a depender de zod.

## Mudando o contrato

1. Se a mudança precisa de coluna nova, crie a migração custom da view (veja
   [Migrações que mexem no que as views usam](../packages/db/README.md#migrações-que-mexem-no-que-as-views-usam)).
2. Declare o campo no esquema em `packages/contratos/src/index.ts`. Sem isso, o Fastify descarta o
   campo e o site não o recebe.
3. Atualize a consulta em `apps/backend/src/api/`, os testes da rota e esta página.
4. Nunca declare campo com telefone, e-mail, HMAC, cifra ou id; a varredura da SCRUM-89 confere isso.

## Desempenho

Meta da RNF11: a página da pauta abre em até 2 s numa conexão móvel. Para a API sobra pouco desse
tempo, então `GET /pautas/:slug` deve responder em menos de 300 ms localmente com o seed (critério
do ticket). As consultas usam os índices das views (PKs, índices por `pauta_id` e o índice parcial
`evento_publico_criado_em_idx` do feed de atividade).
