import { createHmac } from 'node:crypto';
import type {
  NovoApoio,
  NovoBloco,
  NovoCaminho,
  NovoCurador,
  NovoEstudante,
  NovoEvento,
  NovoPapelPauta,
  NovaPauta,
  NovaPromessa,
  NovaProposta,
  NovaRespostaConferencia,
  NovoRelato,
  NovoVoluntario,
  StatusPauta,
} from '../src/types';

const CHAVE_HMAC_SEED = 'lumens-seed-desenvolvimento-v1';
const QUANTIDADE_ESTUDANTES = 300;

function uuid(grupo: number, indice: number): string {
  return `${grupo.toString(16).padStart(8, '0')}-0000-4000-8000-${indice
    .toString(16)
    .padStart(12, '0')}`;
}

function hmac(valorFicticio: string): string {
  return createHmac('sha256', CHAVE_HMAC_SEED).update(valorFicticio).digest('hex');
}

function placeholderCifrado(tipo: 'telefone' | 'email', valorFicticio: string): string {
  return `seed:v1:${tipo}:${Buffer.from(valorFicticio).toString('base64url')}`;
}

function data(dia: number, hora = 12): Date {
  return new Date(
    `2026-02-${String(dia).padStart(2, '0')}T${String(hora).padStart(2, '0')}:00:00.000Z`,
  );
}

const cursos = [
  'Administração',
  'Arquitetura e Urbanismo',
  'Ciência da Computação',
  'Direito',
  'Enfermagem',
  'Engenharia Civil',
  'Jornalismo',
  'Pedagogia',
] as const;

const idsBloco = {
  bloco18: uuid(1, 1),
  biblioteca: uuid(1, 2),
  engenharias: uuid(1, 3),
  saude: uuid(1, 4),
  artes: uuid(1, 5),
  residencia: uuid(1, 6),
} as const;

export const blocosSeed = [
  {
    id: idsBloco.bloco18,
    slug: 'bloco-18',
    nome: 'Bloco 18 (fictício)',
    baseEstudantes: 1200,
  },
  {
    id: idsBloco.biblioteca,
    slug: 'biblioteca-central',
    nome: 'Biblioteca Central',
    baseEstudantes: 120,
  },
  {
    id: idsBloco.engenharias,
    slug: 'engenharias',
    nome: 'Bloco das Engenharias (fictício)',
    baseEstudantes: 5000,
  },
  {
    id: idsBloco.saude,
    slug: 'saude',
    nome: 'Bloco da Saúde (fictício)',
    baseEstudantes: 650,
  },
  {
    id: idsBloco.artes,
    slug: 'artes',
    nome: 'Bloco de Artes (fictício)',
    baseEstudantes: 800,
  },
  {
    id: idsBloco.residencia,
    slug: 'residencia-universitaria',
    nome: 'Residência Universitária',
    baseEstudantes: 3000,
  },
] satisfies Array<NovoBloco & { id: string }>;

export const estudantesSeed = Array.from({ length: QUANTIDADE_ESTUDANTES }, (_, indice) => {
  const numero = indice + 1;
  const telefoneFicticio = `estudante-${String(numero).padStart(3, '0')}`;
  const emailFicticio = `estudante.${String(numero).padStart(3, '0')}@seed.invalid`;
  return {
    id: uuid(2, numero),
    telefoneHmac: hmac(`telefone:${telefoneFicticio}`),
    telefoneCifrado: placeholderCifrado('telefone', telefoneFicticio),
    emailHmac: hmac(`email:${emailFicticio}`),
    emailCifrado: placeholderCifrado('email', emailFicticio),
    curso: cursos[indice % cursos.length],
    verificadoEm: data(1, 9),
  };
}) satisfies Array<NovoEstudante & { id: string }>;

export const curadoresSeed = [
  {
    id: uuid(3, 1),
    emailHmac: hmac('email:ana.curadoria@seed.invalid'),
    emailCifrado: placeholderCifrado('email', 'ana.curadoria@seed.invalid'),
    nome: 'Ana Curadoria',
    ativo: true,
  },
  {
    id: uuid(3, 2),
    emailHmac: hmac('email:caio.curadoria@seed.invalid'),
    emailCifrado: placeholderCifrado('email', 'caio.curadoria@seed.invalid'),
    nome: 'Caio Curadoria',
    ativo: true,
  },
] satisfies Array<NovoCurador & { id: string }>;

