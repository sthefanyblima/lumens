# Plano: SCRUM-77 — esquema inicial e migração

Estado: aprovado explicitamente pela dev em 2026-10-26; implementação em andamento.
Data: 2026-10-26. Entrega: @sthefanyblima.

## Abordagem

Adicionar Drizzle ORM e drizzle-kit a packages/db, usando o driver pg e migrações SQL versionadas. Separar a construção do cliente da leitura de ambiente dos comandos: importar tabelas e tipos não abre conexão. Criar esquema novo sem modificar dados existentes nem executar reset do Docker. Preparar documentação ER versionável em docs/database e documentação SDD da entrega em docs/sdd, sem configurar Tour para a equipe.

## Fontes e decisões

- Regra vigente: tickets SCRUM-77 e SCRUM-69 fornecidos pela dev, README, configuração de Postgres/CI e código atual de packages/db e packages/dominio.
- Limite: sem conector Jira disponível; comentários atuais, roteiro completo, especificação externa e decisões posteriores não foram consultados. A validação humana da T7 permanece pendente.
- Contradição resolvida pela dev em 2026-10-26: substituir curador.email por email_hmac e email_cifrado; HMAC de curador também único. Não implementar algoritmo criptográfico nesta task.
- Promessa ativa: proposta de predicado resultado IS NULL. Resultado preenchido encerra a promessa e libera outra ativa; o SQL e a documentação tornam esse contrato explícito. Resultado usa texto enquanto não há catálogo de valores aprovado.
- Meta congelada: coluna inteira persistida em pauta, sem vínculo calculado dinamicamente à base do bloco. A regra de cálculo/gravação fica no domínio futuro.
- UUIDs para entidades com id; timestamps com fuso; datas de entrega/prazo usam date quando representam dia civil. Defaults de timestamps de criação conforme os campos da task.
- HMAC e conteúdo cifrado: representação textual opaca, sem acoplamento ao formato da cifra futura. Campos obrigatórios e opcionais seguem o ciclo de vida: telefone de estudante obrigatório; e-mail pode estar ausente antes da verificação; chaves identificadoras de verificação e conversa são telefone_hmac.
- codigo_verificacao: telefone_hmac como PK (um desafio atual por telefone), codigo_hash, expira_em e tentativas >= 0. Sem máximo inventado: a quantidade permitida e a rotina de expiração pertencem ao domínio e devem ser confirmadas na respectiva task. expira_em registra o prazo; o banco não executa expiração automática.
- conversa: telefone_hmac como PK, passo, dados JSONB privado do backend e atualizado_em. Retenção de 24h será operacionalizada fora desta migração; JSONB não é garantia de cifra.
- Demais enums com valores explicitados na task: papel, origem de apoio, moderação, tipo de caminho, status de proposta, resposta e origem de evento. categoria, status de caminho, resultado de promessa e tipo de evento permanecem texto por falta de catálogo fornecido.
- registrada_por em promessa referencia curador.id. Relações sem FK no ticket, como telefone_hmac de conversa/desafio, não devem exigir estudante já cadastrado.
- Limites de três responsáveis ativos, prazo de dez minutos, limite de tentativas e ausência de PII em JSONB dependem do domínio; não serão apresentados como garantias desta migração.
- Fora do escopo: T5, T6, T7 e demais itens registrados na spec. Não abrir PR, fazer push ou alterar Jira nesta fase.

## Cobertura dos critérios

| Critério | Resultado observável                                        | Passo   | Prova planejada                                                                          |
| -------- | ----------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| AC1      | 16 tabelas com campos, defaults e nulabilidade documentados | 2       | Migração em banco vazio e consulta de catálogo                                           |
| AC2      | Enum da pauta contém os nove valores exatos                 | 2       | Assertiva do catálogo pg_enum                                                            |
| AC3      | Duplicatas nas três PKs compostas e em wamid falham         | 4       | Inserts válidos seguidos de duplicatas, SQLSTATE 23505 e constraint esperada             |
| AC4      | HMACs/slugs únicos e no máximo uma promessa ativa           | 2, 4    | Duplicatas rejeitadas; resultado preenchido permite próxima ativa                        |
| AC5      | Estudante/curador só têm HMAC/cifrado para contato          | 2, 4    | Inspeção de colunas; e-mail de curador duplicado por HMAC rejeitado                      |
| AC6      | FKs RESTRICT e índices esperados existem                    | 2, 4    | pg_constraint/pg_indexes, FK inválida e exclusão de referência rejeitadas                |
| AC7      | Vetor gerado usa configuração portuguese e índice GIN       | 2, 4    | Busca por título/descrição e inspeção do índice; atualização recalcula vetor             |
| AC8      | Migração do zero e reaplicação local/CI                     | 1, 3, 4 | CLI real db:migrate duas vezes, migração na base vazia de teste e testes sem skips no CI |
| AC9      | Domínio consome tipos exportados sem efeitos de conexão     | 1, 4    | Arquivo de contrato de tipos em dominio incluído em pnpm typecheck                       |
| AC10     | ER, campos, decisões e pendências disponíveis               | 5       | Revisão da documentação contra schema e SQL                                              |

## Passos

