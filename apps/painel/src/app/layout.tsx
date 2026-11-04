import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';

// A fonte é local, não `next/font/google`: aquele baixa os arquivos durante o
// build, e uma falha de rede no runner quebra o `check` — que o `deploy`
// exige. Procedência e licença em src/fontes/README.md.
const corpo = localFont({
  src: '../fontes/inter-latin-var.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--fonte-corpo',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'Painel de curadoria · Lumens',
  description: 'Área restrita da equipe de curadoria do Lumens.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={corpo.variable}>
      <body>{children}</body>
    </html>
  );
}