type ConfiguracaoPauta = NovaPauta & {
  id: string;
  criadaEm: Date;
  quantidadeApoios: number;
  quantidadePapeis: number;
  percurso: StatusPauta[];
  datasTransicoes?: Partial<Record<StatusPauta, Date>>;
};

const configuracoesPauta = [
  {
    id: uuid(4, 1),
    slug: 'mais-arvores-no-campus',
    titulo: 'Mais árvores e sombra nas áreas de convivência',
    descricao: 'Criar novas áreas sombreadas nos caminhos mais usados do campus.',
    blocoId: null,
    categoria: 'infraestrutura',
    status: 'em_curadoria',
    meta: 300,
    criadaEm: data(2),
    quantidadeApoios: 0,
    quantidadePapeis: 1,
    percurso: ['em_curadoria'],
  },
  {
    id: uuid(4, 2),
    slug: 'tomadas-nas-mesas-da-biblioteca',
    titulo: 'Tomadas nas mesas da biblioteca',
    descricao: 'Instalar extensões improvisadas entre as mesas de estudo.',
    blocoId: idsBloco.biblioteca,
    categoria: 'infraestrutura',
    status: 'recusada',
    meta: 30,
    criadaEm: data(3),
    motivoRecusa:
      'A solução proposta apresenta risco elétrico; a pauta pode ser reenviada com instalação técnica.',
    quantidadeApoios: 4,
    quantidadePapeis: 1,
    percurso: ['em_curadoria', 'recusada'],
  },
  {
    id: uuid(4, 3),
    slug: 'bebedouros-no-bloco-18',
    titulo: 'Bebedouros funcionando no Bloco 18',
    descricao:
      'Consertar os bebedouros existentes e publicar um calendário de manutenção preventiva.',
    blocoId: idsBloco.bloco18,
    categoria: 'infraestrutura',
    status: 'juntando_apoios',
    meta: 120,
    criadaEm: data(4),
    aprovadaEm: data(5),
    quantidadeApoios: 72,
    quantidadePapeis: 2,
    percurso: ['em_curadoria', 'juntando_apoios'],
  },
  {
    id: uuid(4, 4),
    slug: 'biblioteca-aberta-aos-sabados',
    titulo: 'Biblioteca aberta aos sábados',
    descricao: 'Ampliar o horário da biblioteca durante o período letivo e de provas.',
    blocoId: idsBloco.biblioteca,
    categoria: 'servicos',
    status: 'meta_batida',
    meta: 30,
    criadaEm: data(5),
    aprovadaEm: data(6),
    metaBatidaEm: data(7),
    quantidadeApoios: 30,
    quantidadePapeis: 2,
    percurso: ['em_curadoria', 'juntando_apoios', 'meta_batida'],
  },
  {
    id: uuid(4, 5),
    slug: 'iluminacao-no-bloco-de-artes',
    titulo: 'Iluminação no entorno do Bloco de Artes',
    descricao: 'Trocar luminárias apagadas e iluminar o trajeto até o ponto de ônibus.',
    blocoId: idsBloco.artes,
    categoria: 'seguranca',
    status: 'cobrando',
    meta: 80,
    criadaEm: data(6),
    aprovadaEm: data(7),
    metaBatidaEm: data(8),
    quantidadeApoios: 84,
    quantidadePapeis: 3,
    percurso: ['em_curadoria', 'juntando_apoios', 'meta_batida', 'cobrando'],
  },
  {
    id: uuid(4, 6),
    slug: 'sala-de-descanso-na-saude',
    titulo: 'Sala de descanso para estudantes da Saúde',
    descricao: 'Adaptar uma sala ociosa para intervalos entre estágios e aulas em turnos extensos.',
    blocoId: idsBloco.saude,
    categoria: 'permanencia',
    status: 'prometido',
    meta: 65,
    criadaEm: data(7),
    aprovadaEm: data(8),
    metaBatidaEm: data(9),
    quantidadeApoios: 68,
    quantidadePapeis: 2,
    percurso: ['em_curadoria', 'juntando_apoios', 'meta_batida', 'cobrando', 'prometido'],
  },
  {
    id: uuid(4, 7),
    slug: 'acessibilidade-no-bloco-18',
    titulo: 'Acessibilidade nas entradas do Bloco 18',
    descricao: 'Corrigir rampas, sinalização e corrimãos nas entradas de maior circulação.',
    blocoId: idsBloco.bloco18,
    categoria: 'acessibilidade',
    status: 'entregue_em_parte',
    meta: 120,
    criadaEm: data(8),
    aprovadaEm: data(9),
    metaBatidaEm: data(10),
    quantidadeApoios: 124,
    quantidadePapeis: 3,
    percurso: [
      'em_curadoria',
      'juntando_apoios',
      'meta_batida',
      'cobrando',
      'prometido',
      'entregue_em_parte',
    ],
    datasTransicoes: { entregue_em_parte: new Date('2026-03-24T12:00:00.000Z') },
  },
  {
    id: uuid(4, 8),
    slug: 'internet-na-residencia',
    titulo: 'Internet estável na residência universitária',
    descricao: 'Restabelecer a cobertura Wi-Fi nos quartos e áreas coletivas da residência.',
    blocoId: idsBloco.residencia,
    categoria: 'tecnologia',
    status: 'descumprida',
    meta: 300,
    criadaEm: data(9),
    aprovadaEm: data(10),
    metaBatidaEm: data(11),
    quantidadeApoios: 300,
    quantidadePapeis: 2,
    percurso: [
      'em_curadoria',
      'juntando_apoios',
      'meta_batida',
      'cobrando',
      'prometido',
      'descumprida',
    ],
    datasTransicoes: { descumprida: new Date('2026-03-10T12:00:00.000Z') },
  },
  {
    id: uuid(4, 9),
    slug: 'laboratorios-abertos-nas-engenharias',
    titulo: 'Laboratórios de informática abertos no contraturno',
    descricao: 'Garantir acesso monitorado aos laboratórios para trabalhos e projetos de extensão.',
    blocoId: idsBloco.engenharias,
    categoria: 'ensino',
    status: 'conquistada',
    meta: 300,
    criadaEm: data(10),
    aprovadaEm: data(11),
    metaBatidaEm: data(12),
    quantidadeApoios: 300,
    quantidadePapeis: 3,
    percurso: [
      'em_curadoria',
      'juntando_apoios',
      'meta_batida',
      'cobrando',
      'prometido',
      'conquistada',
    ],
    datasTransicoes: { conquistada: new Date('2026-03-19T12:00:00.000Z') },
  },
] satisfies ConfiguracaoPauta[];

