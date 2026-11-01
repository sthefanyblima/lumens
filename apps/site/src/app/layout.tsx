import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Outfit } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const titulo = Outfit({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--fonte-titulo',
});
const corpo = Inter({ subsets: ['latin'], variable: '--fonte-corpo' });
const rotulo = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--fonte-rotulo',
});

export const metadata: Metadata = {
  title: 'Lumens',
  description: 'Pautas estudantis da UFAL: da reclamação à pauta.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${titulo.variable} ${corpo.variable} ${rotulo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
