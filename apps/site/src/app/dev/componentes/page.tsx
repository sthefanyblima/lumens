import type { Metadata } from 'next';
import { CardPauta } from '../../../componentes/CardPauta';
import { PAUTAS_TESTE } from '../../../dados/pautas-teste';

export const metadata: Metadata = {
  title: 'Componentes · Lumens',
  robots: { index: false },
};

// Rota de rascunho: os componentes base em todos os status, com as pautas de teste.
export default function Componentes() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ fontFamily: 'var(--fonte-titulo)', margin: 0 }}>Componentes</h1>
      {PAUTAS_TESTE.map((pauta) => (
        <CardPauta key={pauta.slug} pauta={pauta} />
      ))}
    </main>
  );
}
