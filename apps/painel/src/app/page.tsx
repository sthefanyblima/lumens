import estilos from './page.module.css';

export default function Home() {
  return (
    <main className={estilos.pagina}>
      <section className={estilos.cartao} aria-labelledby="titulo-painel">
        <p className={estilos.marca}>Lumens</p>
        <h1 id="titulo-painel">Painel de curadoria</h1>
        <p className={estilos.descricao}>
          Área restrita para análise e acompanhamento das pautas estudantis.
        </p>
        <p className={estilos.estado} role="status">
          O acesso por e-mail será habilitado na próxima etapa.
        </p>
      </section>
    </main>
  );
}
