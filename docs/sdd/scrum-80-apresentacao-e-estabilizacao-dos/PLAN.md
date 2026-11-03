# Plano: SCRUM-80 — apresentação e estabilização dos contratos do esquema

> Aprovado em: 2026-11-03 por @sthefanyblima

## Abordagem

Tratar a entrega atual como preparação verificável da reunião: consolidar contratos existentes sem duplicar sua fonte executável e oferecer campos explícitos para registrar as respostas da equipe. A documentação distinguirá fatos atuais, propostas e decisões pendentes. Sem pedido aprovado que altere a persistência, o plano não cria migração vazia nem modifica o seed.

## Fontes e decisões

- **Regra vigente:** conteúdo da SCRUM-80 fornecido por @sthefanyblima em 2026-11-03; schema em `packages/db/src/schema.ts`; migrations `0000`–`0003`; seed da SCRUM-79; exports de `packages/dominio/src/index.ts`; contrato detalhado da T4 em `docs/database/schema.md`.
- **Limite da fonte:** comentários, pai/épico e vínculos do Jira não foram consultados; a reunião e seus participantes ainda não foram informados.
- **Contradições:** a divergência entre especificação e roteiro sobre `descumprida` foi resolvida pela dev em 2026-11-03: volta para `cobrando`; somente uma nova promessa leva a `prometido`. `docs/database/schema.md` chamava T5/T6 de pendentes e foi atualizado conforme migrations e seed presentes.
- **Suposições:** a reunião ainda não ocorreu ou sua ata não foi fornecida; responsável por confirmar: @sthefanyblima; custo se errado: preencher a ata e, se necessário, acrescentar os ajustes aprovados antes de congelar a versão.
- **Fora de escopo:** implementar domínio futuro da T8/T9, escolher serviços AWS da T20, avisar a equipe, fazer merge na `main`, declarar critérios organizacionais concluídos ou alterar banco/seed sem pedido aprovado.

## Cobertura dos critérios

| Critério e fonte                                  | Resultado observável esperado                                                                            | Passo | Prova planejada                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------ |
| Material da apresentação (SCRUM-80)               | `docs/esquema.md` contém ER, 9 status, transições, exports do domínio e o catálogo final de 16 eventos   | 1     | inspeção por listas independentes extraídas do ticket e do código; links locais resolvidos |
| Decisões 1–9 (SCRUM-80)                           | `docs/decisoes.md` marca 1 e 2 como decididas e 3–9 como pendentes, com proposta e campo de resultado    | 2     | busca/contagem da tabela e revisão do estado de cada linha                                 |
| Partes 2–5 (critério de aceite)                   | existem quatro linhas distintas com ciência, representante e necessidade, sem confirmação pré-preenchida | 2     | inspeção da matriz e busca pelos quatro identificadores                                    |
| Escrita pelo domínio e ajustes (contexto/etapa 4) | material proíbe escrita direta e descreve quando criar migração nova e atualizar seed                    | 1, 2  | busca pelos contratos e revisão contra `docs/database/schema.md`                           |
| Sem validação inventada (escopo confirmado)       | documento se identifica como preparação e mantém reunião, decisões e pedidos como `PENDENTE`             | 1, 2  | busca por estados e revisão de afirmações de estabilidade                                  |
| Referências e gates (critério de aceite)          | referências locais apontam para arquivos existentes; documentação formata; gates existentes não regridem | 3     | script de links/nomes, `pnpm format:check` e `pnpm check` conforme ambiente                |

## Passos

1. Criar o roteiro curto da apresentação com ER, contratos de status/transição, inventário do domínio, eventos propostos, visibilidade e regra de escrita — `docs/esquema.md`.
2. Criar a ata editável com metadados da reunião, matriz das partes 2–5, decisões 1–9 e protocolo para pedidos que exijam migration/seed — `docs/decisoes.md`.
3. Atualizar somente a seção de pendências do contrato da T4 para refletir T5/T6 implementadas e apontar para os artefatos da T7; validar links, formatação, tipos e testes existentes — `docs/database/schema.md`.

## Testes

<!-- via: test-authoring -->

- **Documentação:** conferir por script que os nove status do schema e os quinze eventos do ticket aparecem no material, que as partes 2–5 têm linhas próprias e que links locais resolvem para arquivos existentes.
- **Seed:** o plano e o oráculo do teste de regressão do payload mínimo ficam em `.agent/working/WORKING_TESTS.md`.
- **Formatação:** `pnpm exec prettier --check docs/esquema.md docs/decisoes.md docs/database/schema.md` deve terminar com código zero.
- **Regressão:** `pnpm typecheck`, `pnpm lint` e `pnpm test`; qualquer falha preexistente fora das linhas tocadas será relatada sem correção lateral.

## Impactos e verificação

- **Consumidores e contratos:** partes 1–5 ganham uma fonte de apresentação, ata, catálogo de 16 eventos e payloads mínimos; nenhuma API ou tipo TypeScript muda.
- **Dados e deploy:** o seed removeu `titulo` do payload append-only de `pauta_criada` para cumprir o contrato sem texto livre. Não há migration ou backfill; uma instalação nova recebe o payload final.
- **Caminhos de risco:** proposta parecer decisão → rótulos `PROPOSTO`/`PENDENTE`; documentação derivar do código → links e inventário conferidos; divergência de transição ser escondida → linha explícita para decisão 9.
- **Gates e ambiente:** `pnpm check` passou em PostgreSQL 17 local com papel restrito: typecheck, lint, Prettier e 341 testes (86 banco, 66 domínio, 152 backend, 37 site). A validação documental conferiu 9 status, 16 eventos, partes 2–5, links locais e `git diff --check`.
- **Design:** não aplicável; não há alteração de UI.

## Desvios aprovados

- Na revisão, uma garantia ampla sobre `conversa.dados` foi corrigida para explicitar que o JSONB não recebe cifra ou validação automática.
- Após o REVIEW, a dev pediu as decisões recomendadas: decisões 3–9, transições e catálogo/visibilidade dos eventos foram fechados documentalmente em 2026-11-03, sem ampliar para implementação das regras futuras.
- Com autorização ampla da dev, os payloads mínimos foram fechados; `pauta_criada` deixou de duplicar `titulo` no seed append-only e ganhou teste de regressão aprovado pelo `tour-test-reviewer`.

## Riscos & decisões

- **Riscos:** declarar a task completa sem reunião → manter critérios organizacionais pendentes; criar migration sem mudança → não gerar; lista de funções futuras ser confundida com exports atuais → separar claramente “disponível” de “contrato a fechar”.
- **Divergências de padrão:** nenhuma; não há catálogo `.agent/patterns/` configurado.
- **Dependências:** somente Markdown e ferramentas já existentes no repositório.
