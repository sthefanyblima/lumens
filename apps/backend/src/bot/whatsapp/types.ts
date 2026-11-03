// Subconjunto do payload do webhook da WhatsApp Cloud API usado pelo Lumens.
export interface MetaWebhookPayload {
  object: 'whatsapp_business_account';
  entry: MetaEntry[];
}
export interface MetaEntry {
  id: string;
  changes: { field: 'messages'; value: MetaChangeValue }[];
}
export interface MetaChangeValue {
  messaging_product: 'whatsapp';
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: { profile: { name: string }; wa_id: string }[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}
export type MetaMessage = {
  id: string; // wamid
  from: string;
  timestamp: string;
  context?: { forwarded?: boolean; frequently_forwarded?: boolean; from?: string; id?: string };
} & (
  | { type: 'text'; text: { body: string } }
  | { type: 'image'; image: { id: string; mime_type: string; sha256: string; caption?: string } }
  | {
      type: 'interactive';
      interactive:
        | { type: 'button_reply'; button_reply: { id: string; title: string } }
        | { type: 'list_reply'; list_reply: { id: string; title: string; description?: string } };
    }
);
export interface MetaStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}
