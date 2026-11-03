import Link from 'next/link';
import type { Pauta } from '../dados/tipos';
import { BarraApoios } from './BarraApoios';
import estilos from './componentes.module.css';
import { StatusPill } from './StatusPill';

export function CardPauta({ pauta }: { pauta: Pauta }) {
  const id = `pauta-${pauta.slug}`;
  return (
    <article className={estilos.card} aria-labelledby={id}>
      <span className={estilos.contexto}>
        {pauta.categoria} · {pauta.bloco_nome ?? 'Todo o campus'}
      </span>
      <h2 id={id} className={estilos.titulo}>
        <Link href={`/p/${pauta.slug}`}>{pauta.titulo}</Link>
      </h2>
      <StatusPill status={pauta.status} />
      <BarraApoios apoios={pauta.apoios} meta={pauta.meta} rotulo={`Apoios: ${pauta.titulo}`} />
    </article>
  );
}
