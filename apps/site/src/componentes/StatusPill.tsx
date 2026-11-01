import type { StatusPauta } from '../dados/tipos';
import estilos from './componentes.module.css';

// Cores do protótipo. A cor nunca é o único sinal: a pill sempre mostra o rótulo.
export const STATUS: Record<StatusPauta, { rotulo: string; fundo: string; texto: string }> = {
  em_curadoria: { rotulo: 'Em curadoria', fundo: '#EDE7F7', texto: '#1E1433' },
  recusada: { rotulo: 'Recusada', fundo: '#ECE7E0', texto: '#2F2A3A' },
  juntando_apoios: { rotulo: 'Juntando apoios', fundo: '#F3EFFA', texto: '#5A22C8' },
  meta_batida: { rotulo: 'Meta batida', fundo: '#FFF1D1', texto: '#1E1433' },
  cobrando: { rotulo: 'Cobrando', fundo: '#FFD84D', texto: '#1E1433' },
  prometido: { rotulo: 'Prometido', fundo: '#E4DCF3', texto: '#46337A' },
  entregue_em_parte: { rotulo: 'Entregue em parte', fundo: '#E4F7D8', texto: '#0B5E57' },
  descumprida: { rotulo: 'Descumprida', fundo: '#FDE8E8', texto: '#A3101A' },
  conquistada: { rotulo: 'Conquistada', fundo: '#E3F2F0', texto: '#0B5E57' },
};

export function StatusPill({ status }: { status: StatusPauta }) {
  const { rotulo, fundo, texto } = STATUS[status];
  return (
    <span className={estilos.pill} style={{ background: fundo, color: texto }}>
      {rotulo}
    </span>
  );
}