1. Ferramentas: adicionar drizzle-orm/pg e tipos/CLI necessários em packages/db/package.json; drizzle.config.ts; scripts root db:generate e db:migrate. Usar carregamento de .env da raiz com precedência das variáveis do processo, sem imprimir URLs. Incluir config e scripts no typecheck/lint.
2. Schema e migração: packages/db/src/schema.ts, cliente explícito e exportações; packages/db/migrations com SQL e metadados Drizzle. Índice parcial em promessa, FKs RESTRICT e índices sem redundâncias com prefixos de PKs. tsvector STORED gerado com configuração portuguese explicitada; GIN. Revisar SQL gerado.
3. Execução e CI: runner encerra pool em sucesso/erro. CI cria lumens_test pelo SQL já usado pelo Docker, executa db:migrate no banco lumens vazio antes dos testes. Não alterar nome do job check. A suíte conecta por DATABASE_URL_TESTE e cria uma base temporária com nome aleatório prefixado lumens_test_scrum77_; tanto tabelas public quanto journal drizzle ficam nessa base, incluindo a prova do CLI real com URL temporária no ambiente do subprocesso. O ambiente local/CI fornecido usa o usuário administrador do serviço; a suíte requer CREATEDB explicitamente e falha com orientação se faltar. Encerrar todos os pools/subprocessos e remover somente a base temporária de nome validado; nunca resetar lumens ou lumens_test. Local sem banco de teste deve falhar com orientação; CI não permite pular integração.
4. Verificação: Vitest contra PostgreSQL real para migração, defaults, enums, restrições, FKs, busca e reaplicação; prova de tipos em packages/dominio com dependência workspace de @lumens/db. Testes verificam código de erro e constraint, não apenas qualquer exceção. Múltiplos testes não compartilham transação já abortada.
5. Documentação: docs/database/schema.md com Mermaid ER, tabela de status técnico, contratos de campos e pontos para T7; README com comandos e pré-requisitos. Persistir a SDD da entrega em docs/sdd, sem ZIP nem política Tour. Executar pnpm check e revisão independente proporcional ao risco antes da entrega.

## Testes

Esboço inline; não foi solicitado o fluxo separado de autoria detalhada de testes. Os testes de integração são parte explícita dos critérios da SCRUM-77.

- Migração: em base temporária vazia, verificar todas as tabelas/enums/índices e journal isolado; reaplicar e conferir que não duplica objetos. Executar também o script público com a URL da mesma base temporária para detectar divergências entre teste e CLI. Falha na limpeza não pode apagar bases permanentes e deve ser informada.
- Duplicatas: dois registros válidos que colidem apenas na chave alvo devem falhar por 23505 e nome da constraint. Cobrir telefone/email de estudante, email de curador, slugs, apoio, voluntário, resposta e wamid.
- Promessa: primeira ativa aceita, segunda ativa da mesma pauta rejeitada; ativa em outra pauta aceita; preencher resultado libera outra ativa; várias encerradas coexistem.
- Integridade: FK inexistente e DELETE de entidade referenciada falham por 23503; NOT NULL obrigatório falha por 23502; enum inválido falha por 22P02. Verificar ON DELETE RESTRICT no catálogo para todas as FKs.
- Busca: consulta em português encontra conteúdo do título e descrição; atualização da pauta altera o vetor sem manutenção manual; índice GIN existe.
- Contrato: typecheck no domínio usa tipos de seleção/inserção e status de @lumens/db; importar schema sem DATABASE_URL não conecta nem falha.

## Impactos e verificação

- Consumidores: não há consumidores reais de banco existentes; a única escrita atual do domínio é uma função pura. Não introduzir regra de negócio ou endpoint.
- Dados/deploy: primeira migração; sem backfill. Nenhum comando destrutivo automático. Remoção da migração não equivale a rollback de banco; futuras mudanças exigirão migração aditiva/revisada.
- Concorrência: restrições únicas e índice parcial são a garantia de duplicidade sob concorrência; sem check-then-insert na aplicação.
- Gates: pnpm db:generate, db:migrate local e CI, pnpm check. PostgreSQL 17 local saudável; baseline pnpm check passou (tipos, lint, formatação e 28 testes existentes).
- Design: não aplicável; não há alteração de UI.

## Desvios aprovados

- Processo local: a dev determinou que Tour é opcional e qualquer configuração deve ficar só na sua máquina. Não executar tour init/upgrade no repositório; rascunhos desta sessão ficam fora do checkout. A documentação da entrega é versionável independentemente do Tour.

## Riscos e decisões

- Catálogos ausentes: preservar texto para campos sem enum fornecido e registrar confirmação na T7; não adivinhar nomes de eventos.
- Campos de contato opacos: alinhar formato com a task de cifra antes de gravar dados reais.
- Promessa ativa por resultado nulo: decisão proposta verificável; alteração futura desse conceito pode exigir ajuste do índice/migração.
- Sem catálogo .agent/patterns: nenhum padrão de equipe a contrariar; manter configuração e convenções existentes.
- Dependências: Drizzle, pg, Postgres 17; versões compatíveis serão verificadas antes da instalação.
- Referências técnicas consultadas: https://orm.drizzle.team/docs/get-started/postgresql-new, https://orm.drizzle.team/docs/drizzle-config-file e https://orm.drizzle.team/docs/guides/postgresql-full-text-search. Fixar versões estáveis compatíveis em vez de copiar automaticamente o tag rc exibido pelo guia atual. Para tsvector, usar tipo customizado/coluna gerada conforme a API efetivamente instalada e conferir o SQL.
