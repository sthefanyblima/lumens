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

CI (T3) e documentação completa (T21) entram nas próximas tasks.

## Banco local

Pré-requisito: **Docker Desktop** aberto e rodando.

```bash
cp .env.example .env   # só na primeira vez
pnpm db:up
```

| Comando           | O que faz                                                |
| ----------------- | -------------------------------------------------------- |
| `pnpm db:up`      | Sobe o PostgreSQL e só retorna quando ele aceita conexão |
| `pnpm db:down`    | Derruba o container, preservando os dados                |
| `pnpm db:reset`   | Apaga o volume e sobe do zero (recria o `lumens_test`)   |
| `pnpm db:migrate` | Aplica as migrações de `packages/db/migracoes/`          |

Conferir que o banco respondeu:

```bash
docker compose exec postgres psql -U lumens -d lumens -c 'select 1'
```

São dois bancos no mesmo container: `lumens`, para desenvolvimento, e `lumens_test`, para os
testes de integração — criado pelos scripts de `docker/init/`, que rodam uma única vez, na
criação do volume. Se editar algum deles, use `pnpm db:reset`.

A versão do PostgreSQL é fixada no `docker-compose.yml` e precisa acompanhar a do banco de
homologação, que será definida na T20.

### Variáveis de ambiente

Todas as variáveis estão documentadas no `.env.example`, uma a uma. O `.env` é ignorado pelo git
e nunca deve ser commitado; em produção os segredos vivem no cofre da hospedagem e no CI.

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

### Esquema e migrações

O esquema fica em `packages/db/src/schema.ts` (Drizzle). Depois de mudar o esquema, gere a
migração e aplique:

```bash
pnpm --filter @lumens/db generate   # cria o SQL em packages/db/migracoes/
pnpm db:migrate
```

Nunca edite à mão um SQL que já foi aplicado: gere uma migração nova.

## Bot (parte 2)

```bash
pnpm db:up && pnpm db:migrate   # banco com as tabelas do bot
pnpm dev                        # servidor em :3001 (PORT do .env)
pnpm sim texto 'buraco no bloco 12'
```

O `pnpm dev` valida o ambiente e sobe o Fastify com o webhook da Meta (`GET`/`POST /webhook`)
e a fila (pg-boss, que cria o próprio schema `pgboss` no banco). O simulador assina com o
`META_APP_SECRET` do `.env`, então dá para testar o webhook (assinatura, dedup e fila) sem celular
nem conta Meta: veja [apps/backend/SIMULADOR.md](apps/backend/SIMULADOR.md).

O job de cada mensagem não leva telefone nem wamid em claro (o wamid da Meta codifica o
telefone): vão como HMAC da `CHAVE_HMAC`, para achar a conversa, e cifrados com a `CHAVE_CIFRA`,
para o worker responder.

Um worker consome a fila `incoming-message` e anda a conversa. O novo estado, as respostas (na
fila `outgoing-replies`) e a conclusão do job entram na mesma transação: se o processo cair no
meio, a mensagem é reentregue em até 1 minuto e aplicada uma vez só. Enquanto o envio pela Meta
não existe, as respostas aparecem no log do `pnpm dev` como `respostas do bot`.

Em produção não há `.env` nem devDependencies: o ambiente vem da hospedagem e o servidor sobe
com `pnpm --filter @lumens/backend start` (migrações: `pnpm db:migrate`).

Pendências da parte 2:

- Envio das respostas pela API da Meta: trocar o `logSender` (`src/bot/worker.ts`) por um sender
  que decifra o telefone e chama a Cloud API.
- Handlers das histórias 2.4, 2.5 e 2.6 são placeholders (`TODO` em
  `src/bot/conversation/handlers.ts`).
- Verificar o webhook no painel da Meta e medir resposta < 5 s (critério de pronto da 2.1).

## Como contribuir

- **Nunca** faça commit direto na `main`: toda mudança entra por pull request revisado.
- **Branches:** `tipo/SCRUM-<n>-descricao-curta`
  - ex.: `feat/SCRUM-77-esquema-inicial`, `fix/SCRUM-82-meta-batida-duplicada`
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/) com a chave do Jira
  - ex.: `feat(dominio): calcula meta da pauta [SCRUM-82]`
  - tipos: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`
- Antes de abrir o PR, rode `pnpm check`.
- No VS Code, instale as extensões recomendadas (o editor sugere ao abrir a pasta).
