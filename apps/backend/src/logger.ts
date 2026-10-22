import { pino, type Logger } from 'pino';
import type { Env } from './config/env';

export type { Logger };

export function criarLogger(nivel: Env['LOG_LEVEL']): Logger {
  return pino({ level: nivel });
}
