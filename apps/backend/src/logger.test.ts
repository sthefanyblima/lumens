import { describe, expect, it } from 'vitest';
import { resumoDoErro } from './logger';

/** Imita o DrizzleQueryError: mensagem com os parâmetros, causa com o erro do driver. */
class ErroDeQuery extends Error {
  constructor(
    readonly query: string,
    readonly params: unknown[],
    cause?: Error,
  ) {
    super(`Failed query: ${query}\nparams: ${JSON.stringify(params)}`, { cause });
  }
}

describe('resumoDoErro', () => {
  it('usa a causa do driver e não leva os parâmetros da query', () => {
    const driver = Object.assign(new Error('unsupported Unicode escape sequence'), {
      code: '22P05',
      detail: 'o valor "texto secreto" não pode virar jsonb',
    });
    const erro = new ErroDeQuery('insert into job', [{ body: 'texto secreto' }], driver);

    const resumo = resumoDoErro(erro);

    expect(resumo).toMatchObject({
      tipo: 'Error',
      mensagem: 'unsupported Unicode escape sequence',
      codigo: '22P05',
    });
    expect(JSON.stringify(resumo)).not.toContain('texto secreto');
  });

  it('erro do Postgres que cita o valor: fica só o texto antes dos dois-pontos, sem pilha', () => {
    const driver = Object.assign(
      new Error('invalid input syntax for type integer: "texto secreto"'),
      { code: '22P02' },
    );

    const resumo = resumoDoErro(new ErroDeQuery('select $1::int', ['texto secreto'], driver));

    expect(resumo).toEqual({
      tipo: 'Error',
      mensagem: 'invalid input syntax for type integer',
      codigo: '22P02',
    });
  });

  it('erro de query sem causa: omite a mensagem inteira, porque ela traz os parâmetros', () => {
    const resumo = resumoDoErro(new ErroDeQuery('select 1', ['texto secreto']));

    expect(resumo.mensagem).toBe('falha na query (parâmetros omitidos)');
    expect(JSON.stringify(resumo)).not.toContain('texto secreto');
  });

  it('AggregateError sem mensagem usa a do primeiro erro (ex.: ECONNREFUSED do pg)', () => {
    const erro = new AggregateError([new Error('connect ECONNREFUSED ::1:5999')], '');

    expect(resumoDoErro(erro).mensagem).toBe('connect ECONNREFUSED ::1:5999');
  });

  it('valor que não é Error', () => {
    expect(resumoDoErro('x')).toEqual({ tipo: 'string', mensagem: 'erro sem detalhes' });
  });
});
