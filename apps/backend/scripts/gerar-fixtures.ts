// Regrava src/bot/sim/__fixtures__/*.json a partir dos construtores.
// Uso: pnpm --filter @lumens/backend fixtures (e depois pnpm format, para o Prettier).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES_DIR, fixtures } from '../src/bot/sim/fixtures';

mkdirSync(FIXTURES_DIR, { recursive: true });
for (const [name, payload] of Object.entries(fixtures())) {
  const file = join(FIXTURES_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  console.log(`gerado ${file}`);
}
