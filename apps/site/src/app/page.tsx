import { CardPauta } from '../componentes/CardPauta';
import exemplo from '../dados/exemplo.json';
import { pautasPublicas } from '../dados/pautas-publicas';
import type { DadosExemplo } from '../dados/tipos';
import estilos from './page.module.css';

// Dados de exemplo até a API de leitura (4.2b).
const { pautas } = exemplo as DadosExemplo;

export default function Home() {
  return (
    <main className={estilos.pagina}>
      <h1 className={estilos.titulo}>Lumens</h1>
      <p className={estilos.subtitulo}>Da reclamação à pauta.</p>
      <ul className={estilos.lista}>
        {pautasPublicas(pautas).map((pauta) => (
          <li key={pauta.slug}>
            <CardPauta pauta={pauta} />
          </li>
        ))}
      </ul>
    </main>
  );
}
