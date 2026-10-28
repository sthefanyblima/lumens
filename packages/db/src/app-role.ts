import type { Pool, PoolClient } from 'pg';

export const PAPEL_APLICACAO = 'lumens_app';

type CodigoPapelIncompativel = 'PAPEL_MEMBERSHIP_INCOMPATIVEL' | 'PAPEL_OWNERSHIP_INCOMPATIVEL';

export class ErroPapelIncompativel extends Error {
  readonly code: CodigoPapelIncompativel;

  constructor(code: CodigoPapelIncompativel) {
    super('O papel da aplicação possui vínculos incompatíveis com o provisionamento seguro.');
    this.name = 'ErroPapelIncompativel';
    this.code = code;
  }
}

const nomeValido = /^[a-z_][a-z0-9_]{0,62}$/;

async function possuiMembership(client: PoolClient, nome: string) {
  const { rows } = await client.query<{ possui: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_auth_members membro
       JOIN pg_roles papel ON papel.oid = membro.member
       WHERE papel.rolname = $1
     ) AS possui`,
    [nome],
  );
  return rows[0]?.possui === true;
}

async function possuiOwnership(client: PoolClient, nome: string) {
  const { rows } = await client.query<{ possui: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_database banco
       JOIN pg_roles papel ON papel.oid = banco.datdba
       WHERE papel.rolname = $1
       UNION ALL
       SELECT 1 FROM pg_namespace esquema
       JOIN pg_roles papel ON papel.oid = esquema.nspowner
       WHERE papel.rolname = $1
       UNION ALL
       SELECT 1 FROM pg_class objeto
       JOIN pg_roles papel ON papel.oid = objeto.relowner
       WHERE papel.rolname = $1
       UNION ALL
       SELECT 1 FROM pg_proc funcao
       JOIN pg_roles papel ON papel.oid = funcao.proowner
       WHERE papel.rolname = $1
       UNION ALL
       SELECT 1 FROM pg_type tipo
       JOIN pg_roles papel ON papel.oid = tipo.typowner
       WHERE papel.rolname = $1
     ) AS possui`,
    [nome],
  );
  return rows[0]?.possui === true;
}

async function comandoDoPapel(client: PoolClient, nome: string, senha: string, existe: boolean) {
  const formato = existe
    ? 'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L'
    : 'CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L';
  const { rows } = await client.query<{ comando: string }>(
    'SELECT format($1::text, $2::text, $3::text) AS comando',
    [formato, nome, senha],
  );
  const comando = rows[0]?.comando;
  if (!comando) throw new Error('PostgreSQL não produziu o comando de provisionamento.');
  await client.query(comando);
}

export async function provisionarPapelAplicacao(pool: Pool, nome: string, senha: string) {
  if (!nomeValido.test(nome)) throw new Error('Nome de papel inválido.');
  if (senha.length === 0) throw new Error('Senha do papel da aplicação não definida.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `lumens:provisionar-papel:${nome}`,
    ]);
    const { rows } = await client.query<{ existe: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS existe',
      [nome],
    );
    const existe = rows[0]?.existe === true;

    if (existe && (await possuiMembership(client, nome))) {
      throw new ErroPapelIncompativel('PAPEL_MEMBERSHIP_INCOMPATIVEL');
    }
    if (existe && (await possuiOwnership(client, nome))) {
      throw new ErroPapelIncompativel('PAPEL_OWNERSHIP_INCOMPATIVEL');
    }

    await comandoDoPapel(client, nome, senha, existe);
    await client.query('COMMIT');
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    client.release();
  }
}
