# @lumens/db

Este pacote mantém o schema Drizzle, as migrações SQL e o cliente PostgreSQL do Lumens.

## Linha do tempo de eventos

A tabela `evento` é append-only: aceita `INSERT`, mas triggers no PostgreSQL rejeitam `UPDATE`,
`DELETE` e `TRUNCATE` com a mensagem `evento é somente inserção`. A FK `evento.pauta_id` usa
`ON DELETE RESTRICT`, então uma pauta que possui eventos também não pode ser apagada.

Uma correção da linha do tempo deve ser registrada como **um evento novo**, nunca como edição ou
remoção de um evento anterior. O novo evento pode explicar o que está sendo corrigido nos seus
próprios dados, preservando o histórico público original.

## Migrações e reset local

Na raiz do repositório:

```bash
pnpm db:migrate
```

Como `TRUNCATE evento` é bloqueado, testes e desenvolvimento não devem usá-lo para limpar o
banco. Para recriar o ambiente Docker inteiro, derrube o volume, suba o PostgreSQL novamente e
reaplique as migrações:

```bash
pnpm db:reset
pnpm db:migrate
```

A suíte de integração cria e remove um banco temporário completo; ela não apaga linhas da base de
desenvolvimento.

## Seed de desenvolvimento

O seed determinístico inclui seis blocos, 300 estudantes fictícios, uma pauta em cada status e os
relacionamentos necessários para desenvolver o site e o painel de curadoria. Os nomes de blocos
marcados como fictícios ainda precisam ser conferidos com o mapa da DIACOM.

```bash
pnpm db:seed   # reaplicável; não apaga dados externos ao seed
pnpm db:fresh  # destrutivo: reset + migrate + seed
```

Telefones e e-mails não são reais. Os HMACs são determinísticos e os campos cifrados usam o
prefixo `seed:v1:` para deixar claro que são placeholders locais; a T17 substituirá esse mecanismo
pela criptografia da aplicação. As inserções ainda são diretas e devem migrar para os casos de uso
do domínio quando a T9 os disponibilizar.

## Papéis e conexões

O backend usa `DATABASE_URL` com o login restrito `lumens_app`. Provisionamento e migrações usam
`DATABASE_URL_MIGRACAO`, disponível somente em `.env.database`. O login da aplicação pode fazer o
DML necessário nas demais tabelas, mas não possui `UPDATE`, `DELETE` nem `TRUNCATE` em `evento`.
Os triggers continuam como proteção independente para acessos administrativos.

O mesmo comando `db:migrate` instala ou atualiza o schema `pgboss` com o owner e concede à
aplicação apenas os privilégios de operação das filas. O backend inicia o PgBoss sem executar
migrações nem manutenção DDL; por isso, `db:migrate` deve rodar antes de cada nova versão da
aplicação que atualize o PgBoss.

Depois de criar ou atualizar `.env.database`:

```bash
pnpm db:provision
pnpm db:migrate
```

