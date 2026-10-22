import { calcularMeta } from '@lumens/dominio';
import { MODULO_AGENDADOR } from './agendador';
import { MODULO_API } from './api';
import { MODULO_BOT } from './bot';

/**
 * Ponto de entrada do back-end. O servidor Fastify entra nas próximas tasks;
 * por enquanto só prova que os módulos e o pacote de domínio se conectam.
 */
export const modulos = [MODULO_BOT, MODULO_AGENDADOR, MODULO_API] as const;
export const metaDoCampus = calcularMeta(null);
