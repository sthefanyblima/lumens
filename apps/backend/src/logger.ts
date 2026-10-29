import { pino, type Logger } from 'pino';
import type { Env } from './config/env';

export type { Logger };

export function criarLogger(nivel: Env['LOG_LEVEL']): Logger {
  return pino({ level: nivel });
}

export interface ResumoDoErro {
  tipo: string;
  mensagem: string;
  codigo?: string;
  pilha?: string;
}

/**
 * O que dá para logar de um erro sem vazar dado da pessoa. Use no lugar de `{ err }` em todo
 * erro que pode vir de uma query.
 *
 * O DrizzleQueryError põe os parâmetros da query na mensagem — e os parâmetros são o job
 * inteiro, com o texto que a pessoa mandou. Por isso vale a causa (o erro do driver). E mesmo
 * o erro do Postgres pode citar o valor depois dos dois-pontos ("invalid input syntax for type
 * integer: "<valor>""): de erro com SQLSTATE fica só o código e o texto antes dos dois-pontos,
 * sem a pilha (que repete a mensagem) e sem o `detail`.
 */
export function resumoDoErro(erro: unknown): ResumoDoErro {
  if (!(erro instanceof Error)) return { tipo: typeof erro, mensagem: 'erro sem detalhes' };

  const base = erro.cause instanceof Error ? erro.cause : erro;
  const primeiro = base instanceof AggregateError ? (base.errors[0] as unknown) : undefined;
  const crua = base.message || (primeiro instanceof Error ? primeiro.message : '');
  const codigo = 'code' in base && typeof base.code === 'string' ? base.code : undefined;
  const doBanco = codigo !== undefined && /^[0-9A-Z]{5}$/.test(codigo);
  const comParametros = crua.startsWith('Failed query');

  const mensagem = comParametros
    ? 'falha na query (parâmetros omitidos)'
    : doBanco
      ? (crua.split(':')[0] ?? '')
      : crua;

  return {
    tipo: base.name,
    mensagem,
    ...(codigo === undefined ? {} : { codigo }),
    ...(comParametros || doBanco || base.stack === undefined ? {} : { pilha: base.stack }),
  };
}
