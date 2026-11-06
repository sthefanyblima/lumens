# Plano de testes — SCRUM-87: views públicas

Linguagem/framework: TypeScript, Vitest, PGlite e PostgreSQL real (CI)
Exemplos do repo usados como base: `packages/db/src/privileges.test.ts`,
`packages/db/src/app-role.test.ts`, `packages/db/seed/seed.test.ts`
Oráculo: ticket SCRUM-87 e o seed escrito à mão em `packages/db/seed/data.ts`, conferido linha a
linha. Os valores esperados nunca saem da própria view.

## Casos — `packages/db/src/views-publicas.test.ts` (PGlite, roda sem Docker)

O banco em memória recebe as mesmas migrações e o seed; as consultas rodam com `SET ROLE lumens_site`.

- [principal] **instala exatamente as oito views** — oráculo: lista do ticket.
- [segurança] **lumens_site lê cada view** (7 casos).
- [segurança] **permission denied em toda tabela do schema public** — oráculo: `42501` para cada
  tabela listada em `pg_tables`; a lista precisa conter `estudante`, `relato`, `apoio`… para o laço
  não passar vazio.
- [segurança] **permission denied em `SELECT * FROM estudante`** — critério literal do ticket.
- [segurança] **só SELECT, só nas oito views** — `information_schema.role_table_grants`.
- [segurança] **tabela e view futuras não chegam ao site** — cria as duas como owner e espera `42501`.
- [segurança] **não escreve nas views**.
- [segurança] **nenhuma coluna proibida** — `information_schema.columns` das views contra
  `telefone|email|hmac|cifrado|estudante_id|(^|_)id$`.
- [segurança] **`security_barrier=true` em todas** e nenhuma outra opção (sem `security_invoker`).
- [dados] **v_resumo** = `{ pautas_abertas: 4, apoios: 978, conquistas: 1 }` (apoios da recusada fora).
- [dados] **v_pauta_publica** traz as sete pautas públicas, sem a em curadoria nem a recusada.
- [dados] **bloco, meta, apoios e cursos dos responsáveis** de duas pautas.
- [dados] **próxima etapa** das sete pautas (`Faltam 48 apoios`, `Prazo do Fala.BR em 20/03`, …).
- [dados] **v_relato_publico** traz os três aprovados com o curso; o pendente e o recusado somem.
- [dados] **v_caminho_publico** traz Fala.BR com protocolo e prazo e proposta com voluntários; 8 linhas.
- [dados] **v_linha_do_tempo** traz as 25 transições públicas; nenhum `pauta_criada`.
- [dados] **v_conquista** traz data, apoios e `proposta_executada = false`.
- [dados] **v_atividade** começa pelo evento público mais recente.
- [negativo] **evento público de pauta em curadoria** não aparece em `v_linha_do_tempo` nem em
  `v_atividade`.
- [negativo] **evento não público de pauta pública** não aparece.
- [negativo] **relato aprovado de pauta em curadoria** não aparece.
- [fronteira] **`Falta 1 apoio`** no singular e **`Meta alcançada`** quando não falta nenhum.
- [fronteira] **v_atividade sem corte**: com 60 eventos novos, os 85 públicos voltam; a página
  `LIMIT 100 OFFSET 50` traz 35.
- [desempenho] **índice na ordem da paginação**: `evento_publico_criado_em_idx` é
  `(criado_em DESC) WHERE publico`, sem `NULLS LAST`.
- [dados] **v_bloco** traz os seis blocos do seed com nome e base de estudantes.
- [negativo] **v_bloco com bloco sem pauta e bloco só com pauta em curadoria**: os dois aparecem.
- [segurança] **classificação do enum**: todo valor de `enum_range(NULL::status_pauta)` está em
  `STATUS_PUBLICOS` ou `STATUS_ESCONDIDOS`, e as duas listas juntas são exatamente o enum.
- [segurança] **cada view mostra exatamente os status públicos**: uma pauta por status, com evento
  público, relato aprovado, caminho e proposta; `v_pauta_publica`, `v_relato_publico`, os dois
  ramos de `v_caminho_publico`, `v_linha_do_tempo` e `v_atividade` mostram só as sete públicas.
- [segurança] **`v_resumo.apoios` por status**: um apoio em cada uma das nove pautas soma 7.
- [negativo] **caminho e proposta de pauta em curadoria ou recusada** não aparecem em
  `v_caminho_publico` (o seed não tem nenhum nessas pautas).
- [fronteira] **dois Fala.BR**: o aberto por último sem prazo dá `Aguardando resposta`; um mais
  novo com prazo dá `Prazo do Fala.BR em 15/06`.
