# Plano: SCRUM-78 — evento append-only no PostgreSQL

> Plano original aprovado em: 2026-10-26 por @sthefanyblima
> Extensão de privilégios aprovada em: 2026-10-27 por @sthefanyblima

## Abordagem

Adicionar uma migração SQL aditiva e versionada após a migração inicial. A função PL/pgSQL sempre levanta a exceção exigida e será ligada a dois triggers: um por linha para UPDATE/DELETE e outro por statement para TRUNCATE. Manter o contrato Drizzle da FK com `onDelete: 'restrict'`, comprovar todos os efeitos em PostgreSQL real na suíte já existente e documentar a operação append-only no pacote do banco.

## Fontes e decisões

- **Regra vigente:** ticket SCRUM-78 fornecido pela dev em 2026-10-26; RN11, RNF08 e RF-C05 citados no ticket; contrato atual de `packages/db/src/schema.ts` e migração `0000_fantastic_ulik.sql`.
- **Limite da fonte:** sem conector Jira; comentários posteriores, pai/épico e roteiro externo citado no ticket não foram consultados.
- **Contradições:** nenhuma. A migração inicial e o schema Drizzle já declaram `evento.pauta_id` com `ON DELETE RESTRICT`.
- **Suposições:** a mensagem do erro deve conter exatamente `evento é somente inserção`; o SQLSTATE padrão de `RAISE EXCEPTION` (`P0001`) é aceitável. Responsável por confirmar: @sthefanyblima; custo se errado: ajuste localizado na migração ainda não publicada.
- **Decisão sobre privilégios:** não revogar de um nome hardcoded. Hoje o mesmo usuário configurado cria/migra e é usado pela aplicação; owners mantêm privilégios implícitos no PostgreSQL. Criar/separar o papel de aplicação foge desta task, então o item recomendado fica documentado como pendência real, sem fingir uma segunda camada ineficaz.
- **Fora de escopo:** API/domínio `registrarEvento`, papéis de leitura, views públicas, mudanças de UI e reset automático durante testes.

## Cobertura dos critérios

| Critério e fonte                      | Resultado observável esperado                                                            | Passo | Prova planejada                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------- |
| INSERT permitido (SCRUM-78)           | uma linha válida é persistida e lida de volta                                            | 2     | teste de integração faz INSERT/SELECT e compara os dados |
| UPDATE bloqueado (SCRUM-78)           | comando falha com `P0001` e mensagem exigida; `dados` permanece igual                    | 1, 2  | teste atualiza JSONB e relê a linha                      |
| DELETE bloqueado (SCRUM-78)           | comando falha com `P0001`; contagem antes/depois não muda                                | 1, 2  | teste conta, tenta DELETE e conta novamente              |
| TRUNCATE bloqueado (SCRUM-78)         | statement falha com `P0001` e mensagem exigida                                           | 1, 2  | teste executa `TRUNCATE evento` no banco temporário      |
| Exclusão da pauta restrita (SCRUM-78) | DELETE da pauta com evento falha em `evento_pauta_id_pauta_id_fk` (`23503`)              | 2     | teste cria pauta+evento e tenta apagar a pauta           |
| Operação documentada (SCRUM-78)       | README do pacote prescreve correção por novo evento e reset destrutivo do ambiente local | 3     | revisão do texto e `format:check`                        |

## Passos

1. Gerar uma migração customizada Drizzle e preencher o SQL com `bloquear_alteracao_evento()`, `BEFORE UPDATE OR DELETE ... FOR EACH ROW` sem restrição a colunas e `BEFORE TRUNCATE ... FOR EACH STATEMENT`; preservar a FK RESTRICT já existente — `packages/db/migrations/0001_*.sql`, journal/metadados gerados.
2. Estender a integração em PostgreSQL real com fixture de evento e casos independentes para INSERT, UPDATE, DELETE+contagem, TRUNCATE e DELETE da pauta; atualizar a expectativa do journal para duas migrações — `packages/db/src/schema.test.ts`.
3. Criar a documentação operacional append-only e atualizar a referência obsoleta da raiz — `packages/db/README.md`, `README.md`.
4. Executar os gates proporcionais: migração do zero/reaplicação exercitada pela suíte, `pnpm --filter @lumens/db test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`; então fazer revisão independente de testes e código.

## Testes

<!-- via: test-authoring -->

O plano detalhado e os oráculos independentes estão em `.agent/working/WORKING_TESTS.md`. Os casos são de integração com Vitest + PostgreSQL real e afirmam SQLSTATE, mensagem/constraint e estado persistido quando aplicável.

## Impactos e verificação

