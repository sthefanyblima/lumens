import { describe, expect, it } from 'vitest';
import { criarPool } from './client';

describe('criarPool', () => {
  it("não derruba o processo quando o pool emite 'error' (conexão ociosa caiu)", async () => {
    const erros: Error[] = [];
    // Porta 1: o pool nunca conecta, e o teste não precisa de Postgres.
    const pool = criarPool('postgresql://u:p@127.0.0.1:1/x', (erro) => erros.push(erro));
    const queda = new Error('terminating connection due to administrator command');

    // Sem listener, emit('error') lança — é o crash que o servidor sofria.
    expect(() => pool.emit('error', queda)).not.toThrow();
    expect(erros).toEqual([queda]);

    await pool.end();
  });
});
