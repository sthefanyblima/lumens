# @lumens/dominio

Regras de negócio do Lumens. É a única porta de escrita nas tabelas de negócio: bot, agendador e
curadoria chamam uma função daqui em vez de gravar direto no banco. Assim cada regra existe uma vez
e é testada uma vez.

## Como criar uma regra nova

Toda função de regra segue o mesmo desenho: **valida → grava → registra o evento**, tudo na
transação de quem chama.

```ts
import { eq, propostas, type Tx } from '@lumens/db';
import { registrarEvento } from './eventos';

export async function registrarExecucaoProposta(
  tx: Tx,
  {
    pautaId,
    propostaId,
    agora = new Date(),
  }: { pautaId: string; propostaId: string; agora?: Date },
) {
  // 1. valida (lendo o que precisar com a mesma tx)
  // 2. grava
  await tx
    .update(propostas)
    .set({ status: 'executada', executadaEm: agora })
    .where(eq(propostas.id, propostaId));
  // 3. registra o evento: se algo falhar depois, a ação e o evento somem juntos
  await registrarEvento(tx, {
    pautaId,
    tipo: 'proposta_executada',
    dados: { proposta_id: propostaId },
    origem: 'bot',
  });
}
```

Quem chama abre a transação e pode compor várias regras nela:

```ts
await db.transaction(async (tx) => {
  await registrarPromessa(tx, { pautaId /* ... */ });
  await transicionarStatus(tx, { pautaId, para: 'prometido', origem: 'curadoria' });
});
```

### Status da pauta

`pauta.status` só muda por `transicionarStatus`, que aceita apenas as transições de
`TRANSICOES` e grava `status_alterado`. `podeTransicionar(de, para)` é a versão pura, para o
painel decidir quais botões mostrar. Os resultados da conferência (`conquistada`,
`entregue_em_parte`, `descumprida`) só são aceitos com `origem: 'agendador'`: nem owner nem
curadoria marcam conquista.

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