O site usa `DATABASE_URL_LEITURA` com o login só de leitura `lumens_site` (SCRUM-87), criado pelo
mesmo `pnpm db:provision` com a senha de `POSTGRES_SITE_PASSWORD`. Ele precisa existir antes de
`db:migrate`, porque a migração `0006_views_publicas` concede a ele `SELECT` nas oito
[views públicas](#views-públicas-contrato-com-o-site) e nada mais.

O provisionamento pode ser reaplicado para rotacionar `POSTGRES_APP_PASSWORD` ou
`POSTGRES_SITE_PASSWORD`. Para fazer a rotação, defina a senha nova em `.env.database`, rode
`pnpm db:provision`, atualize a senha na URL de runtime correspondente (`DATABASE_URL` para
`lumens_app`, `DATABASE_URL_LEITURA` para `lumens_site`) e reinicie os processos que mantêm
conexões com o banco. Em produção, coordene esses passos com a atualização do cofre e o redeploy,
pois novas conexões com a senha antiga deixam de autenticar assim que o papel é atualizado.

O provisionamento aborta se o papel preexistente for membro de outro papel ou possuir objetos,
porque esses vínculos poderiam reintroduzir privilégios por fora dos grants versionados. O comando
nunca imprime URLs ou senhas.

## Views públicas (contrato com o site)

SCRUM-87 · T14. O site lê o banco **só** por estas oito views, com o login `lumens_site`. Ele recebe
`permission denied` (SQLSTATE `42501`) em qualquer tabela, então nem um bug no código do site
consegue ler telefone, e-mail ou quem apoiou, relatou ou se voluntariou (RNF01). As garantias:

- **Pauta pública** é a pauta num destes status, e só neles: `juntando_apoios`, `meta_batida`,
  `cobrando`, `prometido`, `entregue_em_parte`, `descumprida` e `conquistada`. É uma lista fechada
  (allowlist), repetida em cada filtro da `0006`: `em_curadoria`, `recusada` e qualquer status que
  for criado depois ficam escondidos até alguém incluí-los de propósito. Linhas de pautas
  escondidas (eventos, relatos, caminhos, propostas e apoios) não entram no resultado de nenhuma
  view nem nos totais. Isso vale para os dados devolvidos; metadados do planejador (por exemplo,
  `EXPLAIN ANALYZE`) não fazem parte da garantia.
- Relato só aparece com `moderacao = 'aprovado'` (RN03, RN12); evento só com `publico = true`.
- Do estudante, o público vê **só o curso**. Nenhuma view tem coluna de id, HMAC, cifra, telefone
  ou e-mail, nem chave de id dentro de `dados`; a pauta é identificada pelo `slug`.
- As views rodam com os privilégios do owner (sem `security_invoker`) e têm `security_barrier`,
  para que um filtro de quem consulta não rode antes do filtro da view.
- Tabelas e views criadas depois **não** chegam ao `lumens_site`: uma view nova para o site precisa
  de `GRANT SELECT` explícito na sua migração.
- A ordem das linhas não é garantida; ordene na consulta.

### `v_resumo`

Uma linha com os totais da página inicial.

| Coluna           | Tipo | Conteúdo                                                              |
| ---------------- | ---- | --------------------------------------------------------------------- |
| `pautas_abertas` | int  | pautas em `juntando_apoios`, `meta_batida`, `cobrando` ou `prometido` |
| `apoios`         | int  | apoios somados de todas as pautas públicas                            |
| `conquistas`     | int  | pautas em `conquistada`                                               |

### `v_pauta_publica`

Uma linha por pauta pública.

| Coluna                | Tipo              | Conteúdo                                                                                 |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `slug`                | text              | identificador público da pauta                                                           |
| `titulo`              | text              |                                                                                          |
| `descricao`           | text              |                                                                                          |
| `categoria`           | text              |                                                                                          |
| `status`              | status_pauta      | um dos sete status públicos                                                              |
| `meta`                | int               | apoios necessários                                                                       |
| `apoios`              | int               | apoios recebidos                                                                         |
| `bloco_slug`          | text, nulo        | nulo quando a pauta é do campus inteiro                                                  |
| `bloco_nome`          | text, nulo        | idem                                                                                     |
| `cursos_responsaveis` | text[]            | cursos distintos, em ordem alfabética, dos owners e co-owners ativos; `{}` se não houver |
| `criada_em`           | timestamptz       |                                                                                          |
| `aprovada_em`         | timestamptz, nulo |                                                                                          |
| `meta_batida_em`      | timestamptz, nulo |                                                                                          |
| `proxima_etapa`       | text, nulo        | texto pronto, derivado do status (tabela abaixo)                                         |

| Status              | `proxima_etapa`                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `juntando_apoios`   | `Faltam N apoios`; `Falta 1 apoio`; `Meta alcançada` quando os apoios já cobrem a meta                 |
| `meta_batida`       | `Aguardando o encaminhamento`                                                                          |
| `cobrando`          | `Prazo do Fala.BR em DD/MM`, do Fala.BR aberto por último; se ele não tem prazo, `Aguardando resposta` |
| `prometido`         | `Entrega prometida para DD/MM`, da promessa ativa; sem promessa, `Aguardando a entrega`                |
| `entregue_em_parte` | `Cobrar o restante`                                                                                    |
| `descumprida`       | `Retomar a cobrança`                                                                                   |
| `conquistada`       | nulo: não há próxima etapa                                                                             |

### `v_relato_publico`

Relatos aprovados de pautas públicas.

| Coluna        | Tipo              | Conteúdo                             |
| ------------- | ----------------- | ------------------------------------ |
| `pauta_slug`  | text              |                                      |
| `texto`       | text              |                                      |
| `foto_chave`  | text, nulo        | chave da foto no armazenamento (T20) |
| `curso`       | text, nulo        | curso de quem relatou, nunca quem é  |
| `moderado_em` | timestamptz, nulo | quando o relato foi aprovado         |

### `v_caminho_publico`

Caminhos (Fala.BR, comunidade, representante) e propostas de pautas públicas. No schema, os
voluntários pertencem à proposta, não ao caminho; por isso a proposta entra aqui como o caminho que
pede gente, com `tipo = 'proposta'`. Colunas que não se aplicam ao tipo da linha ficam nulas.

| Coluna                | Tipo              | Caminho                                   | Proposta                    |
| --------------------- | ----------------- | ----------------------------------------- | --------------------------- |
| `pauta_slug`          | text              | sim                                       | sim                         |
| `tipo`                | text              | `falabr`, `comunidade` ou `representante` | `proposta`                  |
| `status`              | text              | texto livre do caminho                    | `aberta` ou `executada`     |
| `protocolo`           | text, nulo        | protocolo do Fala.BR                      | nulo                        |
| `prazo`               | date, nulo        | prazo de resposta                         | nulo                        |
| `aberto_em`           | timestamptz, nulo | sim                                       | nulo                        |
| `descricao`           | text, nulo        | nulo                                      | o que a proposta pede       |
| `pessoas_necessarias` | int, nulo         | nulo                                      | sim                         |
| `voluntarios`         | int, nulo         | nulo                                      | quantos já se voluntariaram |
| `executada_em`        | timestamptz, nulo | nulo                                      | quando foi executada        |

### `v_linha_do_tempo`

Eventos públicos de pautas públicas. Filtre por `pauta_slug` e ordene por `criado_em`.

| Coluna       | Tipo        | Conteúdo                                                                                    |
| ------------ | ----------- | ------------------------------------------------------------------------------------------- |
| `pauta_slug` | text        |                                                                                             |
| `tipo`       | text        | um dos tipos do [catálogo da T7](../../docs/esquema.md#tipos-de-evento-decididos)           |
| `dados`      | jsonb       | payload do catálogo sem as chaves `id` e `*_id` (ex.: `caminho_id`); `{}` se não for objeto |
| `criado_em`  | timestamptz |                                                                                             |

### `v_conquista`

Pautas conquistadas.

| Coluna               | Tipo              | Conteúdo                                                              |
| -------------------- | ----------------- | --------------------------------------------------------------------- |
| `pauta_slug`         | text              |                                                                       |
| `titulo`             | text              |                                                                       |
| `bloco_nome`         | text, nulo        |                                                                       |
| `conquistada_em`     | timestamptz, nulo | instante do evento público `status_alterado` com `para = conquistada` |
| `apoios`             | int               | quantas pessoas apoiaram                                              |
| `proposta_executada` | boolean           | se alguma proposta da pauta foi executada                             |

### `v_atividade`

Todos os eventos públicos de todas as pautas públicas, para o feed de atividade. A view não corta
nada: quem consulta ordena por `criado_em DESC` e pagina, por exemplo
`ORDER BY criado_em DESC LIMIT 100 OFFSET 200` ou, por cursor, `WHERE criado_em < $1`. Dois eventos
podem ter o mesmo `criado_em` e a view não tem id para desempatar; um cursor só por `criado_em`
pode pular um deles.

A página sai do índice parcial `evento_publico_criado_em_idx` (`criado_em DESC`, só eventos
públicos), sem ordenar o feed inteiro. Para isso a view já vem ordenada por dentro (com
`security_barrier`, ela é planejada à parte e não enxerga o `ORDER BY ... LIMIT` de quem consulta)
e o índice é `DESC` puro: com `NULLS LAST` ele não casa com `ORDER BY criado_em DESC`. Mesmo assim,
ordene na consulta; o SQL não promete a ordem de uma view.

| Coluna         | Tipo        | Conteúdo                   |
| -------------- | ----------- | -------------------------- |
| `pauta_slug`   | text        |                            |
| `pauta_titulo` | text        |                            |
| `tipo`         | text        | como em `v_linha_do_tempo` |
| `dados`        | jsonb       | como em `v_linha_do_tempo` |
| `criado_em`    | timestamptz |                            |

### `v_bloco`

Todos os blocos, inclusive os que não têm pauta pública: o filtro de bloco do site lista todos.

| Coluna            | Tipo | Conteúdo                                 |
| ----------------- | ---- | ---------------------------------------- |
| `slug`            | text | identificador público do bloco           |
| `nome`            | text |                                          |
| `base_estudantes` | int  | estudantes do bloco, base da meta (RN04) |

### Migrações que mexem no que as views usam

O drizzle-kit não sabe que estas views existem: elas vivem só na migração custom `0006`, fora do
`schema.ts`. Uma migração gerada que apaga uma coluna usada por uma view, muda o tipo dela ou
recria um enum que uma view usa (`status_pauta`, `moderacao_relato`, `tipo_caminho`,
`status_proposta`) falha no `db:migrate` com `cannot drop … because other objects depend on it`
(ou `cannot alter type of a column used by a view or rule`).

Para fazer a mudança:

1. Crie uma migração custom com `pnpm --filter @lumens/db exec drizzle-kit generate --custom --name <nome>`.
2. Nela, faça `DROP VIEW` das views afetadas, aplique a mudança (pode copiar o SQL que o
   `drizzle-kit generate` produziria) e faça `CREATE VIEW` de novo, com `security_barrier`.
3. Refaça o `GRANT SELECT … TO "lumens_site"`: o grant é da view e some com o `DROP`.
4. Rode `pnpm --filter @lumens/db exec vitest run src/views-publicas.test.ts`.

**Status novo em `status_pauta`:** decida se ele é público. Se for, inclua-o na allowlist de cada
view numa migração nova; nos dois casos, inclua-o em `STATUS_PUBLICOS` ou `STATUS_ESCONDIDOS` em
`src/views-publicas.test.ts`. O teste de classificação lê `enum_range(NULL::status_pauta)` e falha
enquanto houver status sem classificação.
