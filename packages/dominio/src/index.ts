export { META_MAXIMA, META_MINIMA, calcularMeta } from './meta';
export type { BlocoParaMeta } from './meta';

export { conferirAnonimato } from './anonimato';
export type { Achado, MotivoAchado, OpcoesDeConferencia, Severidade, Veredicto } from './anonimato';

export {
  PRAZO_INICIAL_DIAS,
  PRAZO_PRORROGACAO_DIAS,
  calcularPrazo,
  diasAteOPrazo,
  prazoLegal,
} from './prazo';
export type { ParametrosDePrazo, Prazo, TipoCaminho } from './prazo';

export { registrarProtocolo } from './caminho-registro';
export type {
  MotivoRecusaProtocolo,
  RegistroDeProtocolo,
  ResultadoProtocolo,
} from './caminho-registro';
