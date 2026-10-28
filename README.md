# Lumens

[![CI](https://github.com/sthefanyblima/lumens/actions/workflows/ci.yml/badge.svg)](https://github.com/sthefanyblima/lumens/actions/workflows/ci.yml)

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
├── docker/init/          scripts SQL do banco local         (parte 1)
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

> **Windows:** o `corepack enable` escreve em `C:\Program Files\nodejs` e falha com `EPERM`
> num terminal comum. Rode-o uma vez num **PowerShell como Administrador**; depois disso
> o `pnpm` funciona normalmente no terminal de sempre.

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

O CI executa tipos, lint, formatação, migração em base vazia e testes, incluindo integração
com PostgreSQL. A documentação completa de operação entra na T21.

## Banco local

Pré-requisito: **Docker Desktop** aberto e rodando.

```bash
cp .env.example .env
cp .env.database.example .env.database   # ambos só na primeira vez
pnpm db:up
```

| Comando         | O que faz                                                    |
| --------------- | ------------------------------------------------------------ |
| `pnpm db:up`    | Sobe o PostgreSQL e provisiona o login restrito da aplicação |
| `pnpm db:down`  | Derruba o container, preservando os dados                    |
| `pnpm db:reset` | Apaga o volume, sobe do zero e reprovisiona o login          |

Conferir que o banco respondeu:

```bash
docker compose --env-file .env.database exec postgres psql -U lumens -d lumens -c 'select 1'
```

São dois bancos no mesmo container: `lumens`, para desenvolvimento, e `lumens_test`, para os
testes de integração — criado pelos scripts de `docker/init/`, que rodam uma única vez, na
criação do volume. Se editar algum deles, use `pnpm db:reset`.

### Esquema e migrações

```bash
pnpm db:migrate   # aplica as migrações pendentes pela URL administrativa; não reseta dados
pnpm db:generate  # após alterar o schema Drizzle, gera SQL para revisão/versionamento
```

O [contrato do banco](docs/database/schema.md) contém o diagrama ER, campos, status e decisões
da primeira versão. O esquema e os tipos de leitura/inserção são exportados por `@lumens/db`.
As migrações SQL e os metadados do Drizzle ficam em `packages/db/migrations/`.

`pnpm check` agora exige o Postgres local. A suíte usa `DATABASE_URL_TESTE` do `.env.database` ou
do ambiente (nome terminado em `_test`) e o administrador `SUPERUSER` do cluster descartável de
desenvolvimento/CI: além das bases temporárias, os testes criam e removem papéis com atributos
elevados para provar que o provisionamento os endurece. `CREATEDB` sozinho não basta. O usuário do
Docker local já permite isso; nunca aponte essa suíte para produção. Seed/`db:fresh` entram na T6.
A tabela `evento` é append-only; correções e o reset local estão documentados no
[README de `@lumens/db`](packages/db/README.md).

A versão do PostgreSQL é fixada no `docker-compose.yml` e precisa acompanhar a do banco de
homologação, que será definida na T20.

### Variáveis de ambiente

As variáveis de runtime ficam em `.env.example`; administração, migração e testes ficam em
`.env.database.example`. Copie-os para `.env` e `.env.database`, respectivamente. Os arquivos reais
são ignorados pelo git e nunca devem ser commitados. O backend carrega somente `.env`, portanto não
recebe a URL do owner/migrador; em produção os segredos vivem no cofre da hospedagem e no CI.

Ao atualizar um volume existente, não é preciso apagá-lo:

1. Crie `.env.database` a partir do exemplo e mova para ele toda configuração administrativa:
   `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`,
   `POSTGRES_APP_PASSWORD`, `DATABASE_URL_MIGRACAO` e `DATABASE_URL_TESTE`.
2. Remova essas chaves administrativas do `.env`; o backend carrega esse arquivo.
3. No `.env`, troque **tanto** `DATABASE_URL` quanto `DATABASE_URL_LEITURA` para o login
   `lumens_app`, usando a mesma senha definida em `POSTGRES_APP_PASSWORD`.
4. Rode `pnpm db:up` para provisionar o login e `pnpm db:migrate` para aplicar os privilégios.

Antes de iniciar o backend, confirme que o `.env` não contém mais usuário ou URL de owner/migrador.

`CHAVE_CIFRA` e `CHAVE_HMAC` são **duas chaves diferentes**: uma cifra telefone e e-mail, a
outra gera o HMAC que permite buscar por telefone sem decifrar a base inteira. Gere cada uma
com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Para conferir se o seu `.env` está completo:

```bash
pnpm --filter @lumens/backend dev
```

Ele lista de uma vez todas as variáveis que faltam, ou confirma que o ambiente está válido.

## Site

```bash
pnpm --filter @lumens/site dev     # http://localhost:3000
pnpm --filter @lumens/site build   # build de produção
```

Homologação: [lumens-hazel.vercel.app](https://lumens-hazel.vercel.app).

Até o ambiente da AWS (1.1b), o site é publicado na Vercel pela integração com o GitHub.
O projeto `lumens` está conectado ao repositório `sthefanyblima/lumens`, com `apps/site` como
diretório do site. Cada merge na `main` dispara um novo build; quando ele termina com sucesso,
o site é atualizado automaticamente. O status e os logs do deploy ficam no painel da Vercel.

## Como contribuir

- **Nunca** faça commit direto na `main`: toda mudança entra por pull request revisado.
- **Branches:** `tipo/SCRUM-<n>-descricao-curta`
  - ex.: `feat/SCRUM-77-esquema-inicial`, `fix/SCRUM-82-meta-batida-duplicada`
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/) com a chave do Jira
  - ex.: `feat(dominio): calcula meta da pauta [SCRUM-82]`
  - tipos: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`
- Antes de abrir o PR, rode `pnpm check`.
- No VS Code, instale as extensões recomendadas (o editor sugere ao abrir a pasta).