export const pautasSeed = configuracoesPauta.map(
  ({
    quantidadeApoios: _apoios,
    quantidadePapeis: _papeis,
    percurso: _percurso,
    datasTransicoes: _datas,
    ...pauta
  }) => pauta,
) satisfies NovaPauta[];

export const apoiosSeed = configuracoesPauta.flatMap((pauta, indicePauta) =>
  estudantesSeed.slice(0, pauta.quantidadeApoios).map((estudante, indice) => ({
    pautaId: pauta.id,
    estudanteId: estudante.id,
    origem: indice % 3 === 0 ? ('site' as const) : ('bot' as const),
    criadoEm: data(Math.min(27, 3 + indicePauta), 8 + (indice % 10)),
  })),
) satisfies NovoApoio[];

export const papeisPautaSeed = configuracoesPauta.flatMap((pauta, indicePauta) =>
  estudantesSeed
    .slice(indicePauta * 3, indicePauta * 3 + pauta.quantidadePapeis)
    .map((estudante, indice) => ({
      pautaId: pauta.id,
      estudanteId: estudante.id,
      papel: indice === 0 ? ('owner' as const) : ('co_owner' as const),
      desde: data(2 + indicePauta, 10 + indice).toISOString(),
      ultimaAtividadeEm: data(20, 10 + indice),
    })),
) satisfies NovoPapelPauta[];

export const relatosSeed = [
  {
    id: uuid(5, 1),
    pautaId: uuid(4, 3),
    estudanteId: uuid(2, 31),
    texto: 'O bebedouro do segundo andar está sem refrigeração há semanas.',
    moderacao: 'aprovado',
    moderadoEm: data(12),
  },
  {
    id: uuid(5, 2),
    pautaId: uuid(4, 5),
    estudanteId: uuid(2, 32),
    texto: 'A saída das aulas noturnas fica muito escura perto do ponto.',
    moderacao: 'aprovado',
    moderadoEm: data(13),
  },
  {
    id: uuid(5, 3),
    pautaId: uuid(4, 6),
    estudanteId: uuid(2, 33),
    texto: 'Nos dias de estágio não há onde descansar entre os turnos.',
    moderacao: 'pendente',
    moderadoEm: null,
  },
  {
    id: uuid(5, 4),
    pautaId: uuid(4, 8),
    estudanteId: uuid(2, 34),
    texto: 'A conexão cai principalmente no período da noite.',
    moderacao: 'aprovado',
    moderadoEm: data(14),
  },
  {
    id: uuid(5, 5),
    pautaId: uuid(4, 2),
    estudanteId: uuid(2, 35),
    texto: 'Relato fictício recusado por conter uma solução insegura.',
    moderacao: 'recusado',
    moderadoEm: data(15),
  },
] satisfies Array<NovoRelato & { id: string }>;

