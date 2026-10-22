import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Pacote {
  scripts: Record<string, string | undefined>;
  dependencies?: Record<string, string>;
}

function lerPacote(caminho: string): Pacote {
  return JSON.parse(readFileSync(new URL(caminho, import.meta.url), 'utf8')) as Pacote;
}

const backend = lerPacote('../../package.json');
const db = lerPacote('../../../../packages/db/package.json');

/**
 * O CI roda `env:check`, que é o `dev` mais `--so-validar`. Sem esta trava, mudar o `dev`
 * deixaria o CI verde validando outro caminho, e o comando documentado no README mentindo —
 * que foi exatamente o bloqueante encontrado na revisão da T2 (SCRUM-75).
 */
describe('scripts do back-end', () => {
  it.each(['dev', 'env:check'])('%s carrega o .env da raiz do repositório', (script) => {
    expect(backend.scripts[script]).toContain('--env-file-if-exists=../../.env');
  });

  it('env:check é o dev, só que parando depois de validar o ambiente', () => {
    expect(backend.scripts['env:check']).toBe(`${String(backend.scripts.dev)} --so-validar`);
  });

  // Instalação de produção (`pnpm install --prod`) não traz devDependencies: o binário que
  // sobe o servidor e o que roda as migrações precisam estar em `dependencies`.
  it.each([
    ['@lumens/backend', backend, 'start'],
    ['@lumens/db', db, 'migrate'],
  ])('%s %s roda sem devDependencies', (_, pacote, script) => {
    const comando = pacote.scripts[script];
    expect(comando).toBeDefined();
    const binario = String(comando).split(' ')[0] ?? '';
    expect(Object.keys(pacote.dependencies ?? {})).toContain(binario);
  });
});
