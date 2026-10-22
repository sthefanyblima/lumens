import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * O CI roda `env:check`, que é uma cópia do `dev`. Sem esta trava, apagar a flag
 * do `dev` deixaria o CI verde e o comando documentado no README mentindo — que
 * foi exatamente o bloqueante encontrado na revisão da T2 (SCRUM-75).
 */
const pacote = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string | undefined>;
};

describe('scripts do back-end', () => {
  it.each(['dev', 'env:check'])('%s carrega o .env da raiz do repositório', (script) => {
    expect(pacote.scripts[script]).toContain('--env-file-if-exists=../../.env');
  });
});