export const caminhosSeed = [
  {
    id: uuid(6, 1),
    pautaId: uuid(4, 4),
    tipo: 'comunidade',
    status: 'reunião agendada',
    abertoEm: data(9),
  },
  {
    id: uuid(6, 2),
    pautaId: uuid(4, 5),
    tipo: 'falabr',
    status: 'em análise',
    protocolo: 'SEED-FALABR-2026-0001',
    prazo: '2026-03-20',
    abertoEm: data(10),
  },
  {
    id: uuid(6, 3),
    pautaId: uuid(4, 6),
    tipo: 'falabr',
    status: 'respondido',
    protocolo: 'SEED-FALABR-2026-0002',
    prazo: '2026-03-25',
    abertoEm: data(11),
  },
  {
    id: uuid(6, 4),
    pautaId: uuid(4, 7),
    tipo: 'comunidade',
    status: 'acompanhando execução',
    abertoEm: data(12),
  },
  {
    id: uuid(6, 5),
    pautaId: uuid(4, 8),
    tipo: 'falabr',
    status: 'prazo encerrado',
    protocolo: 'SEED-FALABR-2026-0003',
    prazo: '2026-03-01',
    abertoEm: data(13),
  },
] satisfies Array<NovoCaminho & { id: string }>;

export const propostasSeed = [
  {
    id: uuid(7, 1),
    pautaId: uuid(4, 4),
    descricao: 'Organizar escala voluntária para mapear a demanda de sábado.',
    pessoasNecessarias: 4,
    status: 'aberta',
  },
  {
    id: uuid(7, 2),
    pautaId: uuid(4, 5),
    descricao: 'Fazer caminhada noturna e registrar os pontos sem iluminação.',
    pessoasNecessarias: 6,
    status: 'executada',
    executadaEm: data(16),
  },
  {
    id: uuid(7, 3),
    pautaId: uuid(4, 8),
    descricao: 'Medir a qualidade do Wi-Fi em cada ala da residência.',
    pessoasNecessarias: 8,
    status: 'executada',
    executadaEm: data(17),
  },
] satisfies Array<NovaProposta & { id: string }>;

export const voluntariosSeed = [
  { propostaId: uuid(7, 1), estudanteId: uuid(2, 41), criadoEm: data(14) },
  { propostaId: uuid(7, 1), estudanteId: uuid(2, 42), criadoEm: data(14) },
  { propostaId: uuid(7, 2), estudanteId: uuid(2, 43), criadoEm: data(15) },
  { propostaId: uuid(7, 2), estudanteId: uuid(2, 44), criadoEm: data(15) },
  { propostaId: uuid(7, 3), estudanteId: uuid(2, 45), criadoEm: data(16) },
  { propostaId: uuid(7, 3), estudanteId: uuid(2, 46), criadoEm: data(16) },
] satisfies NovoVoluntario[];

