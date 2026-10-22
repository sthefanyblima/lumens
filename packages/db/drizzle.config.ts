import { defineConfig } from 'drizzle-kit';

// `generate` só lê o esquema; não conecta no banco.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migracoes',
});
