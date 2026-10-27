import estilos from './componentes.module.css';

const numero = new Intl.NumberFormat('pt-BR');

export const formatarNumero = (n: number) => numero.format(n);

/** Progresso até a meta, em %, sem passar de 100 mesmo com apoios acima da meta. */
export function percentual(apoios: number, meta: number): number {
  return Math.min(100, Math.round((apoios / meta) * 100));
}

/** `rotulo` é o nome acessível da barra: diz de qual pauta são os apoios. */
export function BarraApoios({
  apoios,
  meta,
  rotulo,
}: {
  apoios: number;
  meta: number;
  rotulo: string;
}) {
  const legenda = `${formatarNumero(apoios)} de ${formatarNumero(meta)} apoios`;
  return (
    <div className={estilos.barra}>
      <div
        className={estilos.trilho}
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentual(apoios, meta)}
        aria-valuetext={legenda}
      >
        <div
          className={estilos.preenchimento}
          style={{ width: `${String(percentual(apoios, meta))}%` }}
        />
      </div>
      <span className={estilos.legenda}>{legenda}</span>
    </div>
  );
}
