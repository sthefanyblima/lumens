// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Erros de regra do domínio devem ser tratados explicitamente
      '@typescript-eslint/only-throw-error': 'error',
      // Permite `_param` para parâmetros intencionalmente não usados
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // `next/font/google` baixa as fontes durante o build. Uma falha de rede no
    // runner quebra o `check`, e o `deploy` depende dele. Use `next/font/local`
    // com arquivos do próprio app.
    //
    // O escopo é o repositório inteiro, não só `apps/*/src`: um componente em
    // `packages/`, uma rota fora de `src` ou um `next.config.ts` chegam ao
    // mesmo build e reabririam o buraco. `patterns` em vez de `paths` porque
    // `paths` casa só o especificador exato, deixando passar subcaminhos.
    files: ['**/*.{ts,tsx,js,mjs}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['next/font/google', 'next/font/google/*'],
              message:
                'Use next/font/local com arquivos do próprio app: o build não pode depender de rede. Ver apps/site/src/fontes/README.md como referência.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
