# Simulador de webhook (Meta / WhatsApp Cloud API)

Monta payloads no formato do webhook da Meta, assina com HMAC-SHA256 usando o
mesmo `META_APP_SECRET` do `.env` da raiz (header `X-Hub-Signature-256`) e faz `POST` no bot.
Permite testar o fluxo inteiro sem celular nem conta Meta.

## Uso

```sh
pnpm sim <tipo> [args...] [opções]   # atalho da raiz para pnpm --filter @lumens/backend sim
```

| Tipo                       | O que envia                                  |
| -------------------------- | -------------------------------------------- |
| `texto <mensagem>`         | mensagem de texto                            |
| `encaminhada <mensagem>`   | texto com `context.forwarded: true`          |
| `botao <id> <titulo>`      | `interactive.button_reply`                   |
| `lista <id> <titulo>`      | `interactive.list_reply`                     |
| `imagem [legenda]`         | imagem (mídia fictícia) com legenda opcional |
| `status <delivered\|read>` | evento de status (o webhook deve ignorar)    |

| Opção             | Padrão                                           |
| ----------------- | ------------------------------------------------ |
| `--from <numero>` | `5582999990000`                                  |
| `--url <url>`     | `http://localhost:<PORT do .env>/webhook` (3001) |
| `--wamid <id>`    | aleatório (fixe para testar deduplicação)        |
| `--secret <s>`    | `META_APP_SECRET` do `.env`                      |
| `--dry-run`       | só imprime payload e assinatura, não envia       |

Rode da raiz do repositório: o script carrega o `.env` da raiz (`--env-file-if-exists`).
A saída mostra o status HTTP da resposta; o processo sai com código 1 se o
status for >= 400 ou se o envio falhar.

## Exemplos

```sh
# Relato simples
pnpm sim texto 'buraco no bloco 12' --from 5582988887777

# Mensagem encaminhada
pnpm sim encaminhada 'URGENTE: repassem para todos'

# Respostas interativas
pnpm sim botao confirmar Confirmar
pnpm sim lista cat_iluminacao 'Iluminação'

# Imagem com legenda
pnpm sim imagem 'poste apagado'

# Deduplicação: envie duas vezes com o mesmo wamid
pnpm sim texto 'oi' --wamid wamid.TESTE1
pnpm sim texto 'oi' --wamid wamid.TESTE1

# Status (deve ser ignorado pelo webhook)
pnpm sim status delivered

# Ver o payload e a assinatura sem enviar
pnpm sim texto 'oi' --dry-run

# Outro destino / segredo
pnpm sim texto 'oi' --url https://staging.exemplo/webhook --secret outro-segredo
```

## Uso programático

```ts
import { buildTextMessage } from './src/bot/sim/payloads';
import { sendSigned, signPayload } from './src/bot/sim/send';

const payload = buildTextMessage({ body: 'oi', from: '5582999990000', wamid: 'wamid.X' });
const { body, signature } = signPayload(payload, 'segredo'); // para injetar no Fastify
await sendSigned(payload, { url: 'http://localhost:3001/webhook', secret: 'segredo' });
```

Construtores disponíveis em `src/bot/sim/payloads.ts`: `buildTextMessage`,
`buildForwardedMessage`, `buildButtonReply`, `buildListReply`,
`buildImageMessage`, `buildStatus` e `wrapPayload` (envelope genérico).

## Fixtures

`src/bot/sim/__fixtures__/*.json` (`texto`, `encaminhada`, `botao`, `lista`, `imagem`,
`status-delivered`) são geradas de forma determinística (wamid e timestamp fixos)
e reutilizadas nos testes do webhook. Para regenerar:

```sh
pnpm --filter @lumens/backend fixtures && pnpm format
```

O teste `src/bot/sim/sim.test.ts` garante que as fixtures continuam iguais à saída
dos construtores.