- **Consumidores e contratos:** INSERT permanece compatível para T8 e outros produtores; qualquer UPDATE/DELETE direto, ainda inexistente no código, passará a falhar de propósito. Nenhum DTO/API muda.
- **Dados e deploy:** migração aditiva, sem backfill. Instala a proteção sobre eventos já existentes. Rollback exigiria remover os triggers e a função em migração própria; não editar a migração depois de publicada.
- **Caminhos de risco:** owner/superuser pode desabilitar triggers, por isso o contrato é de proteção contra operações normais da aplicação, não contra administração maliciosa. Operações multirow falham atomicamente na primeira linha; TRUNCATE é coberto por trigger de statement.
- **Gates e ambiente:** `pnpm check` passou em PostgreSQL 17 local em 2026-10-26: typecheck, lint, `format:check` e 57 testes (28 banco, 12 domínio e 17 backend; site sem arquivos de teste). A suíte de banco migrou uma base temporária vazia e reaplicou o comando público.
- **Design:** não aplicável; sem UI.

## Desvios aprovados

- Nenhum.

## Riscos & decisões

- **Riscos:** omitir trigger de TRUNCATE deixaria um bypass; tratá-lo em trigger separado elimina essa lacuna. Restringir o trigger a `UPDATE OF dados` deixaria outras colunas mutáveis; o SQL e os testes cobrem também `publico`. Uma revogação nominal incorreta poderia quebrar migrações ou ser ineficaz; foi excluída até existir papel dedicado.
- **Divergências de padrão:** nenhuma; não há catálogo configurado.
- **Dependências:** PostgreSQL 17 com PL/pgSQL (instalado por padrão), Drizzle migrator e suíte Vitest existentes.

## Extensão de privilégios — proposta

### Fontes e decisões

- **Regra vigente:** solicitação da dev após o REVIEW para implementar a segunda camada recomendada
  no ticket; documentação oficial do PostgreSQL sobre privilégios, `REVOKE`, `CREATE ROLE` e
  `ALTER DEFAULT PRIVILEGES`.
- **Decisão de papéis:** `lumens` permanece owner/migrador e `lumens_app` é o login restrito. O
  nome fixo permite que a migração conceda privilégios sem interpolar identificador externo.
- **Decisão de configuração:** `.env` contém apenas variáveis de runtime e `DATABASE_URL` passa a
  apontar para `lumens_app`. `.env.database` concentra bootstrap, senha do papel, URL de migração e
  URL do banco de teste; somente comandos administrativos/testes carregam esse arquivo. O backend
  não o carrega. Os dois exemplos ficam versionados, nunca os arquivos reais.
- **Decisão de provisionamento:** um script TypeScript do pacote cria/endurece o papel após o
  PostgreSQL subir. `db:up` o chama, o CI o executa antes da migração e o comando é reaplicável em
  volumes existentes, evitando exigir `db:reset`. A lógica reutilizável aceita um nome somente
  internamente para testes isolados; o CLI de produção fixa `lumens_app`.
- **Estado preexistente:** atributos elevados são removidos explicitamente. Membership em outro
  papel ou ownership no banco atual faz o provisionamento falhar sem mutação parcial; o operador
  precisa remover a ambiguidade conscientemente. A migração revoga também de `PUBLIC` os privilégios
  mutáveis sobre `evento` e os testes verificam privilégios efetivos.
- **Privilégios:** conceder `USAGE` no schema e `SELECT`, `INSERT`, `UPDATE`, `DELETE` nas tabelas
  atuais/futuras criadas pelo migrador; revogar explicitamente `UPDATE`, `DELETE` e `TRUNCATE` de
  `evento`. Conceder `USAGE` em sequências atuais/futuras para manter compatibilidade com possíveis
  chaves geradas pelo banco.
- **Fora de escopo:** criar o usuário somente leitura do site, armazenar segredo de produção ou
  definir infraestrutura da hospedagem.

### Cobertura dos critérios da extensão

