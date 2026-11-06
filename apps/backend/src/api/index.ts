/** API de leitura pública (parte 1, SCRUM-88) e, depois, a da curadoria (parte 5). */
export const MODULO_API = 'api' as const;

export { apiPlugin, type ApiPluginOptions } from './routes';
