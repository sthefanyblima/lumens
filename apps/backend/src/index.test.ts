import { describe, expect, it } from 'vitest';
import { metaDoCampus, modulos } from './index';

describe('back-end', () => {
  it('importa o domínio pelo nome do pacote', () => {
    expect(metaDoCampus).toBe(300);
  });

  it('tem os três módulos', () => {
    expect(modulos).toEqual(['bot', 'agendador', 'api']);
  });
});
