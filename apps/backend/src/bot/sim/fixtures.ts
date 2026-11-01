// Fixtures do webhook: payloads determinísticos (wamid e timestamp fixos) salvos em
// __fixtures__/*.json. Gerar de novo: pnpm --filter @lumens/backend fixtures
import { fileURLToPath } from 'node:url';
import type { MetaWebhookPayload } from '../whatsapp/types';
import {
  buildButtonReply,
  buildForwardedMessage,
  buildImageMessage,
  buildListReply,
  buildStatus,
  buildTextMessage,
} from './payloads';

const FROM = '5582999990000';
const TS = '1767225600'; // 2026-01-01T00:00:00Z

export const FIXTURES_DIR = fileURLToPath(new URL('./__fixtures__', import.meta.url));

/** Nome do arquivo (sem .json) -> payload. */
export function fixtures(): Record<string, MetaWebhookPayload> {
  const comum = { from: FROM, timestamp: TS };
  return {
    texto: buildTextMessage({ ...comum, wamid: 'wamid.FIXTURE_TEXTO', body: 'buraco no bloco 12' }),
    encaminhada: buildForwardedMessage({
      ...comum,
      wamid: 'wamid.FIXTURE_ENCAMINHADA',
      body: 'URGENTE: repassem para todos os moradores',
    }),
    botao: buildButtonReply({
      ...comum,
      wamid: 'wamid.FIXTURE_BOTAO',
      id: 'confirmar',
      title: 'Confirmar',
    }),
    lista: buildListReply({
      ...comum,
      wamid: 'wamid.FIXTURE_LISTA',
      id: 'cat_iluminacao',
      title: 'Iluminação',
    }),
    imagem: buildImageMessage({
      ...comum,
      wamid: 'wamid.FIXTURE_IMAGEM',
      caption: 'poste apagado',
    }),
    'status-delivered': buildStatus({
      status: 'delivered',
      to: FROM,
      wamid: 'wamid.FIXTURE_STATUS',
      timestamp: TS,
    }),
  };
}
