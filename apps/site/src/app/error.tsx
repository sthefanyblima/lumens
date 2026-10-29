'use client';

import estilos from '../componentes/componentes.module.css';
import pagina from './page.module.css';

/** Falha ao carregar a página: o `retry` do Next busca e renderiza de novo. */
export default function Erro({ retry }: { retry: () => void }) {
  return (
    <main className={pagina.pagina}>
      <div role="alert" className={estilos.estado}>
        <p className={estilos.estadoTitulo}>Não deu para carregar as pautas.</p>
        <p>Pode ser a conexão ou o servidor. Tente de novo em instantes.</p>
        <div className={estilos.acoes}>
          <button type="button" className={estilos.botao} onClick={retry}>
            Tentar de novo
          </button>
        </div>
      </div>
    </main>
  );
}
