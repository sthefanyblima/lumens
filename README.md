# Lumens

Sistema de pautas estudantis da UFAL: **da reclamação à pauta**. São dois canais sobre um banco só:
um **bot de WhatsApp**, onde o estudante relata, apoia e cobra, e um **site público**, onde qualquer
pessoa acompanha as pautas, as conquistas e a atividade.

Projeto da disciplina Projeto e Desenvolvimento de Sistemas (PDS) · IC · UFAL.

## Stack

- **Back-end:** Node.js + TypeScript (bot, agendador e API num serviço só)
- **Banco:** PostgreSQL
- **Site:** Next.js
- **Nuvem:** AWS
- **Monorepo:** pnpm workspaces · **Testes:** Vitest · **Qualidade:** ESLint + Prettier

## Estrutura

```
lumens/
├── apps/
│   ├── backend/          Node.js + TypeScript
│   │   ├── src/bot/        webhook da Meta e conversas      (partes 2 e 3)
│   │   ├── src/agendador/  rotinas por data                 (parte 3)
│   │   └── src/api/        leitura pública e curadoria      (partes 1 e 5)
│   └── site/             Next.js: site público e painel     (partes 4 e 5)
└── packages/
    ├── db/               esquema, migrações, views, seed    (parte 1)
    └── dominio/          regras de negócio + testes         (parte 1)
```

**Regra da equipe:** nenhum módulo grava direto numa tabela de negócio. Todos chamam funções de
`@lumens/dominio`, que validam a regra, gravam e registram o evento na linha do tempo, tudo na mesma
transação.

## Como rodar

Pré-requisitos: **Node.js 24 LTS** (veja `.nvmrc`) e **pnpm 10**.

```bash
# habilita o pnpm na versão fixada no package.json (vem com o Node)
corepack enable

pnpm install
pnpm check        # typecheck + lint + formatação + testes
```

Comandos úteis:

| Comando          | O que faz                               |
| ---------------- | --------------------------------------- |
| `pnpm typecheck` | Checa os tipos de todos os pacotes      |
| `pnpm lint`      | ESLint em todo o repositório            |
| `pnpm lint:fix`  | Corrige o que o ESLint consegue sozinho |
| `pnpm format`    | Formata tudo com Prettier               |
| `pnpm test`      | Roda os testes de todos os pacotes      |
| `pnpm check`     | Tudo acima, na ordem (rode antes do PR) |

Para rodar um comando em um pacote só: `pnpm --filter @lumens/dominio test`.

Banco local (T2), CI (T3) e documentação completa (T21) entram nas próximas tasks.

## Como contribuir

- **Nunca** faça commit direto na `main`: toda mudança entra por pull request revisado.
- **Branches:** `tipo/SCRUM-<n>-descricao-curta`
  - ex.: `feat/SCRUM-77-esquema-inicial`, `fix/SCRUM-82-meta-batida-duplicada`
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/) com a chave do Jira
  - ex.: `feat(dominio): calcula meta da pauta [SCRUM-82]`
  - tipos: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`
- Antes de abrir o PR, rode `pnpm check`.
- No VS Code, instale as extensões recomendadas (o editor sugere ao abrir a pasta).
