import type { Metadata } from 'next';
import Link from 'next/link';
import estilos from './page.module.css';

export const metadata: Metadata = {
  title: 'Política de privacidade · Lumens',
  description: 'Que dados o Lumens coleta, como protege e o que aparece no site público.',
};

// Esta página descreve o comportamento REAL do sistema, não intenções. Cada
// afirmação abaixo corresponde a código em produção; a referência está no
// comentário de cada seção. Ao mudar o comportamento, mude este texto junto —
// uma política que descreve o que o sistema não faz é pior que não ter uma.
const ATUALIZADA_EM = '5 de novembro de 2026';

export default function Privacidade() {
  return (
    <main className={estilos.pagina}>
      <p className={estilos.rotulo}>Atualizada em {ATUALIZADA_EM}</p>
      <h1 className={estilos.titulo}>Política de privacidade</h1>
      <p className={estilos.resumo}>
        O Lumens recebe relatos de estudantes da UFAL pelo WhatsApp e transforma os que juntam apoio
        em pautas públicas. Esta página diz quais dados isso envolve e o que o sistema faz com eles.
      </p>

      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Quem somos</h2>
        <p>
          O Lumens é um projeto acadêmico, desenvolvido por estudantes do curso de computação da
          Universidade Federal de Alagoas como trabalho de disciplina. Não é um canal oficial da
          UFAL e não fala em nome da universidade.
        </p>
        <p>
          O sistema está em desenvolvimento. As pautas exibidas hoje no site são dados de exemplo.
        </p>
      </section>

      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>O que coletamos</h2>
        <p>Pela conversa no WhatsApp, conforme o que você escolhe fazer:</p>
        <ul>
          <li>
            <strong>Seu número de telefone</strong>, que chega junto com a mensagem
          </li>
          <li>
            <strong>Seu e-mail institucional</strong>, se você optar por se verificar como estudante
          </li>
          <li>
            <strong>Seu curso</strong>, informado na verificação
          </li>
          <li>
            <strong>O texto do relato</strong> e, opcionalmente, <strong>uma foto</strong>
          </li>
        </ul>
        <p>
          Só aceitamos e-mail dos domínios da UFAL. A verificação existe para confirmar que quem
          apoia uma pauta é da comunidade universitária — não para identificar você publicamente.
        </p>
      </section>

      {/* AES-256-GCM e HMAC-SHA256: apps/backend/src/cripto.ts */}
      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Como protegemos</h2>
        <ul>
          <li>
            <strong>Telefone e e-mail são cifrados</strong> no banco, com AES-256-GCM.
          </li>
          <li>
            <strong>A busca pelo seu telefone não decifra nada.</strong> Guardamos também um código
            irreversível derivado do número (HMAC-SHA256), e é por ele que o sistema reencontra sua
            conversa.
          </li>
          <li>
            <strong>Fotos perdem todos os metadados.</strong> Antes de qualquer armazenamento,
            removemos EXIF, GPS, XMP, IPTC e perfil de cor. A localização de onde a foto foi tirada
            não sobrevive ao envio.
          </li>
          <li>
            <strong>O estado da conversa dura 24 horas.</strong> Depois disso ele expira, e uma
            rotina diária apaga o que expirou.
          </li>
        </ul>
      </section>

      {/* owners só com papel e curso: apps/site/src/dados/tipos.ts
          em_curadoria e recusada fora do site: apps/site/src/dados/pautas-publicas.ts */}
      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>O que aparece no site</h2>
        <p>
          O site mostra a pauta, o status, o bloco, a contagem de apoios e a meta. Sobre as pessoas
          responsáveis por uma pauta, mostra <strong>apenas o papel e o curso</strong> — nunca nome,
          telefone, e-mail ou matrícula.
        </p>
        <p>
          Quem apoia uma pauta <strong>não aparece</strong>. O site publica o total de apoios, não
          quem apoiou.
        </p>
        <p>
          Pautas em curadoria ou recusadas não são publicadas. Enquanto uma pauta não é aprovada,
          ela não existe para quem visita o site.
        </p>
      </section>

      {/* RN08, conferência de anonimato: packages/dominio/src/anonimato.ts */}
      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Quando a pauta vai para o Fala.BR</h2>
        <p>
          Pautas que atingem a meta podem ser levadas ao Fala.BR, o sistema federal de
          manifestações. Isso é feito manualmente por uma pessoa responsável, e o texto protocolado
          vira documento público.
        </p>
        <p>
          Por isso, antes do envio o texto passa por uma conferência que{' '}
          <strong>bloqueia o envio</strong> se encontrar nome de pessoa que o sistema conhece,
          e-mail, telefone ou matrícula. Trechos que apenas sugerem um nome geram um aviso para quem
          revisa decidir.
        </p>
      </section>

      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Com quem compartilhamos</h2>
        <p>
          Com ninguém, para fins comerciais ou de publicidade. As mensagens passam pela
          infraestrutura do WhatsApp, operada pela Meta, porque é por lá que a conversa acontece.
        </p>
      </section>

      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Seus direitos</h2>
        <p>
          Você pode pedir a qualquer momento para ver, corrigir ou apagar os dados que temos sobre
          você. O pedido é feito pelo mesmo canal do WhatsApp em que você conversou com o bot, e é
          atendido manualmente pela equipe — não há processo automático.
        </p>
        <p>
          Apagar seus dados remove sua conversa e sua identificação. Pautas já publicadas, que não
          carregam seus dados pessoais, permanecem no site.
        </p>
      </section>

      <Link href="/" className={estilos.voltar}>
        ← Voltar para as pautas
      </Link>
    </main>
  );
}
