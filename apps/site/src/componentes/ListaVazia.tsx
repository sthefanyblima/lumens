import Link from 'next/link';
import type { Bloco } from '../dados/tipos';
import estilos from './componentes.module.css';

/** Lista sem pautas: no campus todo ou no bloco do filtro. */
export function ListaVazia({ bloco }: { bloco: Bloco | undefined }) {
  // Número do bot no wa.me, só dígitos. Sem ele, o botão de relatar não aparece.
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_BOT;
  return (
    <div role="status" className={estilos.estado}>
      <p className={estilos.estadoTitulo}>
        {bloco ? `Ainda não tem pauta no ${bloco.nome}.` : 'Ainda não tem pauta no site.'}
      </p>
      <p>Viu um problema no campus? Relate pelo WhatsApp: com apoios, ele vira pauta.</p>
      <div className={estilos.acoes}>
        {bloco && (
          <Link href="/" className={estilos.botaoSecundario}>
            Ver todos os blocos
          </Link>
        )}
        {whatsapp && (
          <a href={`https://wa.me/${whatsapp}`} className={estilos.botao}>
            Relatar um problema
          </a>
        )}
      </div>
    </div>
  );
}
