// Submete as mensagens modelo da Parte 3 à Meta (SCRUM-193).
// Uso: pnpm --filter @lumens/backend modelos --site <https://origem> [--so <nome>] [--enviar]
// Sem --enviar, só imprime os pedidos. Veja docs/meta/mensagens-modelo.md.
import { MODELOS, paraSubmissao, type NomeModelo } from '../src/bot/whatsapp/modelos';

const VERSAO_GRAPH = 'v23.0';

const USAGE = `Uso: pnpm --filter @lumens/backend modelos --site <https://origem> [opções]

Opções:
  --site <url>      origem pública do site, usada no botão "Ver a pauta" (obrigatória)
  --so <nome>       submete só este modelo (padrão: todos)
  --enviar          envia à Meta; sem isto, só imprime os pedidos
  --versao <v>      versão da Graph API (padrão ${VERSAO_GRAPH})

Para --enviar: META_TOKEN e META_WABA_ID no ambiente (o .env da raiz é carregado).

Modelos: ${Object.keys(MODELOS).join(', ')}`;

function sair(mensagem: string): never {
  console.error(mensagem);
  process.exit(1);
}

function lerOpcoes(args: string[]) {
  const opcoes = {
    site: '',
    so: undefined as string | undefined,
    enviar: false,
    versao: VERSAO_GRAPH,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    const valor = () => args[++i] ?? sair(`${arg} precisa de um valor\n\n${USAGE}`);
    if (arg === '--site') opcoes.site = valor();
    else if (arg === '--so') opcoes.so = valor();
    else if (arg === '--versao') opcoes.versao = valor();
    else if (arg === '--enviar') opcoes.enviar = true;
    else if (arg === '--help' || arg === '-h') sair(USAGE);
    else sair(`opção desconhecida: ${arg}\n\n${USAGE}`);
  }
  if (opcoes.site === '') sair(`--site é obrigatória\n\n${USAGE}`);
  return opcoes;
}

const opcoes = lerOpcoes(process.argv.slice(2));

if (opcoes.so !== undefined && !(opcoes.so in MODELOS)) {
  sair(`modelo desconhecido: ${opcoes.so}\n\n${USAGE}`);
}
const escolhidos =
  opcoes.so === undefined ? Object.values(MODELOS) : [MODELOS[opcoes.so as NomeModelo]];

let pedidos;
try {
  pedidos = escolhidos.map((modelo) => paraSubmissao(modelo, opcoes.site));
} catch (erro) {
  sair(erro instanceof Error ? erro.message : String(erro));
}

if (!opcoes.enviar) {
  console.log(JSON.stringify(pedidos, null, 2));
  console.log(`\n(dry-run: ${String(pedidos.length)} modelo(s); use --enviar para submeter)`);
  process.exit(0);
}

const token = process.env.META_TOKEN;
const waba = process.env.META_WABA_ID;
if (!token || !waba) sair('META_TOKEN e META_WABA_ID precisam estar no ambiente para --enviar');

let falhas = 0;
for (const pedido of pedidos) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${opcoes.versao}/${waba}/message_templates`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(pedido),
      },
    );
    const corpo = await res.text();
    if (res.ok) {
      // A Meta devolve { id, status, category }. A categoria pode vir diferente
      // da pedida: é o primeiro sinal de que o texto foi lido como marketing.
      console.log(`${pedido.name}: ${corpo}`);
    } else {
      falhas++;
      console.error(`${pedido.name}: HTTP ${String(res.status)} ${corpo}`);
    }
  } catch (erro) {
    falhas++;
    console.error(`${pedido.name}: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}
process.exit(falhas > 0 ? 1 : 0);
