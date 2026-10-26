import type { ConversationData, ConversationState } from './store';
import { TRANSITIONS, type Step } from './steps';

/** Mensagem recebida. Foto chega com `text` vazio e o `image`. */
export interface IncomingMessage {
  text: string;
  /** Foto enviada pela pessoa. `id` é o id da mídia na Meta (baixada depois, na 2.6). */
  image?: { id: string; mimeType: string };
}

export interface StepContext {
  /** Estado atual (passo + dados). Para usuário novo, step = GREETING e data = {}. */
  state: Pick<ConversationState, 'step' | 'data'>;
  input: IncomingMessage;
}

/** Patch raso aplicado sobre state.data: chave com undefined remove. */
export type DataPatch = { [K in keyof ConversationData]?: ConversationData[K] | undefined };

export interface StepResult {
  next: Step;
  data?: DataPatch;
  replies: string[];
}

/** Pode ser síncrono; os handlers das histórias 2.4–2.6 vão consultar o banco. */
export type StepHandler = (ctx: StepContext) => StepResult | Promise<StepResult>;
export type HandlerRegistry = Record<Step, StepHandler>;

export const GREETING_TEXT = 'Olá! Eu sou o Lumens, o canal para melhorar o campus.';
export const MENU_TEXT = [
  'O que você quer fazer?',
  '1 Relatar problema',
  '2 Nova pauta',
  '3 Verificar e-mail',
].join('\n');

/**
 * Remove acentos, caixa, espaços das pontas e a pontuação do fim: "Cancelar." e "1)" valem
 * como "cancelar" e "1".
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[\s.!?,;:)\]-]+$/u, '');
}

const greeting: StepHandler = () => ({ next: 'MENU', replies: [GREETING_TEXT, MENU_TEXT] });

const MENU_OPTIONS: Record<string, { next: Step; reply: string }> = {
  '1': { next: 'REPORT_ASK_TEXT', reply: 'Descreva o problema que você encontrou.' },
  '2': { next: 'NEW_ASK_TITLE', reply: 'Qual o título da sua pauta?' },
  '3': { next: 'VERIFY_ASK_EMAIL', reply: 'Qual o seu e-mail institucional?' },
};
const MENU_ALIASES: Record<string, string> = {
  relatar: '1',
  'relatar problema': '1',
  'nova pauta': '2',
  pauta: '2',
  verificar: '3',
  'verificar e-mail': '3',
  'verificar email': '3',
};

const menu: StepHandler = ({ input }) => {
  const t = normalize(input.text);
  const opt = MENU_OPTIONS[MENU_ALIASES[t] ?? t];
  if (!opt) return { next: 'MENU', replies: ['Não entendi. Responda com 1, 2 ou 3.', MENU_TEXT] };
  return { next: opt.next, replies: [opt.reply] };
};

/**
 * Placeholder: avança para o primeiro próximo passo permitido. Não ecoa a entrada: a resposta
 * vai para a fila e para o log, e a entrada pode ser o e-mail ou o relato da pessoa.
 */
function placeholder(step: Step, story: string): StepHandler {
  // TODO(story): substituir pelo handler real.
  const next = TRANSITIONS[step][0];
  if (!next) throw new Error(`${step} não tem próximo passo em TRANSITIONS`);
  return () => ({
    next,
    replies: [`[${step} — em construção, história ${story}] Recebi sua mensagem.`],
  });
}

export const PHOTO_ASK_TEXT = "Envie uma foto do problema, ou responda 'pular'.";
export const PHOTO_RECEIVED_TEXT = 'Foto recebida, obrigado!';
const SKIP_WORDS = new Set(['pular', 'nao', 'sem foto']);

/** Pede a foto da nova pauta. Aceita a foto ou "pular"; qualquer outro texto pede de novo. */
const newAskPhoto: StepHandler = ({ input }) => {
  // TODO(2.6): baixar a mídia da Meta e passar por removerMetadados antes de guardar.
  if (input.image) {
    return {
      next: 'MENU',
      data: { fotoMediaId: input.image.id },
      replies: [PHOTO_RECEIVED_TEXT],
    };
  }
  if (SKIP_WORDS.has(normalize(input.text))) return { next: 'MENU', replies: ['Ok, sem foto.'] };
  return { next: 'NEW_ASK_PHOTO', replies: [PHOTO_ASK_TEXT] };
};

export const defaultHandlers: HandlerRegistry = {
  GREETING: greeting,
  MENU: menu,
  // TODO(2.4): verificação de e-mail institucional.
  VERIFY_ASK_EMAIL: placeholder('VERIFY_ASK_EMAIL', '2.4'),
  VERIFY_ASK_CODE: placeholder('VERIFY_ASK_CODE', '2.4'),
  VERIFY_ASK_COURSE: placeholder('VERIFY_ASK_COURSE', '2.4'),
  // TODO(2.5): relatar problema / escolher similar.
  REPORT_ASK_TEXT: placeholder('REPORT_ASK_TEXT', '2.5'),
  REPORT_ASK_BLOCK: placeholder('REPORT_ASK_BLOCK', '2.5'),
  REPORT_PICK_SIMILAR: placeholder('REPORT_PICK_SIMILAR', '2.5'),
  // TODO(2.6): nova pauta.
  NEW_ASK_TITLE: placeholder('NEW_ASK_TITLE', '2.6'),
  NEW_ASK_PLACE: placeholder('NEW_ASK_PLACE', '2.6'),
  NEW_ASK_DESCRIPTION: placeholder('NEW_ASK_DESCRIPTION', '2.6'),
  NEW_ASK_PHOTO: newAskPhoto,
};
