# Lumens

[![CI](https://github.com/lumens0/lumens/actions/workflows/ci.yml/badge.svg)](https://github.com/lumens0/lumens/actions/workflows/ci.yml)

Sistema de pautas estudantis da UFAL: **da reclamação à pauta**. São dois canais sobre um banco só:
um **bot de WhatsApp**, onde o estudante relata, apoia e cobra, e um **site público**, onde qualquer
pessoa acompanha as pautas, as conquistas e a atividade.

Projeto da disciplina Projeto e Desenvolvimento de Sistemas (PDS) · IC · UFAL.

## Stack

- **Back-end:** Node.js + TypeScript (bot, agendador e API num serviço só)
- **Banco:** PostgreSQL
- **Site e painel:** dois apps Next.js separados
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
│   ├── site/             Next.js: site público              (parte 4)
│   └── painel/           Next.js: painel de curadoria       (parte 5)
├── docker/init/          scripts SQL do banco local         (parte 1)
└── packages/
    ├── contratos/        tipos da API de leitura pública    (parte 1)
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

| Comando         | O que faz                                                         |
| --------------- | ----------------------------------------------------------------- |
| `pnpm db:up`    | Sobe o PostgreSQL e provisiona o login restrito da aplicação      |
| `pnpm db:down`  | Derruba o container, preservando os dados                         |
| `pnpm db:reset` | Apaga o volume, sobe do zero e reprovisiona o login               |
| `pnpm db:seed`  | Insere ou completa os dados fictícios de desenvolvimento          |
| `pnpm db:fresh` | Apaga o volume, migra o banco e aplica o seed em um único comando |

Conferir que o banco respondeu:

```bash
docker compose --env-file .env.database exec postgres psql -U lumens -d lumens -c 'select 1'
```

São dois bancos no mesmo container: `lumens`, para desenvolvimento, e `lumens_test`, para os
testes de integração — criado pelos scripts de `docker/init/`, que rodam uma única vez, na
criação do volume. Se editar algum deles, use `pnpm db:reset`.

### Esquema e migrações

```bash
pnpm db:migrate   # aplica as migrações da aplicação e do pg-boss pela URL administrativa
pnpm db:generate  # após alterar o schema Drizzle, gera SQL para revisão/versionamento
pnpm db:seed      # aplica a massa fictícia pela URL restrita da aplicação
```

Para reconstruir o ambiente completo com dados para o site e a curadoria, use `pnpm db:fresh`.
Esse comando é destrutivo: ele remove o volume configurado antes de migrar e popular o banco.

O [contrato do banco](docs/database/schema.md) contém o diagrama ER, campos, status e decisões
da primeira versão. O esquema e os tipos de leitura/inserção são exportados por `@lumens/db`.
As migrações SQL e os metadados do Drizzle ficam em `packages/db/migrations/`.

`pnpm check` agora exige o Postgres local. A suíte usa `DATABASE_URL_TESTE` do `.env.database` ou
do ambiente (nome terminado em `_test`) e o administrador `SUPERUSER` do cluster descartável de
desenvolvimento/CI: além das bases temporárias, os testes criam e removem papéis com atributos
elevados para provar que o provisionamento os endurece. `CREATEDB` sozinho não basta. O usuário do
Docker local já permite isso; nunca aponte essa suíte para produção. O seed também é exclusivo de
desenvolvimento e usa apenas contatos fictícios.
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
   `POSTGRES_APP_PASSWORD`, `POSTGRES_SITE_PASSWORD`, `DATABASE_URL_MIGRACAO` e
   `DATABASE_URL_TESTE`.
2. Remova essas chaves administrativas do `.env`; o backend carrega esse arquivo.
3. No `.env`, aponte `DATABASE_URL` para o login `lumens_app`, com a senha de
   `POSTGRES_APP_PASSWORD`, e `DATABASE_URL_LEITURA` para o login só de leitura `lumens_site`,
   com a senha de `POSTGRES_SITE_PASSWORD`.
4. Rode `pnpm db:up` para provisionar os logins e `pnpm db:migrate` para aplicar as views e os
   privilégios.

Antes de iniciar o backend, confirme que o `.env` não contém mais usuário ou URL de owner/migrador.

`CHAVE_CIFRA` e `CHAVE_HMAC` são **duas chaves diferentes**: uma cifra telefone e e-mail, a
outra gera o HMAC que permite buscar por telefone sem decifrar a base inteira. Gere cada uma
com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Para conferir se o seu `.env` está completo:

```bash
pnpm --filter @lumens/backend env:check
```

Ele lista de uma vez todas as variáveis que faltam, ou confirma que o ambiente está válido.

## Site

```bash
pnpm --filter @lumens/site dev     # http://localhost:3000
pnpm --filter @lumens/site build   # build de produção
```

Homologação: [lumens-ufal.vercel.app](https://lumens-ufal.vercel.app). O endereço antigo
`lumens-hazel.vercel.app` continua respondendo, mas é o nome que a Vercel gerou sozinha quando
`lumens.vercel.app` já estava tomado — use o novo em links, cartões e mensagens (SCRUM-242).

Até o ambiente da AWS (1.1b), o site e o painel são publicados na Vercel pelo GitHub Actions.
Após o `check` passar na `main`, o job `deploy` publica os projetos `lumens` e `lumens-painel`
pela Vercel CLI. Isso mantém o deploy automático no plano Hobby mesmo com o repositório na
organização `lumens0`. O status e os logs do deploy ficam no GitHub Actions e na Vercel.

O repositório precisa dos secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_SITE_PROJECT_ID` e `VERCEL_PAINEL_PROJECT_ID`. Na Vercel, os diretórios raiz dos
projetos continuam sendo `apps/site` e `apps/painel`, respectivamente.

## Painel de curadoria

O painel é um app separado do site público. Esta base ainda não autentica nem permite ações de
curadoria; o login por link no e-mail entra na SCRUM-164.

```bash
pnpm --filter @lumens/painel dev     # http://localhost:3002
pnpm --filter @lumens/painel build   # build de produção
```

Homologação: [lumens-painel.vercel.app](https://lumens-painel.vercel.app).

Na Vercel, o projeto do painel usa `apps/painel` como diretório raiz. Assim, site e painel têm
deploys e configurações independentes mesmo compartilhando o monorepo.

## Bot (parte 2)

```bash
pnpm db:up && pnpm db:migrate   # banco com as tabelas do bot
pnpm dev                        # servidor em :3001 (PORT do .env)
pnpm sim texto 'buraco no bloco 12'
```

O `pnpm dev` valida o ambiente e sobe o Fastify com o webhook da Meta (`GET`/`POST /webhook`)
e a fila. O schema `pgboss` é instalado por `pnpm db:migrate` com a URL administrativa; o backend
usa somente o login restrito. O simulador assina com o
`META_APP_SECRET` do `.env`, então dá para testar o webhook (assinatura, dedup e fila) sem celular
nem conta Meta: veja [apps/backend/SIMULADOR.md](apps/backend/SIMULADOR.md).

O job de cada mensagem não leva telefone nem wamid em claro (o wamid da Meta codifica o
telefone): vão como HMAC da `CHAVE_HMAC`, para achar a conversa, e cifrados com a `CHAVE_CIFRA`,
para o worker responder.

Um worker consome a fila `incoming-message` e anda a conversa. O novo estado, as respostas (na
fila `outgoing-replies`) e a conclusão do job entram na mesma transação: se o processo cair no
meio, a mensagem é reentregue em até 1 minuto e aplicada uma vez só. Enquanto o envio pela Meta
não existe, as respostas aparecem no log do `pnpm dev` como `respostas do bot`, com o texto no
campo `texto`. Só o `pnpm dev` (flag `--dev`) mostra o texto; o `start` de produção registra
apenas quantas respostas saíram, porque uma resposta pode repetir o que a pessoa escreveu.

Em produção não há `.env` nem devDependencies: o ambiente vem da hospedagem e o servidor sobe
com `pnpm --filter @lumens/backend start` (migrações: `pnpm db:migrate`).

Pendências da parte 2:

- Envio das respostas pela API da Meta: trocar o `logSender` (`src/bot/worker.ts`) por um sender
  que decifra o telefone e chama a Cloud API.
- Handlers das histórias 2.4, 2.5 e 2.6 são placeholders (`TODO` em
  `src/bot/conversation/handlers.ts`).
- Verificar o webhook no painel da Meta e medir resposta < 5 s (critério de pronto da 2.1).

## API de leitura pública

O mesmo servidor do `pnpm dev` (`:3001`) serve a API REST só de leitura do site: `GET /resumo`,
`/blocos`, `/pautas`, `/pautas/:slug`, `/conquistas` e `/atividade`, sem login, pelo login
`lumens_site` (`DATABASE_URL_LEITURA`). As origens aceitas no CORS vêm de `CORS_ORIGENS`. Rotas,
campos e exemplos: [docs/api.md](docs/api.md). Os tipos das respostas ficam em `@lumens/contratos`.

## Como contribuir

- **Nunca** faça commit direto na `main`: toda mudança entra por pull request revisado.
- **Branches:** `tipo/SCRUM-<n>-descricao-curta`
  - ex.: `feat/SCRUM-77-esquema-inicial`, `fix/SCRUM-82-meta-batida-duplicada`
- **Pull requests:** o título inclui `[SCRUM-<n>]`, com a mesma chave usada na branch.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/) com a chave do Jira
  - ex.: `feat(dominio): calcula meta da pauta [SCRUM-82]`
  - tipos: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`
- Antes de abrir o PR, rode `pnpm check`.
- No VS Code, instale as extensões recomendadas (o editor sugere ao abrir a pasta).
