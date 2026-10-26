# SCRUM-77 — esquema inicial e migração

Entrega de @sthefanyblima · 2026-10-26 · branch `feat/SCRUM-77-esquema-inicial`.

## Propósito e resultado

Instalar um contrato inicial compartilhado de PostgreSQL: 16 tabelas, nove status de pauta,
chaves/índices, busca em português, migração SQL editável e tipos TypeScript exportados por
`@lumens/db`. Os comandos públicos são `pnpm db:migrate` e `pnpm db:generate`.

A [spec](SPEC.md) preserva os campos e critérios recebidos. O [plano](PLAN.md) foi aprovado
explicitamente pela dev antes da implementação. O [contrato do banco](../../database/schema.md)
detalha o ER, nulabilidade, defaults e pontos para validação da equipe.

## Decisões

- Contatos de curador também usam HMAC e cifra; decisão humana confirmada nesta sessão.
- Promessa ativa significa resultado nulo; a unicidade é um índice parcial no PostgreSQL.
- Meta é persistida na pauta; atualizar a base do bloco não a recalcula.
- Campos sem catálogo fornecido permanecem texto; nomes finais de eventos e rótulos do site
  dependem da validação da equipe.
- Tour usado somente nesta sessão, sem configuração ou carregador obrigatório para o projeto.

## Checklist e evidências

- [x] Schema Drizzle com as 16 tabelas e migração inicial SQL revisável.
- [x] Restrições de unicidade, PKs compostas, FKs RESTRICT e índice parcial de promessa.
- [x] Coluna tsvector gerada em português, com índice GIN.
- [x] Tipos de leitura/inserção exportados e consumidos pelo domínio.
- [x] Comando de migração executado localmente duas vezes, sem duplicar objetos.
- [x] `pnpm db:generate` após a migração: nenhum schema novo a gerar.
- [x] CI configurado para criar banco de teste pela mesma fonte do Docker e migrar base vazia.
- [x] Testes independentes da base de desenvolvimento, com banco temporário e journal próprios.
- [x] Revisão independente dos testes; ajuste de alinhamento do script público incorporado.
- [x] Verificação final após a correção de precisão: tipos, lint, formatação e 51 testes passaram.
- [x] Revisão independente geral concluída e aprovada; diagnóstico seguro incorporado.
- [x] CI remoto da implementação e do merge aprovado no commit `d5718ef`.

Baseline antes da mudança: `pnpm check`, 28 testes. Verificação final da entrega: `pnpm check`
passou, com 22 testes de banco, 12 de domínio e 17 de backend (51 no total). Não há testes
do site nesta versão. A suíte de banco instalou e reaplicou as migrações em PostgreSQL 17 real.

O diagnóstico do runner foi validado com uma conexão deliberadamente inválida: saída com
falha e código SQLSTATE 28P01, sem URL ou credenciais no stderr. As revisões de testes e código
foram independentes, por leitura; os comandos acima foram executados pelo agente principal.
Os dois achados de atenção foram corrigidos e reavaliados: alinhamento do script público e
preservação de código diagnóstico seguro.

## Correção da precisão da chave de papel

A revisão completa após o merge encontrou perda de precisão em `papel_pauta.desde`: o
PostgreSQL armazenava microssegundos, mas o Drizzle retornava `Date` limitado a milissegundos.
Consultar pela PK retornada não encontrava o registro, inclusive usando o default now().

O mapeamento desse campo foi alterado para string, preservando o valor SQL e as chaves já
armazenadas. `pnpm db:generate` confirmou que não há alteração física de esquema ou migração
nova. A documentação do contrato e a checagem de tipos do domínio registram essa escolha.

Duas regressões verificam consulta e encerramento pela PK completa após leitura pelo ORM:
uma com default now() e outra com microssegundos explícitos. Ambas falharam antes da correção
e passaram depois. Os testes usam a mesma base temporária isolada da suíte.

Estado da entrega: implementação publicada na PR e correção pós-review validada localmente.
O resultado do CI para cada atualização deve ser consultado no GitHub. A SDD acompanha os
commits da feature, sem ZIP e sem configuração obrigatória do Tour.

## Pendências reais

Esta entrega cobre somente a primeira versão do schema e a migração. A proteção append-only
de evento, o seed e `db:fresh` pertencem às próximas subtarefas. A validação com as partes 2 a 5
continua humana e precisa registrar participantes, nomes de eventos, rótulos e decisões.

A implementação de cifra/HMAC, as views públicas e as regras de negócio não fazem parte desta
entrega. Em particular, JSONB não impede dados pessoais; expiração, retenção e máximo de
tentativas/responsáveis ativos ainda exigem a camada de domínio e o agendador.