| Critério                             | Resultado observável esperado                                                                                          | Passo   | Prova planejada                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| Provisionamento seguro e reaplicável | `lumens_app` existe com atributos restritos, sem membership/ownership, e segunda execução não falha nem revela segredo | 6, 8    | função exercitada duas vezes com papéis aleatórios; CLI fixo executado uma vez no bootstrap        |
| Conexões separadas                   | migrador usa apenas `DATABASE_URL_MIGRACAO`; backend usa `DATABASE_URL`                                                | 6, 7    | testes de processo/configuração e CI com URLs diferentes                                           |
| INSERT/SELECT permitidos             | conexão como `lumens_app` insere e relê evento                                                                         | 5, 8    | teste PostgreSQL com role efetivo                                                                  |
| UPDATE/DELETE/TRUNCATE revogados     | catálogo retorna `false`; comandos falham em `42501` e preservam evento                                                | 5, 8    | `has_table_privilege` + comandos reais + SELECT administrativo                                     |
| Trigger preservado para owner        | owner continua falhando em `P0001` e mensagem exata                                                                    | 8       | regressões existentes                                                                              |
| Objetos futuros                      | tabela e sequência descartáveis criadas pelo owner herdam privilégios para `lumens_app`                                | 5, 8    | teste de default privileges no banco temporário, sem grant manual                                  |
| Upgrade de volume                    | banco que executou `0000`/`0001` recebe `0002` sem perder evento nem grants indevidos de `PUBLIC`                      | 5, 8    | runner aplica migrações históricas reais, insere sentinela/grant adversarial e então aplica `0002` |
| Ambientes e documentação             | backend não carrega admin; Docker/CI provisionam antes de migrar; upgrade local sem reset                              | 6, 7, 9 | testes de scripts/processos, execução dos gates e README                                           |

### Passos da extensão

5. Criar uma nova migração `0002` — sem editar `0001` — com grants/default privileges para
   `lumens_app`, revogação da exceção de `evento` também para `PUBLIC` e preservação dos dados —
   `packages/db/migrations/0002_*.sql` e metadados Drizzle.
6. Criar lógica Node/TypeScript reaplicável e CLI que provisionam/endurecem `lumens_app`, recusam
   membership/ownership incompatível e sanitizam falhas; fazer `db:migrate` exigir a URL
   administrativa — `packages/db/src/app-role.ts`, `provision-app-role.ts`, `migrate.ts` e scripts.
7. Separar `.env.example` (runtime) de `.env.database.example` (admin), ajustar `db:up`/`db:down`/
   `db:reset`, pacote e CI para provisionar antes de migrar e nunca carregar o arquivo admin no
   backend — arquivos de configuração raiz e `.github/workflows/ci.yml`.
8. Estender a suíte PostgreSQL com inspeção de atributos/privilégios, INSERT/SELECT como
   `lumens_app`, negações reais com `42501`, preservação, default privileges e upgrade `0001→0002`;
   papéis aleatórios isolam criação/rotação sem alterar o login compartilhado. Arquivos de ambiente
   temporários impedem contaminação pelo checkout real; falhas de autenticação exercitam a
   sanitização — testes do db/backend.
9. Atualizar README raiz, README do pacote e SDD com operação, rotação de senha, upgrade de volume
   existente e limite de produção; executar `pnpm check` e revisões independentes.

### Impactos e verificação da extensão

- **Compatibilidade:** o conteúdo administrativo do `.env` existente migra para `.env.database`, e
  `DATABASE_URL` troca para `lumens_app`. `pnpm db:up` provisiona sem apagar o volume; a nova `0002`
  atualiza bancos que já registraram `0001`.
- **Deploy:** provisionar `lumens_app` precede a migração. O migrador deve continuar sendo o mesmo
  owner para que `ALTER DEFAULT PRIVILEGES` alcance objetos futuros.
- **Segurança:** a aplicação não conhece a URL administrativa, não possui atributos elevados e não
  pode contornar o trigger desabilitando-o. A senha não entra em argv, log ou arquivo versionado;
  falhas de conexão e de estado incompatível também usam diagnóstico sanitizado.
- **Limite atual:** o backend ainda só valida configuração e não abre conexão de banco. A prova de
  separação executa esse entrypoint real e o cliente `@lumens/db` com a URL restrita; quando o
  servidor passar a consultar o banco, seu teste de integração deverá preservar essa identidade.
- **Rollback:** reverter a conexão da aplicação para o owner restaura o comportamento antigo, mas
  reduz a defesa; grants podem ser removidos em migração própria. O papel não será apagado
  automaticamente para evitar quebrar sessões/deploys.
- **Gates executados:** `pnpm check` passou em PostgreSQL 17 local em 2026-10-27: typecheck, lint,
  `format:check` e 77 testes (47 banco, 12 domínio e 18 backend; site sem arquivos de teste).
  Revisões independentes de testes e código terminaram aprovadas, sem pendências.
- **Referências:** documentação oficial do PostgreSQL sobre
  [privilégios](https://www.postgresql.org/docs/current/ddl-priv.html),
  [`CREATE ROLE`](https://www.postgresql.org/docs/current/sql-createrole.html) e
  [`ALTER DEFAULT PRIVILEGES`](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).
