export { META_MAXIMA, META_MINIMA, calcularMeta } from './meta';
export type { BlocoParaMeta } from './meta';

export { conferirAnonimato } from './anonimato';
export type { Achado, MotivoAchado, OpcoesDeConferencia, Severidade, Veredicto } from './anonimato';

export { ORCAMENTO_SEM_VERIFICACAO, PRIORIDADE, planejarEnvio } from './envio';
export type { Disparo, ParametrosDeEnvio, PlanoDeEnvio, TipoDisparo } from './envio';

export {
  RESERVA_EXPIRA_MS,
  enfileirarDisparos,
  registrarEntrega,
  registrarEnvio,
  registrarFalha,
  reservarLote,
} from './fila';
export type { DisparoReservado, NovoAviso, ParametrosDeLote } from './fila';
