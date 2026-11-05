# @lumens/dominio

Regras de negócio do Lumens. É a única porta de escrita nas tabelas de negócio: bot, agendador e
curadoria chamam uma função daqui em vez de gravar direto no banco. Assim cada regra existe uma vez
e é testada uma vez.

## Como criar uma regra nova

Toda função de regra segue o mesmo desenho: **valida → grava → registra o evento**, tudo na
transação de quem chama.

```ts
import { eq, pautas, type Tx } from '@lumens/db';
import { registrarEvento } from './eventos';

export async function aprovarPauta(tx: Tx, { pautaId }: { pautaId: string }) {
  // 1. valida (lendo o que precisar com a mesma tx)
  // 2. grava
  await tx.update(pautas).set({ status: 'juntando_apoios' }).where(eq(pautas.id, pautaId));
  // 3. registra o evento: se algo falhar depois, a ação e o evento somem juntos
  await registrarEvento(tx, {
    pautaId,
    tipo: 'status_alterado',
    dados: { de: 'em_curadoria', para: 'juntando_apoios' },
    origem: 'curadoria',
  });
}
```

Quem chama abre a transação e pode compor várias regras nela:

```ts
await db.transaction(async (tx) => {
  await aprovarPauta(tx, { pautaId });
  await outraRegra(tx, { pautaId });
});
```

### Recusa ou erro?

- **Recusa esperada** (apoio duplicado, protocolo divergente, conferência fechada): devolva um
  resultado com motivo, por exemplo `{ registrado: false, motivo: 'protocolo_divergente' }`. O bot
  traduz o `motivo` em mensagem para o estudante.
- **Quando a transação precisa ser desfeita** (transição de status inválida, evento com dado
  pessoal): lance `ErroDeRegra` com um `codigo` estável. Lançado dentro de `db.transaction`, ele
  desfaz tudo o que a transação já gravou.

### Eventos

`registrarEvento` só aceita os tipos do catálogo da T7 ([`docs/esquema.md`](../../docs/esquema.md),
"Tipos de evento decididos"), com o `dados` tipado de cada um. O campo `publico` sai do catálogo.
Recusa `dados` com campo de identidade (estudante, curador, telefone, e-mail, nome), mesmo
aninhado. A pessoa fica na entidade de origem, nunca na linha do tempo.

### Relógio

Funções que dependem da hora recebem `agora` (com padrão `new Date()`), para os testes fixarem o
instante.

## Testes

Os testes usam o Postgres em memória (`criarBancoEmMemoria`, de `@lumens/db/teste`), com as
mesmas migrações do banco real, e as fábricas de [`src/fabricas.ts`](src/fabricas.ts)
(`criarBloco`, `criarEstudanteVerificado`, `criarPauta`). Cada teste cria os próprios dados, então
a ordem de execução não muda o resultado.

```bash
pnpm --filter @lumens/dominio test
```
