import { expectTypeOf, it } from 'vitest';
import type { Bloco, NovaPauta, Pauta, StatusPauta } from '@lumens/db';
import type { BlocoParaMeta } from './meta';

it('consome os tipos do banco no domínio sem abrir conexão', () => {
  expectTypeOf<Pick<Bloco, 'baseEstudantes'>>().toEqualTypeOf<BlocoParaMeta>();
  expectTypeOf<Pauta['status']>().toEqualTypeOf<StatusPauta>();
  expectTypeOf<NovaPauta['meta']>().toEqualTypeOf<number>();
  expectTypeOf<StatusPauta>().toEqualTypeOf<
    | 'em_curadoria'
    | 'recusada'
    | 'juntando_apoios'
    | 'meta_batida'
    | 'cobrando'
    | 'prometido'
    | 'entregue_em_parte'
    | 'descumprida'
    | 'conquistada'
  >();
});
