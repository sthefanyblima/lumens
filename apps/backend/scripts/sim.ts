// Simulador de webhook da Meta: monta o payload, assina e envia ao bot.
// Uso: pnpm --filter @lumens/backend sim <tipo> [args...] [--from N] [--url U] [--wamid W]
//      [--secret S] [--dry-run]
// Veja SIMULADOR.md para exemplos. O .env da raiz é carregado pelo script `sim`.
import {
  DEFAULT_FROM,
  buildButtonReply,
  buildForwardedMessage,
  buildImageMessage,
  buildListReply,
  buildStatus,
  buildTextMessage,
} from '../src/bot/sim/payloads';
import { sendSigned, signPayload, urlPadrao } from '../src/bot/sim/send';
import type { MetaWebhookPayload } from '../src/bot/whatsapp/types';

const URL_PADRAO = urlPadrao(process.env.PORT);

const USAGE = `Uso: pnpm --filter @lumens/backend sim <tipo> [args...] [opções]

Tipos:
  texto <mensagem>            mensagem de texto
  encaminhada <mensagem>      texto com context.forwarded = true
  botao <id> <titulo>         resposta de botão (interactive.button_reply)
  lista <id> <titulo>         resposta de lista (interactive.list_reply)
  imagem [legenda]            imagem (mídia fictícia) com legenda opcional
  status <delivered|read>     evento de status (o webhook deve ignorar)

Opções:
  --from <numero>    remetente (padrão ${DEFAULT_FROM})
  --url <url>        destino (padrão ${URL_PADRAO})
  --wamid <id>       wamid fixo (para testar deduplicação)
  --secret <s>       segredo da assinatura (padrão: META_APP_SECRET do .env)
  --dry-run          só imprime payload e assinatura, não envia
  -h, --help         esta ajuda`;

interface Parsed {
  positional: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  const valued = new Set(['from', 'url', 'wamid', 'secret']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) break;
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a === '-h') {
      flags.help = true;
    } else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      if (eq >= 0) flags[key] = a.slice(eq + 1);
      else if (valued.has(key)) {
        const v = argv[++i];
        if (v === undefined) fail(`opção --${key} exige um valor`);
        flags[key] = v;
      } else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

function fail(msg: string): never {
  console.error(`erro: ${msg}\n\n${USAGE}`);
  process.exit(1);
}

function str(v: string | true | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function buildFromArgs(
  kind: string,
  args: string[],
  from: string,
  wamid: string | undefined,
): MetaWebhookPayload {
  const common = { from, wamid };
  switch (kind) {
    case 'texto':
    case 'encaminhada': {
      const body = args.join(' ');
      if (!body) fail(`${kind} exige o texto da mensagem`);
      return kind === 'texto'
        ? buildTextMessage({ ...common, body })
        : buildForwardedMessage({ ...common, body });
    }
    case 'botao':
    case 'lista': {
      const [id, ...rest] = args;
      const title = rest.join(' ');
      if (!id || !title) fail(`${kind} exige <id> <titulo>`);
      return kind === 'botao'
        ? buildButtonReply({ ...common, id, title })
        : buildListReply({ ...common, id, title });
    }
    case 'imagem': {
      const caption = args.join(' ');
      return buildImageMessage({ ...common, caption: caption || undefined });
    }
    case 'status': {
      const s = args[0];
      if (s !== 'delivered' && s !== 'read') fail('status exige delivered ou read');
      return buildStatus({ status: s, to: from, wamid });
    }
    default:
      fail(`tipo desconhecido: ${kind}`);
  }
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const [kind, ...args] = positional;
if (flags.help || kind === undefined) {
  console.log(USAGE);
  process.exit(flags.help ? 0 : 1);
}
const from = str(flags.from) ?? DEFAULT_FROM;
const url = str(flags.url) ?? URL_PADRAO;
const secret = str(flags.secret) ?? process.env.META_APP_SECRET;

const payload = buildFromArgs(kind, args, from, str(flags.wamid));

if (flags['dry-run'] === true) {
  console.log(JSON.stringify(payload, null, 2));
  if (secret) console.log(`\nX-Hub-Signature-256: ${signPayload(payload, secret).signature}`);
  else console.log('\n(sem META_APP_SECRET: assinatura não calculada)');
} else {
  if (!secret) fail('META_APP_SECRET ausente (defina no .env ou use --secret)');
  try {
    const res = await sendSigned(payload, { url, secret });
    console.log(`POST ${url} -> HTTP ${String(res.status)}`);
    if (res.body) console.log(res.body);
    if (res.status >= 400) process.exitCode = 1;
  } catch (err) {
    console.error(
      `falha ao enviar para ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  }
}