- [negativo] **mandato encerrado**: o curso de quem tem `ate` preenchido não aparece; o de um
  mandato ativo novo aparece.
- [negativo] **apoio em pauta em curadoria** não altera `v_resumo.apoios`.
- [segurança] **`dados` sem id interno**: `caminho_id` e `id` somem, `protocolo` e `tipo` ficam;
  nenhuma chave `id`/`*_id` em `v_linha_do_tempo` nem em `v_atividade`.

## Casos — PostgreSQL real (CI)

- `privileges.test.ts` · **login real do site**: autentica como `lumens_site` por
  `DATABASE_URL_LEITURA`; lê as oito views; recebe `42501` em cada tabela do schema `public`, em
  `pgboss.job` e em `drizzle.__drizzle_migrations`.
- `app-role.test.ts` · **provisiona o login do site** com `POSTGRES_SITE_PASSWORD`, sem atributos
  elevados, e a senha da aplicação não autentica; **rejeita `POSTGRES_SITE_PASSWORD` ausente** antes
  de criar o papel.

## Testes existentes ajustados

- `privileges.test.ts`: o total de migrações deixa de ser `'5'` fixo e passa a ler o journal.
- `schema.test.ts`: o teste de defaults de `criado_em`/`criada_em`/`aberto_em` olha só tabelas; as
  views repetem esses nomes sem default.

## Prova de que os testes pegam a falha

Removendo da migração o filtro `moderacao = 'aprovado'`, o filtro `publico` e acrescentando
`GRANT SELECT ON estudante TO lumens_site`, 7 testes do PGlite falham.

Cada mutação abaixo, aplicada sozinha, derruba exatamente o teste indicado (1 falha, 33 passam):

| Mutação na `0006`                                                     | Teste que falha                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| tirar o filtro de pauta pública dos dois ramos de `v_caminho_publico` | caminho e proposta de pauta em curadoria ou recusada |
| voltar `AND c.prazo IS NOT NULL` no Fala.BR                           | Fala.BR aberto por último, mesmo sem prazo           |
| tirar `AND pp.ate IS NULL`                                            | curso só de quem tem mandato ativo                   |
| contar apoios de `em_curadoria` em `v_resumo`                         | `v_resumo` não conta apoio de pauta em curadoria     |
| expor `e.dados` sem filtrar as chaves                                 | tira de dados as chaves de id interno                |

Mutações da terceira rodada, cada uma aplicada sozinha:

| Mutação                                                          | Testes que falham                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `LIMIT 50` de volta em `v_atividade`                             | v_atividade sem corte                                                 |
| `v_bloco` só com blocos de pauta pública                         | bloco sem pauta e bloco só com pauta escondida                        |
| `v_bloco` fora do GRANT                                          | lê v_bloco; só SELECT nas oito; os dois testes de v_bloco             |
| `conquistada` fora da allowlist de `v_linha_do_tempo`            | v_linha_do_tempo com o seed; cada view mostra exatamente os públicos  |
| `descumprida` fora da allowlist do ramo de proposta              | v_caminho_publico com o seed; cada view mostra exatamente os públicos |
| `prometido` fora da allowlist de `v_resumo.apoios`               | os dois testes de `v_resumo`                                          |
| `ALTER TYPE status_pauta ADD VALUE 'arquivada'` no fim da `0006` | classificação do enum                                                 |
| índice da `0005` com `DESC NULLS LAST`                           | índice na ordem da paginação                                          |

Com as migrações corretas, os 41 passam.

## Lacunas

- PGlite não testa autenticação; por isso o login real fica em `privileges.test.ts`, que exige
  PostgreSQL real com `lumens_site` provisionado (CI ou `pnpm db:up`).
- Ataque com função temporária vazando linhas antes do filtro não é exercitado; o teste confere
  apenas que `security_barrier` está ligado.
- Fora as chaves `id`/`*_id`, o conteúdo de `evento.dados` não é varrido; isso cabe à SCRUM-89.
- O plano de `v_atividade` (nested loop pelo índice, sem ordenar o feed inteiro) foi conferido à
  mão com `EXPLAIN` como `lumens_site` num PostgreSQL 17 com 40 mil eventos; nenhum teste automático
  confere o plano, só a definição do índice.
- Uma troca de allowlist por `NOT IN` não muda nenhum resultado com o enum atual, então nenhum teste
  de dados a pega; quem pega o efeito dela é o teste de classificação, quando o enum ganhar valor.
- Contagens do planejador (`EXPLAIN ANALYZE` como `lumens_site`) revelam quantas linhas os filtros
  descartaram; isso fica fora da garantia e não é testado.
