# Plano: SCRUM-79 — seed completo para site e curadoria

> Aprovado em: 2026-11-02 por @sthefanyblima

## Abordagem

Criar dados escritos à mão e geradores determinísticos, tipados pelos `Novo*` do schema, sem adicionar Faker. Inserir todas as entidades em uma transação, na ordem das FKs, com IDs fixos e `onConflictDoNothing()` para permitir reaplicação. O CLI usará a conexão restrita da aplicação (`DATABASE_URL`), e `db:fresh` encadeará reset, migração e seed.

## Fontes e decisões

- **Regra vigente:** conteúdo da SCRUM-79 fornecido por @sthefanyblima em 2026-11-02; schema atual de `packages/db/src/schema.ts`; regra RN04 em `packages/dominio/src/meta.ts`.
- **Limite da fonte:** comentários do Jira, pai/épico e o mapa da DIACOM não estavam disponíveis; os nomes dos blocos serão explicitamente fictícios e marcados para futura conferência.
- **Contradições:** nenhuma. O schema já oferece todas as tabelas e constraints necessárias.
- **Suposições:** status desde `meta_batida` representam pautas que alcançaram a meta e, portanto, recebem apoios `>= meta`; pautas anteriores ficam abaixo da meta. Responsável por confirmar: @sthefanyblima; custo se errado: ajustar somente contagens dos dados do seed.
- **Decisão de arquitetura:** `@lumens/dominio` depende de `@lumens/db`; importar `calcularMeta` de volta no seed criaria ciclo. As metas 30/120/300 ficarão explícitas, com teste contra as bases da RN04. As gravações diretas serão marcadas com `TODO(T9)` para migração quando existirem funções de criação.
- **Fora de escopo:** novas migrations/constraints, criptografia real da T17, nomes oficiais de blocos, mudanças no site/painel e reset seletivo de dados do seed.

## Cobertura dos critérios

| Critério e fonte              | Resultado observável esperado                                                                          | Passo | Prova planejada                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------- |
| Comando único (SCRUM-79)      | script raiz `db:fresh` executa `db:reset`, `db:migrate` e `db:seed` nesta ordem                        | 3     | teste inspeciona scripts e execução manual do comando                   |
| Blocos/metas (SCRUM-79)       | 5–8 blocos; bases 120/1200/5000 mapeadas a 30/120/300; pauta sem bloco com meta 300                    | 1     | consulta de integração compara linhas e valores literais do ticket/RN04 |
| Nove status (SCRUM-79)        | conjunto dos status persistidos contém exatamente os nove valores exigidos                             | 1, 4  | `GROUP BY status` e comparação com lista independente do ticket         |
| Apoios coerentes (SCRUM-79)   | estados pós-meta têm `count(apoio) >= meta`; demais ficam abaixo; nenhuma dupla duplicada              | 1, 4  | consulta agregada por pauta e verificação da PK                         |
| Owners e eventos (SCRUM-79)   | máximo de 3 papéis ativos por pauta; cada transição esperada tem um evento ordenado                    | 1, 4  | agrega papéis e valida a sequência `dados.de/para`                      |
| Dados relacionados (SCRUM-79) | existem três moderações, dois tipos de caminho, proposta/voluntário, promessa/resposta e curador ativo | 1, 4  | consultas de presença com valores concretos                             |
| Contatos fictícios (SCRUM-79) | HMACs hexadecimais e placeholders cifrados sem telefone/e-mail em texto puro                           | 1, 4  | teste consulta todos os contatos e valida formato/prefixo reservado     |
| Reaplicação (etapa 5)         | segunda execução completa sem erro e sem mudar contagens                                               | 2, 4  | snapshot de contagens antes/depois da segunda chamada                   |

## Passos

1. Modelar IDs, datas, contatos fictícios e todos os registros do seed em dados TypeScript tipados, incluindo seis blocos, 300 estudantes reutilizáveis e nove pautas com relacionamentos/linhas do tempo coerentes — `packages/db/seed/data.ts`.
2. Implementar a função transacional/idempotente de inserção e o CLI que valida `DATABASE_URL`, encerra o pool e reporta falha sem expor credenciais — `packages/db/seed/index.ts`, `packages/db/seed/run.ts`.
3. Expor `db:seed` no pacote e na raiz e `db:fresh` na raiz, sem alterar a semântica dos comandos existentes — `packages/db/package.json`, `package.json`, `packages/db/tsconfig.json` se necessário.
4. Criar teste de integração em PostgreSQL real, banco temporário vazio, exercitando a função duas vezes e validando os invariantes observáveis — `packages/db/seed/seed.test.ts`.
5. Documentar os comandos, o caráter fictício dos dados e a pendência de nomes DIACOM/T17/T9 — `packages/db/README.md`, `README.md` somente nas seções de banco existentes.
6. Rodar `pnpm --filter @lumens/db typecheck`, `pnpm --filter @lumens/db test` e `pnpm check`; depois executar revisões independentes de testes e código.

## Testes

<!-- via: test-authoring -->

O plano detalhado e os oráculos independentes serão registrados em `.agent/working/WORKING_TESTS.md`. O nível principal é integração com Vitest + PostgreSQL real; os valores esperados vêm da SCRUM-79 e da RN04, não da saída produzida pelo seed.

## Impactos e verificação

- **Consumidores e contratos:** site, painel e E2E ganham dados; exports públicos de `@lumens/db` e schema não mudam.
- **Dados e deploy:** sem migration ou backfill. `db:fresh` continua destrutivo apenas no ambiente apontado pelos comandos existentes; `db:seed` é aditivo/idempotente e não remove dados do usuário.
- **Caminhos de risco:** execução parcial é evitada por transação; repetida é absorvida por IDs/PKs determinísticos; FKs determinam a ordem; a tabela `evento` aceita INSERT pelo papel restrito.
- **Gates e ambiente:** `pnpm typecheck`, `pnpm lint` e `pnpm format:check` passaram; os 28 testes novos passaram em PostgreSQL real. A suíte completa do banco alcançou 63 testes verdes, mas não fechou verde porque este checkout não possui `.env.database` e o `DATABASE_URL` atual autentica o owner, falhas preexistentes dos testes de privilégio. O smoke destrutivo de `pnpm db:fresh` não foi executado pela mesma ausência de configuração administrativa.
- **Design:** não aplicável; nenhuma UI é alterada.

## Desvios aprovados

- Nenhum.

## Riscos & decisões

- **Riscos:** um contato fictício parecer real → usar apenas identificadores internos e domínio reservado `.invalid` antes do HMAC/placeholder; volume tornar o seed lento → 300 estudantes compartilhados entre pautas e inserts em lote; eventos faltarem transição → gerar a partir de sequências declarativas por pauta.
- **Divergências de padrão:** nenhuma; não há catálogo `.agent/patterns/` configurado.
- **Dependências:** somente dependências existentes (`drizzle-orm`, `pg`, `tsx`, Vitest e PostgreSQL); Faker não é necessário.
