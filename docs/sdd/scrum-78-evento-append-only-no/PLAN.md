# Plano: SCRUM-78 — evento append-only no PostgreSQL

> Aprovado em: 2026-10-26 por @sthefanyblima

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
