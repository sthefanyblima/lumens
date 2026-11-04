import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';

// As fontes são locais, não `next/font/google`: aquele baixa os arquivos de
// fonts.gstatic.com durante o build, e uma falha de rede no runner quebra o
// `check` — que hoje é pré-requisito do `deploy`. Ver src/fontes/README.md.
//
// Os três arquivos são variáveis, então um `weight` em faixa cobre todos os
// pesos usados hoje (Outfit 600/700/800, JetBrains Mono 500/600) sem arquivo
// novo. A faixa tem de bater com a do arquivo: declarar 100..900 num arquivo
// que vai até 800 faz o navegador sintetizar o peso que falta.

const titulo = localFont({
  src: '../fontes/outfit-latin-var.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--fonte-titulo',
  fallback: ['system-ui', 'sans-serif'],
});

const corpo = localFont({
  src: '../fontes/inter-latin-var.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--fonte-corpo',
  fallback: ['system-ui', 'sans-serif'],
});

const rotulo = localFont({
  src: '../fontes/jetbrains-mono-latin-var.woff2',
  weight: '100 800',
  display: 'swap',
  variable: '--fonte-rotulo',
  fallback: ['ui-monospace', 'monospace'],
  // O ajuste automático de métricas só conhece Arial e Times New Roman, ambas
  // proporcionais. Aplicá-lo a uma monoespaçada desalinharia os rótulos em vez
  // de reduzir o pulo de layout.
  adjustFontFallback: false,
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
