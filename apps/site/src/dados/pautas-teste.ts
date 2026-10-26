// Pautas genéricas para testes e para a rota de rascunho dos componentes.
// Não são dados do site: uma por status, com meta pela RN04 dos blocos do exemplo.json.
import type { Pauta, StatusPauta } from './tipos';

function pauta(
  status: StatusPauta,
  bloco: { slug: string; nome: string } | null,
  meta: number,
  apoios: number,
): Pauta {
  const bateuMeta = apoios >= meta;
  return {
    slug: `pauta-teste-${status.replaceAll('_', '-')}`,
    titulo: `Pauta de teste · ${status}`,
    descricao: 'Descrição de teste.',
    categoria: 'Infraestrutura',
    status,
    bloco_slug: bloco?.slug ?? null,
    bloco_nome: bloco?.nome ?? null,
    meta,
    apoios,
    criada_em: '2026-10-01T10:00:00-03:00',
    aprovada_em:
      status === 'em_curadoria' || status === 'recusada' ? null : '2026-10-01T12:00:00-03:00',
    meta_batida_em: bateuMeta ? '2026-10-10T12:00:00-03:00' : null,
    owners: [{ papel: 'owner', curso: 'Curso de teste', desde: '2026-10-01T10:00:00-03:00' }],
    relatos: [],
    eventos: [],
  };
}

const blocoA = { slug: 'bloco-a', nome: 'Bloco A' };
const blocoB = { slug: 'bloco-b', nome: 'Bloco B' };
const blocoC = { slug: 'bloco-c', nome: 'Bloco C' };
const bloco18 = { slug: 'bloco-18', nome: 'Bloco 18' };
const ic = { slug: 'ic', nome: 'Instituto de Computação' };

export const PAUTAS_TESTE: Pauta[] = [
  pauta('em_curadoria', blocoC, 30, 0),
  pauta('recusada', null, 300, 0),
  pauta('juntando_apoios', ic, 60, 41),
  pauta('meta_batida', blocoB, 85, 92),
  pauta('cobrando', null, 300, 318),
  pauta('prometido', null, 300, 1240), // número grande, para o separador de milhar
  pauta('entregue_em_parte', blocoA, 120, 143),
  pauta('descumprida', blocoA, 120, 356), // apoios bem acima da meta: barra não passa de 100%
  pauta('conquistada', bloco18, 300, 340),
];
