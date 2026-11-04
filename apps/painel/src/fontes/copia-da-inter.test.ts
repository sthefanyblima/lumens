import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A Inter existe em duas cópias: aqui e em apps/site/src/fontes. A duplicação é
// deliberada (ver README.md desta pasta), mas nada impede que alguém atualize
// um lado só — e aí o painel fica numa versão antiga sem nenhum sinal.
//
// O oráculo é o hash, não o tamanho: dois arquivos de 48256 bytes podem ser
// versões diferentes da fonte.

const caminho = (relativo: string) => fileURLToPath(new URL(relativo, import.meta.url));

const hash = (arquivo: string) => createHash('sha256').update(readFileSync(arquivo)).digest('hex');

const PARES = [
  ['inter-latin-var.woff2', 'o arquivo da fonte'],
  ['inter-OFL.txt', 'o texto da licença'],
] as const;

describe('cópia da Inter compartilhada com o site', () => {
  it.each(PARES)('%s é idêntico ao do site', (arquivo, descricao) => {
    const noPainel = hash(caminho(arquivo));
    const noSite = hash(caminho(`../../../site/src/fontes/${arquivo}`));

    expect(
      noPainel,
      `${descricao} divergiu entre apps/painel/src/fontes e apps/site/src/fontes. ` +
        'Atualizou a Inter em um app só? Copie o arquivo para o outro.',
    ).toBe(noSite);
  });
});
