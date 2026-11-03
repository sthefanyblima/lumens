import { expectTypeOf, it } from 'vitest';
import type {
  Bloco,
  NovaPauta,
  PapelPauta,
  Pauta,
  StatusPauta,
  TipoDisparo as TipoDisparoDb,
} from '@lumens/db';
import type { TipoDisparo } from './envio';
import type { BlocoParaMeta } from './meta';

it('consome os tipos do banco no domínio sem abrir conexão', () => {
  expectTypeOf<Pick<Bloco, 'baseEstudantes'>>().toEqualTypeOf<BlocoParaMeta>();
  expectTypeOf<Pauta['status']>().toEqualTypeOf<StatusPauta>();
  expectTypeOf<NovaPauta['meta']>().toEqualTypeOf<number>();
  expectTypeOf<PapelPauta['desde']>().toEqualTypeOf<string>();
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

it('o enum tipo_disparo do banco é exatamente o TipoDisparo da política de envio', () => {
  // Tipo novo num lado só quebra aqui, e não em produção: sem prioridade, o
  // disparo não teria lugar na fila; sem valor no enum, não entraria nela.
  expectTypeOf<TipoDisparoDb>().toEqualTypeOf<TipoDisparo>();
});
