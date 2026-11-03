# Spec: SCRUM-80 — apresentação e estabilização dos contratos do esquema

> Contexto (de DISCOVERY): consolidar em `docs/` o esquema da T4, os contratos atuais e as perguntas da T7 para a equipe validar, sem registrar como decidida uma resposta que ainda depende da reunião.
> Ticket: SCRUM-80 — T7 · Apresentar o esquema à equipe e ajustar com o que as partes 2 a 5 pedirem

## Comportamento principal

Uma pessoa da equipe abre o material da SCRUM-80 e encontra, numa página curta, o diagrama ER, a tabela de status e transições, a lista de funções públicas atuais do domínio, a proposta de eventos da linha do tempo e as decisões abertas. Em uma segunda página, registra participantes, necessidades das partes 2 a 5 e resultados das decisões. Antes da reunião esses campos ficam explicitamente pendentes; depois, pedidos concretos que alterem o banco devem gerar uma nova migração e a atualização correspondente do seed, nunca a edição de migração aplicada.

## Critérios de aceitação

- [x] `docs/esquema.md` apresenta o ER derivado do schema atual, os nove status e transições decididas, as funções públicas atuais do domínio e o catálogo final de 16 eventos (os 15 propostos mais `pauta_criada`) com visibilidade definida.
- [x] `docs/decisoes.md` registra Node.js + TypeScript, AWS + PostgreSQL e mantém decisões 3 a 9 com situação, proposta e espaço inequívoco para o resultado da equipe.
- [x] O registro possui uma seção por parte 2, 3, 4 e 5 para confirmar presença/ciência e anotar necessidades ou declarar que não há pedidos.
- [x] A documentação afirma o contrato de escrita apenas pelo domínio e orienta migração nova + atualização do seed somente quando um pedido aprovado alterar dados persistidos.
- [x] Nenhuma validação, decisão ou ajuste de schema é inventado: enquanto não houver ata da reunião, os itens dependentes dela permanecem `PENDENTE` e o material não se apresenta como versão estável congelada.
- [x] Os links e nomes documentados correspondem ao schema, às migrações, ao seed e aos exports atuais; os gates do repositório não regridem.

O conteúdo e os links foram conferidos. Com PostgreSQL 17 temporário e papel restrito, `pnpm check` passou com 341 testes.

## Contextuais

- **Atores e contexto:** partes 1 a 5 usam o material numa reunião de 15–20 minutos; a parte 1 mantém o contrato e registra as respostas; site, bot, curadoria e domínio consomem os nomes acordados.
- **Casos de borda:** reunião ainda não realizada → manter pendências visíveis; parte sem pedido → exigir declaração explícita; pedido altera persistência → nova migração e seed; pedido apenas documental → não criar migração vazia; fontes discordam sobre `descumprida` → não escolher silenciosamente.
- **Não-funcional:** documentação curta, revisável no diff e sem dados pessoais/segredos; Mermaid deve permanecer legível no renderizador do repositório.
- **Fora de escopo:** realizar ou simular a reunião; escolher serviços AWS da T20; implementar as funções futuras da seção 5 que ainda não existem; criar migração/seed sem pedido aprovado; avisar a equipe ou fazer merge na `main`.

## Padrões aplicáveis

- `AGENTS.md`: mudança simples e cirúrgica; `.agent/patterns/` prevaleceria, mas está vazio; não corrigir falhas preexistentes fora do escopo.
- `docs/database/schema.md`: schema executável em `packages/db/src/schema.ts`; migrações aplicadas são imutáveis; alteração de persistência exige nova migração.
- `andrej-karpathy-skills:karpathy-guidelines`: não inventar decisões, não criar abstrações ou artefatos sem necessidade e definir provas observáveis.