export const promessasSeed = [
  {
    id: uuid(8, 1),
    pautaId: uuid(4, 6),
    resumo: 'Adaptar a sala 12 com mobiliário de descanso.',
    dataEntrega: '2026-04-30',
    fonte: 'Ata fictícia da reunião de 18/02/2026',
    registradaPor: uuid(3, 1),
    conferenciaAbreEm: new Date('2026-05-01T12:00:00.000Z'),
    conferenciaFechaEm: new Date('2026-05-08T12:00:00.000Z'),
    resultado: null,
  },
  {
    id: uuid(8, 2),
    pautaId: uuid(4, 7),
    resumo: 'Corrigir as duas rampas principais e revisar a sinalização.',
    dataEntrega: '2026-03-15',
    fonte: 'Ofício fictício da gestão do campus',
    registradaPor: uuid(3, 2),
    conferenciaAbreEm: new Date('2026-03-16T12:00:00.000Z'),
    conferenciaFechaEm: new Date('2026-03-23T12:00:00.000Z'),
    resultado: 'em_parte',
  },
  {
    id: uuid(8, 3),
    pautaId: uuid(4, 8),
    resumo: 'Instalar novos pontos de acesso em todas as alas.',
    dataEntrega: '2026-03-01',
    fonte: 'Resposta fictícia ao protocolo Fala.BR',
    registradaPor: uuid(3, 1),
    conferenciaAbreEm: new Date('2026-03-02T12:00:00.000Z'),
    conferenciaFechaEm: new Date('2026-03-09T12:00:00.000Z'),
    resultado: 'nao',
  },
  {
    id: uuid(8, 4),
    pautaId: uuid(4, 9),
    resumo: 'Abrir dois laboratórios de segunda a sexta no contraturno.',
    dataEntrega: '2026-03-10',
    fonte: 'Portaria fictícia da unidade acadêmica',
    registradaPor: uuid(3, 2),
    conferenciaAbreEm: new Date('2026-03-11T12:00:00.000Z'),
    conferenciaFechaEm: new Date('2026-03-18T12:00:00.000Z'),
    resultado: 'sim',
  },
] satisfies Array<NovaPromessa & { id: string }>;

export const respostasConferenciaSeed = [
  {
    promessaId: uuid(8, 2),
    estudanteId: uuid(2, 51),
    resposta: 'em_parte',
    criadoEm: new Date('2026-03-18T12:00:00.000Z'),
  },
  {
    promessaId: uuid(8, 2),
    estudanteId: uuid(2, 52),
    resposta: 'sim',
    criadoEm: new Date('2026-03-19T12:00:00.000Z'),
  },
  {
    promessaId: uuid(8, 3),
    estudanteId: uuid(2, 53),
    resposta: 'nao',
    criadoEm: new Date('2026-03-04T12:00:00.000Z'),
  },
  {
    promessaId: uuid(8, 3),
    estudanteId: uuid(2, 54),
    resposta: 'nao',
    criadoEm: new Date('2026-03-05T12:00:00.000Z'),
  },
  {
    promessaId: uuid(8, 4),
    estudanteId: uuid(2, 55),
    resposta: 'sim',
    criadoEm: new Date('2026-03-13T12:00:00.000Z'),
  },
  {
    promessaId: uuid(8, 4),
    estudanteId: uuid(2, 56),
    resposta: 'sim',
    criadoEm: new Date('2026-03-14T12:00:00.000Z'),
  },
] satisfies NovaRespostaConferencia[];

function dataDaTransicao(pauta: ConfiguracaoPauta, status: StatusPauta, indice: number): Date {
  return (
    pauta.datasTransicoes?.[status] ?? new Date(pauta.criadaEm.getTime() + indice * 86_400_000)
  );
}

let indiceEvento = 0;
export const eventosSeed = configuracoesPauta.flatMap((pauta) => {
  const eventos: NovoEvento[] = [
    {
      id: uuid(9, ++indiceEvento),
      pautaId: pauta.id,
      tipo: 'pauta_criada',
      dados: { titulo: pauta.titulo, status: 'em_curadoria' },
      origem: 'bot',
      publico: false,
      criadoEm: pauta.criadaEm,
    },
  ];

  for (let indice = 1; indice < pauta.percurso.length; indice += 1) {
    const anterior = pauta.percurso[indice - 1];
    const atual = pauta.percurso[indice];
    if (!anterior || !atual) throw new Error('Percurso de status inválido no seed.');
    eventos.push({
      id: uuid(9, ++indiceEvento),
      pautaId: pauta.id,
      tipo: 'status_alterado',
      dados: { de: anterior, para: atual },
      origem: 'curadoria',
      publico: atual !== 'recusada',
      criadoEm: dataDaTransicao(pauta, atual, indice),
    });
  }
  return eventos;
}) satisfies NovoEvento[];

export const dadosSeed = {
  blocos: blocosSeed,
  estudantes: estudantesSeed,
  curadores: curadoresSeed,
  pautas: pautasSeed,
  papeisPauta: papeisPautaSeed,
  apoios: apoiosSeed,
  relatos: relatosSeed,
  caminhos: caminhosSeed,
  propostas: propostasSeed,
  voluntarios: voluntariosSeed,
  promessas: promessasSeed,
  respostasConferencia: respostasConferenciaSeed,
  eventos: eventosSeed,
} as const;
