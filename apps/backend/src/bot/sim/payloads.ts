// Construtores de payloads do webhook da WhatsApp Cloud API, usados pelo
// simulador (scripts/sim.ts), pelo gerador de fixtures e pelos testes.
import { randomBytes } from 'node:crypto';
import type { MetaMessage, MetaStatus, MetaWebhookPayload } from '../whatsapp/types';

export const DEFAULT_FROM = '5582999990000';
export const DEFAULT_PHONE_NUMBER_ID = '100000000000001';
export const DEFAULT_DISPLAY_PHONE = '558230000000';
export const DEFAULT_WABA_ID = '200000000000002';
export const DEFAULT_PROFILE_NAME = 'Morador Simulado';

/** Opções comuns a todas as mensagens simuladas. */
export interface BaseOpts {
  /** Número do remetente (wa_id). Padrão: 5582999990000. */
  from?: string | undefined;
  /** wamid fixo (útil para testar deduplicação). Padrão: aleatório. */
  wamid?: string | undefined;
  /** Timestamp Unix em segundos (string, como a Meta envia). Padrão: agora. */
  timestamp?: string | undefined;
  /** Nome do perfil do contato. */
  name?: string | undefined;
}

/** Gera um wamid com formato parecido com o real. */
export function randomWamid(): string {
  return 'wamid.SIM' + randomBytes(16).toString('hex').toUpperCase();
}

function nowTs(): string {
  return String(Math.floor(Date.now() / 1000));
}

function base(opts: BaseOpts) {
  return {
    id: opts.wamid ?? randomWamid(),
    from: opts.from ?? DEFAULT_FROM,
    timestamp: opts.timestamp ?? nowTs(),
  };
}

/** Envolve mensagens/status no envelope `object/entry/changes/value` da Meta. */
export function wrapPayload(
  content: { messages?: MetaMessage[]; statuses?: MetaStatus[] },
  opts: { from?: string | undefined; name?: string | undefined } = {},
): MetaWebhookPayload {
  const from = opts.from ?? DEFAULT_FROM;
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: DEFAULT_WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: DEFAULT_DISPLAY_PHONE,
                phone_number_id: DEFAULT_PHONE_NUMBER_ID,
              },
              ...(content.messages
                ? {
                    contacts: [
                      { profile: { name: opts.name ?? DEFAULT_PROFILE_NAME }, wa_id: from },
                    ],
                    messages: content.messages,
                  }
                : {}),
              ...(content.statuses ? { statuses: content.statuses } : {}),
            },
          },
        ],
      },
    ],
  };
}

function wrapMessage(msg: MetaMessage, opts: BaseOpts): MetaWebhookPayload {
  return wrapPayload({ messages: [msg] }, { from: msg.from, name: opts.name });
}

/** Mensagem de texto comum. */
export function buildTextMessage(opts: BaseOpts & { body: string }): MetaWebhookPayload {
  return wrapMessage({ ...base(opts), type: 'text', text: { body: opts.body } }, opts);
}

/** Mensagem de texto encaminhada (`context.forwarded: true`). */
export function buildForwardedMessage(
  opts: BaseOpts & { body: string; frequentlyForwarded?: boolean },
): MetaWebhookPayload {
  const context: MetaMessage['context'] = { forwarded: true };
  if (opts.frequentlyForwarded) context.frequently_forwarded = true;
  return wrapMessage({ ...base(opts), context, type: 'text', text: { body: opts.body } }, opts);
}

/** Resposta de botão interativo (`interactive.button_reply`). */
export function buildButtonReply(
  opts: BaseOpts & { id: string; title: string },
): MetaWebhookPayload {
  return wrapMessage(
    {
      ...base(opts),
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: opts.id, title: opts.title } },
    },
    opts,
  );
}

/** Resposta de lista interativa (`interactive.list_reply`). */
export function buildListReply(
  opts: BaseOpts & { id: string; title: string; description?: string | undefined },
): MetaWebhookPayload {
  const list_reply: { id: string; title: string; description?: string } = {
    id: opts.id,
    title: opts.title,
  };
  if (opts.description !== undefined) list_reply.description = opts.description;
  return wrapMessage(
    { ...base(opts), type: 'interactive', interactive: { type: 'list_reply', list_reply } },
    opts,
  );
}

/** Mensagem de imagem (mídia fictícia), com legenda opcional. */
export function buildImageMessage(
  opts: BaseOpts & {
    caption?: string | undefined;
    mediaId?: string;
    mimeType?: string;
    sha256?: string;
  },
): MetaWebhookPayload {
  const image: { id: string; mime_type: string; sha256: string; caption?: string } = {
    id: opts.mediaId ?? '900000000000009',
    mime_type: opts.mimeType ?? 'image/jpeg',
    sha256: opts.sha256 ?? 'c2ltdWxhZG9yLWx1bWVucy1pbWFnZW0tZmljdGljaWE=',
  };
  if (opts.caption !== undefined) image.caption = opts.caption;
  return wrapMessage({ ...base(opts), type: 'image', image }, opts);
}

/**
 * Evento de status (delivered/read/...). O webhook do Lumens ignora esses
 * eventos — o construtor existe para testar justamente esse comportamento.
 * `wamid` aqui é o id da mensagem enviada pelo bot; `to` é o destinatário.
 */
export function buildStatus(opts: {
  status: MetaStatus['status'];
  to?: string | undefined;
  wamid?: string | undefined;
  timestamp?: string | undefined;
}): MetaWebhookPayload {
  return wrapPayload({
    statuses: [
      {
        id: opts.wamid ?? randomWamid(),
        status: opts.status,
        timestamp: opts.timestamp ?? nowTs(),
        recipient_id: opts.to ?? DEFAULT_FROM,
      },
    ],
  });
}
