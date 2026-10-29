import { formatarNumero } from '../componentes/BarraApoios';
import { CardPauta } from '../componentes/CardPauta';
import { FiltroBloco } from '../componentes/FiltroBloco';
import exemplo from '../dados/exemplo.json';
import { blocoDaUrl, pautasPublicas, totais } from '../dados/pautas-publicas';
import type { DadosExemplo } from '../dados/tipos';
import estilos from './page.module.css';

// Dados de exemplo até a API de leitura (4.2b).
const { blocos, pautas } = exemplo as DadosExemplo;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ bloco?: string | string[] }>;
}) {
  const bloco = blocoDaUrl(blocos, (await searchParams).bloco);
  const lista = pautasPublicas(pautas, bloco);
  const { abertas, apoios, conquistas } = totais(lista);
  return (
    <main className={estilos.pagina}>
      <h1 className={estilos.titulo}>Lumens</h1>
      <p className={estilos.subtitulo}>Da reclamação à pauta.</p>
      <FiltroBloco blocos={blocos} atual={bloco?.slug} />
      {/* Os totais acompanham o filtro: o título é o nome do bloco escolhido. */}
      <section className={estilos.totais} aria-labelledby="totais-titulo" aria-live="polite">
        <h2 id="totais-titulo" className={estilos.totaisTitulo}>
          {bloco?.nome ?? 'Todo o campus'}
        </h2>
        <dl>
          <div>
            <dt>Pautas abertas</dt>
            <dd>{formatarNumero(abertas)}</dd>
          </div>
          <div>
            <dt>Apoios</dt>
            <dd>{formatarNumero(apoios)}</dd>
          </div>
          <div>
            <dt>Conquistas</dt>
            <dd>{formatarNumero(conquistas)}</dd>
          </div>
        </dl>
      </section>
      <ul className={estilos.lista}>
        {lista.map((pauta) => (
          <li key={pauta.slug}>
            <CardPauta pauta={pauta} />
          </li>
        ))}
      </ul>
    </main>
  );
}
