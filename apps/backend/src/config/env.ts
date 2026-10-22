import { z } from 'zod';

/**
 * Validação das variáveis de ambiente do back-end (SCRUM-75).
 *
 * O processo não sobe com ambiente incompleto: é melhor falhar na inicialização,
 * com o nome do que falta, do que descobrir a variável vazia no meio de uma
 * conversa do bot.
 */

const obrigatoria = z
  .string({ error: 'não definida — veja o .env.example' })
  .min(1, 'definida, porém vazia');

/**
 * Chave de 32 bytes em base64 — o tamanho que o AES-256-GCM exige
 * (Roteiro da Parte 1, seção 6).
 */
const chaveDe32Bytes = obrigatoria.refine(
  (valor) => Buffer.from(valor, 'base64').length === 32,
  "precisa ser uma chave de 32 bytes em base64 — gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
);

const esquema = z
  .object({
    // Banco
    DATABASE_URL: obrigatoria,
    DATABASE_URL_LEITURA: obrigatoria,
    DATABASE_URL_TESTE: z.string().optional(),

    // Criptografia (T17)
    CHAVE_CIFRA: chaveDe32Bytes,
    CHAVE_HMAC: chaveDe32Bytes,

    // WhatsApp / Meta (parte 2)
    META_TOKEN: obrigatoria,
    META_APP_SECRET: obrigatoria,
    META_VERIFY_TOKEN: obrigatoria,
    META_PHONE_NUMBER_ID: obrigatoria,

    // E-mail do código de verificação
    EMAIL_HOST: obrigatoria,
    EMAIL_PORT: z.coerce
      .number({ error: 'não definida ou não é um número — veja o .env.example' })
      .int()
      .positive(),
    EMAIL_USUARIO: obrigatoria,
    EMAIL_SENHA: obrigatoria,
    EMAIL_REMETENTE: obrigatoria,

    // AWS / fotos (T20)
    AWS_REGION: obrigatoria,
    S3_BUCKET_FOTOS: obrigatoria,
    S3_ENDPOINT: z.string().optional(),
  })
  .refine((env) => env.CHAVE_CIFRA !== env.CHAVE_HMAC, {
    message:
      'precisa ser DIFERENTE de CHAVE_CIFRA — uma cifra os dados, a outra gera o HMAC de busca; reusar a mesma elimina essa separação',
    path: ['CHAVE_HMAC'],
  });

export type Env = z.infer<typeof esquema>;

export type FonteDeAmbiente = Record<string, string | undefined>;

/**
 * Lê e valida o ambiente. Recebe a fonte por parâmetro para que os testes não
 * precisem mexer no `process.env` do processo que está rodando.
 *
 * @throws {Error} listando TODAS as variáveis com problema, não só a primeira.
 */
export function carregarEnv(fonte: FonteDeAmbiente = process.env): Env {
  const resultado = esquema.safeParse(fonte);

  if (resultado.success) {
    return resultado.data;
  }

  const problemas = resultado.error.issues.map((problema) => {
    const nome = problema.path.length > 0 ? problema.path.join('.') : '(ambiente)';
    return `  - ${nome}: ${problema.message}`;
  });

  throw new Error(
    [
      'Ambiente inválido. Corrija as variáveis abaixo e rode de novo:',
      '',
      ...problemas,
      '',
      'Se este é um ambiente novo: cp .env.example .env e preencha o .env.',
    ].join('\n'),
  );
}
