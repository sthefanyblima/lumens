import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

interface Pacote {
  scripts: Record<string, string | undefined>;
  dependencies?: Record<string, string>;
}

const executar = promisify(execFile);
const chavesBackend = [
  'DATABASE_URL',
  'DATABASE_URL_LEITURA',
  'DATABASE_URL_TESTE',
  'DATABASE_URL_MIGRACAO',
  'POSTGRES_APP_PASSWORD',
  'CHAVE_CIFRA',
  'CHAVE_HMAC',
  'META_TOKEN',
  'META_APP_SECRET',
  'META_VERIFY_TOKEN',
  'META_PHONE_NUMBER_ID',
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USUARIO',
  'EMAIL_SENHA',
  'EMAIL_REMETENTE',
  'AWS_REGION',
  'S3_BUCKET_FOTOS',
  'S3_ENDPOINT',
  'SENTINELA_ADMIN',
];

function ambienteLimpo() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([chave]) => !chavesBackend.includes(chave)),
  );
}

function envBackendCompleto() {
  return [
    'DATABASE_URL=postgresql://lumens_app:senha@localhost:5432/lumens',
    'DATABASE_URL_LEITURA=postgresql://lumens_app:senha@localhost:5432/lumens',
    `CHAVE_CIFRA=${Buffer.alloc(32, 1).toString('base64')}`,
    `CHAVE_HMAC=${Buffer.alloc(32, 2).toString('base64')}`,
    'META_TOKEN=token',
    'META_APP_SECRET=segredo',
    'META_VERIFY_TOKEN=frase',
    'META_PHONE_NUMBER_ID=1234567890',
    'EMAIL_HOST=smtp.exemplo.com',
    'EMAIL_PORT=587',
    'EMAIL_USUARIO=usuario',
    'EMAIL_SENHA=senha',
    'EMAIL_REMETENTE=lumens@exemplo.com',
    'AWS_REGION=us-east-1',
    'S3_BUCKET_FOTOS=lumens-fotos',
    '',
  ].join('\n');
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
    expect(backend.scripts[script]).not.toContain('.env.database');
  });

  it('test carrega as credenciais do banco de integração sem expô-las ao runtime', () => {
    expect(backend.scripts.test).toContain('--env-file-if-exists=../../.env');
    expect(backend.scripts.test).toContain('--env-file-if-exists=../../.env.database');
  });

  it('executa o entrypoint com .env sem carregar sentinela de .env.database', async () => {
    const raiz = await mkdtemp(join(tmpdir(), 'lumens-backend-env-'));
    const cwd = join(raiz, 'apps', 'backend');
    const sentinela = `admin-${randomUUID()}`;
    await mkdir(cwd, { recursive: true });
    await writeFile(join(raiz, '.env'), envBackendCompleto(), 'utf8');
    await writeFile(
      join(raiz, '.env.database'),
      `SENTINELA_ADMIN=${sentinela}\nDATABASE_URL_MIGRACAO=postgresql://owner:${sentinela}@localhost:5432/lumens\n`,
      'utf8',
    );

    try {
      const inspecao = await executar(
        process.execPath,
        [
          '--env-file-if-exists=../../.env',
          '--input-type=module',
          '-e',
          "process.stdout.write(process.env.SENTINELA_ADMIN ?? 'ausente')",
        ],
        { cwd, env: ambienteLimpo(), timeout: 30_000 },
      );
      expect(inspecao.stdout).toBe('ausente');

      const entrada = await executar(
        process.execPath,
        [
          fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url)),
          '--env-file-if-exists=../../.env',
          fileURLToPath(new URL('../main.ts', import.meta.url)),
          '--so-validar',
        ],
        { cwd, env: ambienteLimpo(), timeout: 30_000 },
      );
      expect(entrada.stdout).toContain('Ambiente validado. Banco: localhost:5432');
      expect(entrada.stderr).toBe('');
      expect(`${entrada.stdout}\n${entrada.stderr}`).not.toContain(sentinela);
    } finally {
      await rm(raiz, { recursive: true, force: true });
    }
  }, 35_000);

  it('o texto das respostas no log (--dev) é só do dev, nunca do start de produção', () => {
    expect(backend.scripts.dev).toContain('--dev');
    expect(backend.scripts.start).not.toContain('--dev');
  });

  it('env:check é o dev, só que parando depois de validar o ambiente', () => {
    expect(backend.scripts['env:check']).toBe(`${String(backend.scripts.dev)} --so-validar`);
  });

  // Instalação de produção (`pnpm install --prod`) não traz devDependencies: o binário que
  // sobe o servidor e o que roda as migrações precisam estar em `dependencies`.
  it.each([
    ['@lumens/backend', backend, 'start'],
    ['@lumens/db', db, 'db:migrate'],
  ])('%s %s roda sem devDependencies', (_, pacote, script) => {
    const comando = pacote.scripts[script];
    expect(comando).toBeDefined();
    const binario = String(comando).split(' ')[0] ?? '';
    expect(Object.keys(pacote.dependencies ?? {})).toContain(binario);
  });
});
