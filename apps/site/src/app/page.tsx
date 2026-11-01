import { formatarNumero } from '../componentes/BarraApoios';
import { CardPauta } from '../componentes/CardPauta';
import exemplo from '../dados/exemplo.json';
import { pautasPublicas, totais } from '../dados/pautas-publicas';
import type { DadosExemplo } from '../dados/tipos';
import estilos from './page.module.css';

// Dados de exemplo até a API de leitura (4.2b).
const { pautas } = exemplo as DadosExemplo;

export default function Home() {
  const lista = pautasPublicas(pautas);
  const { abertas, apoios, conquistas } = totais(lista);
  return (
    <main className={estilos.pagina}>
      <h1 className={estilos.titulo}>Lumens</h1>
      <p className={estilos.subtitulo}>Da reclamação à pauta.</p>
      {/* Os totais acompanham o filtro de bloco (4.1c): o título vira o nome do bloco. */}
      <section className={estilos.totais} aria-labelledby="totais-titulo">
        <h2 id="totais-titulo" className={estilos.totaisTitulo}>
          Todo o campus
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
