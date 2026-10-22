import { defaultHandlers, MENU_TEXT, normalize, type HandlerRegistry } from './handlers';
import { hashPhone } from './phone';
import { assertTransition, type Step } from './steps';
import type { ConversationData, ConversationStore } from './store';

export interface RouterDeps {
  store: ConversationStore;
  /** Bytes da CHAVE_HMAC, para o HMAC do telefone. */
  phoneKey: Buffer;
  handlers?: HandlerRegistry;
}

export const CANCEL_TEXT = 'Ok, cancelei.';

type GlobalCommand = 'menu' | 'cancelar';

export function parseGlobalCommand(text: string): GlobalCommand | null {
  const t = normalize(text);
  return t === 'menu' || t === 'cancelar' ? t : null;
}

/** Processa uma mensagem de texto e devolve as respostas a enviar. */
export async function handleIncoming(
  msg: { phone: string; text: string },
  deps: RouterDeps,
): Promise<string[]> {
  const { store } = deps;
  const handlers = deps.handlers ?? defaultHandlers;
  const phoneHmac = hashPhone(msg.phone, deps.phoneKey);
  const current = await store.get(phoneHmac);

  const cmd = parseGlobalCommand(msg.text);
  if (cmd === 'cancelar') {
    // 'cancelar' limpa tudo, inclusive pendingCommand.
    await store.save(phoneHmac, 'MENU', {});
    return [CANCEL_TEXT, MENU_TEXT];
  }
  if (cmd === 'menu') {
    // 'menu' recomeça mas preserva o comando pendente.
    const pending = current?.data.pendingCommand;
    await store.save(phoneHmac, 'MENU', pending ? { pendingCommand: pending } : {});
    return [MENU_TEXT];
  }

  const state: { step: Step; data: ConversationData } = current
    ? { step: current.step, data: current.data }
    : { step: 'GREETING', data: {} };

  const result = await handlers[state.step]({ state, input: { text: msg.text } });
  assertTransition(state.step, result.next);

  // Aplica o patch: chave com valor undefined sai dos dados.
  const data = Object.fromEntries(
    Object.entries({ ...state.data, ...result.data }).filter(([, v]) => v !== undefined),
  ) as ConversationData;
  await store.save(phoneHmac, result.next, data);
  return result.replies;
}
