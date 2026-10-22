import { stepEnum } from '@lumens/db';

/** Passo da conversa: espelha o enum `conversation_step` do banco. */
export type Step = (typeof stepEnum.enumValues)[number];

/** "Enum" de passos (objeto const), checado contra stepEnum em tempo de compilação. */
export const Step = {
  GREETING: 'GREETING',
  MENU: 'MENU',
  VERIFY_ASK_EMAIL: 'VERIFY_ASK_EMAIL',
  VERIFY_ASK_CODE: 'VERIFY_ASK_CODE',
  VERIFY_ASK_COURSE: 'VERIFY_ASK_COURSE',
  REPORT_ASK_TEXT: 'REPORT_ASK_TEXT',
  REPORT_ASK_BLOCK: 'REPORT_ASK_BLOCK',
  REPORT_PICK_SIMILAR: 'REPORT_PICK_SIMILAR',
  NEW_ASK_TITLE: 'NEW_ASK_TITLE',
  NEW_ASK_PLACE: 'NEW_ASK_PLACE',
  NEW_ASK_DESCRIPTION: 'NEW_ASK_DESCRIPTION',
  NEW_ASK_PHOTO: 'NEW_ASK_PHOTO',
} as const satisfies { [K in Step]: K };

export const STEPS: readonly Step[] = stepEnum.enumValues;

/** Próximos passos permitidos a partir de cada passo (fora os globais). */
export const TRANSITIONS: Record<Step, readonly Step[]> = {
  GREETING: ['MENU'],
  MENU: ['VERIFY_ASK_EMAIL', 'REPORT_ASK_TEXT', 'NEW_ASK_TITLE'],
  VERIFY_ASK_EMAIL: ['VERIFY_ASK_CODE'],
  VERIFY_ASK_CODE: ['VERIFY_ASK_COURSE', 'VERIFY_ASK_CODE'],
  VERIFY_ASK_COURSE: ['MENU'],
  REPORT_ASK_TEXT: ['REPORT_ASK_BLOCK', 'REPORT_PICK_SIMILAR'],
  REPORT_ASK_BLOCK: ['REPORT_PICK_SIMILAR'],
  REPORT_PICK_SIMILAR: ['MENU', 'NEW_ASK_TITLE'],
  NEW_ASK_TITLE: ['NEW_ASK_PLACE'],
  NEW_ASK_PLACE: ['NEW_ASK_DESCRIPTION'],
  NEW_ASK_DESCRIPTION: ['NEW_ASK_PHOTO'],
  NEW_ASK_PHOTO: ['MENU'],
};

/** Qualquer passo pode ir para estes via comandos globais ('menu', 'cancelar'). */
export const GLOBAL_TARGETS: readonly Step[] = ['GREETING', 'MENU'];

export class InvalidTransitionError extends Error {
  readonly from: Step;
  readonly to: Step;
  constructor(from: Step, to: Step) {
    super(`Transição inválida: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function canTransition(from: Step, to: Step): boolean {
  return GLOBAL_TARGETS.includes(to) || TRANSITIONS[from].includes(to);
}

/** Lança InvalidTransitionError se `from → to` não for permitido. */
export function assertTransition(from: Step, to: Step): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
