# Spec: SCRUM-78 — evento append-only no PostgreSQL

> Contexto (de DISCOVERY): proteger em `packages/db` a linha do tempo permanente de cada pauta contra alteração ou remoção, inclusive quando o acesso não passa pelo domínio.
> Ticket: SCRUM-78 — T5 · Trigger que impede UPDATE e DELETE na tabela evento + teste

## Comportamento principal

Depois da migração, uma conexão com permissão de escrita continua conseguindo inserir uma nova linha em `evento`. Qualquer tentativa de atualizar, apagar ou truncar eventos é interceptada antes da operação e falha com a mensagem `evento é somente inserção`. A FK de `evento.pauta_id` permanece `ON DELETE RESTRICT`, portanto uma pauta referenciada por evento também não pode ser apagada.

## Critérios de aceitação

- [x] Inserir um evento válido persiste a linha normalmente.
- [x] Atualizar qualquer coluna de `evento`, incluindo `dados`, falha com a mensagem `evento é somente inserção` e não altera a linha.
- [x] Apagar um evento falha com a mensagem `evento é somente inserção` e não reduz a contagem.
- [x] Executar `TRUNCATE evento` falha com a mensagem `evento é somente inserção`.
- [x] Apagar uma pauta que possui evento falha por violação da FK `evento_pauta_id_pauta_id_fk` configurada com `ON DELETE RESTRICT`.
- [x] A operação e a forma correta de corrigir a linha do tempo ficam documentadas em `packages/db/README.md`: correções geram um evento novo; reset local recria o banco em vez de truncar `evento`.

## Contextuais

- **Atores e contexto:** qualquer ator conectado ao PostgreSQL que alcance a tabela `evento`; a proteção não depende da aplicação ou do domínio.
- **Casos de borda:** o bloqueio de UPDATE não pode ficar restrito à coluna `dados`; `TRUNCATE` deve ser bloqueado por statement; a FK precisa impedir exclusão indireta da pauta.
- **Não-funcional:** integridade e auditabilidade (RN11/RNF08); a regra deve existir no banco e ser comprovada em PostgreSQL real.
- **Fora de escopo:** registrar eventos pelo domínio, views públicas e UI continuam nas tasks dependentes.

## Padrões aplicáveis

- Nenhum catálogo `.agent/patterns/` está configurado; seguir as convenções atuais das migrações Drizzle e dos testes Vitest/PostgreSQL de `packages/db/src/schema.test.ts`.

## Extensão: segunda camada por privilégios

Solicitada por @sthefanyblima após o REVIEW inicial. O banco passa a separar o owner/migrador do
login usado pelo backend:

- `lumens` continua dono dos objetos e executa migrações por `DATABASE_URL_MIGRACAO`, carregada
  apenas de `.env.database` pelos comandos administrativos.
- `lumens_app` é um login sem superuser, `CREATEDB`, `CREATEROLE`, replicação ou bypass de RLS e
  passa a ser usado por `DATABASE_URL`.
- O papel da aplicação recebe `USAGE` no schema e DML nas tabelas, mas não recebe `UPDATE`,
  `DELETE` nem `TRUNCATE` em `evento`.
- A migração mantém o trigger como proteção para owner/migrador; por isso o acesso administrativo
  continua falhando com `P0001`, enquanto o acesso da aplicação falha antes com `42501`.

### Critérios de aceitação da extensão

- [x] Um comando versionado e multiplataforma provisiona ou endurece `lumens_app` sem imprimir
      URL ou senha e pode ser reaplicado; memberships ou ownership incompatíveis fazem o comando
      falhar com diagnóstico seguro em vez de preservar uma rota de escalação.
- [x] `db:migrate` exige `DATABASE_URL_MIGRACAO`; o backend continua exigindo apenas
      `DATABASE_URL` e não recebe credencial administrativa.
- [x] `lumens_app` consegue selecionar e inserir eventos, mas `has_table_privilege` confirma que
      não possui `UPDATE`, `DELETE` nem `TRUNCATE` em `evento`.
- [x] UPDATE e DELETE executados como `lumens_app` falham com SQLSTATE `42501` e preservam a linha.
- [x] O owner/migrador continua recebendo a mensagem `evento é somente inserção` dos triggers.
- [x] Tabelas futuras criadas pelo mesmo owner recebem os privilégios DML padrão da aplicação;
      `evento` permanece como exceção explícita.
- [x] O backend carrega somente `.env`; Docker, provisionamento, migração e testes administrativos
      carregam `.env.database`. CI e documentação reproduzem a separação sem segredo versionado;
      ambiente local já existente pode ser atualizado sem apagar dados.

### Limites da extensão

- O nome do login é um contrato fixo do projeto (`lumens_app`); apenas a senha muda por ambiente.
- O provisionamento de segredo na hospedagem continua responsabilidade da infraestrutura futura;
  o repositório fornece o comando e as variáveis esperadas, não uma senha de produção.
- A ausência da URL administrativa no processo do backend é garantida pelos scripts do projeto;
  um operador ainda pode injetar variáveis extras diretamente no ambiente do processo.
