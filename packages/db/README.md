# @lumens/db

Este pacote mantém o schema Drizzle, as migrações SQL e o cliente PostgreSQL do Lumens.

## Linha do tempo de eventos

A tabela `evento` é append-only: aceita `INSERT`, mas triggers no PostgreSQL rejeitam `UPDATE`,
`DELETE` e `TRUNCATE` com a mensagem `evento é somente inserção`. A FK `evento.pauta_id` usa
`ON DELETE RESTRICT`, então uma pauta que possui eventos também não pode ser apagada.

Uma correção da linha do tempo deve ser registrada como **um evento novo**, nunca como edição ou
remoção de um evento anterior. O novo evento pode explicar o que está sendo corrigido nos seus
próprios dados, preservando o histórico público original.

## Migrações e reset local

Na raiz do repositório:

```bash
pnpm db:migrate
```

Como `TRUNCATE evento` é bloqueado, testes e desenvolvimento não devem usá-lo para limpar o
banco. Para recriar o ambiente Docker inteiro, derrube o volume, suba o PostgreSQL novamente e
reaplique as migrações:

```bash
pnpm db:reset
pnpm db:migrate
```

A suíte de integração cria e remove um banco temporário completo; ela não apaga linhas da base de
desenvolvimento.

## Papéis e conexões

O backend usa `DATABASE_URL` com o login restrito `lumens_app`. Provisionamento e migrações usam
`DATABASE_URL_MIGRACAO`, disponível somente em `.env.database`. O login da aplicação pode fazer o
DML necessário nas demais tabelas, mas não possui `UPDATE`, `DELETE` nem `TRUNCATE` em `evento`.
Os triggers continuam como proteção independente para acessos administrativos.

Depois de criar ou atualizar `.env.database`:

```bash
pnpm db:provision
pnpm db:migrate
```

O provisionamento pode ser reaplicado para rotacionar `POSTGRES_APP_PASSWORD`. Para fazer a
rotação, defina a senha nova em `.env.database`, rode `pnpm db:provision`, atualize a senha nas duas
URLs de runtime (`DATABASE_URL` e `DATABASE_URL_LEITURA`) e reinicie os processos que mantêm
conexões com o banco. Em produção, coordene esses passos com a atualização do cofre e o redeploy,
pois novas conexões com a senha antiga deixam de autenticar assim que o papel é atualizado.

O provisionamento aborta se o papel preexistente for membro de outro papel ou possuir objetos,
porque esses vínculos poderiam reintroduzir privilégios por fora dos grants versionados. O comando
nunca imprime URLs ou senhas.
