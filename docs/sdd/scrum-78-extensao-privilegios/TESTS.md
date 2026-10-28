# Plano de testes — SCRUM-78: evento append-only

<!-- Gerado pela skill /tour:test-authoring (passo 1, subagente independente).
     Aprovado pelo mesmo gate do WORKING_PLAN.md antes da escrita dos testes. -->

Aprovado em: 2026-10-26 por @sthefanyblima
Linguagem/framework: TypeScript, Vitest, `pg`, PostgreSQL real
Exemplos do repo usados como base: `packages/db/src/schema.test.ts`
Oráculo: critérios de aceite do ticket SCRUM-78 registrados em `WORKING_SPEC.md`

## Casos

- [principal · integração · smoke] **persiste um evento válido** — oráculo: INSERT permitido e SELECT independente devolve os campos explícitos da fixture — pega: trigger indevidamente acionado em INSERT.
- [negativo · integração] **rejeita alteração de dados e de outra coluna sem modificar o evento** — oráculo: casos parametrizados para `dados` e `publico`, ambos com SQLSTATE `P0001`, mensagem `evento é somente inserção` e linha relida igual à original — pega: UPDATE aceito, parcialmente aplicado ou trigger limitado a uma coluna.
- [negativo · integração] **rejeita exclusão de evento sem reduzir a contagem** — oráculo: SQLSTATE `P0001`, mensagem exigida, contagem igual e linha ainda presente — pega: DELETE aceito ou remoção parcial.
- [operação alternativa · integração] **rejeita TRUNCATE de evento** — oráculo: SQLSTATE `P0001`, mensagem exigida e linhas preservadas — pega: bypass do trigger por limpeza da tabela.
- [integridade referencial · integração · regressão] **rejeita exclusão de pauta referenciada por evento** — oráculo: SQLSTATE `23503`, constraint `evento_pauta_id_pauta_id_fk`, pauta e evento preservados — pega: FK sem `ON DELETE RESTRICT` ou remoção indireta.
- [reaplicação · integração · regressão] **reaplica migrações sem duplicar objetos** — oráculo: journal contém exatamente duas migrações e a proteção continua instalada — pega: migração customizada não registrada ou não idempotente no runner.

## Dimensões não-funcionais (ISO 25010) conferidas

- **Security:** mutações SQL diretas, TRUNCATE e exclusão indireta cobertos; bypass administrativo e criação de papéis ficam fora de escopo.
- **Reliability:** estado persistido é relido após cada falha; o banco temporário e as fixtures não dependem da ordem dos testes.
- **Performance:** ponto cego assumido; o ticket não define volume ou orçamento de latência, e o custo constante do trigger não justifica teste de carga nesta task.
- **Compatibility:** a suíte atual continua rodando e a reaplicação do comando público continua coberta.

## Lacunas / TBD

- `P0001` foi confirmado pela suíte como SQLSTATE emitido por `RAISE EXCEPTION`.
- A segunda camada por privilégios depende da separação futura entre owner/migrador e usuário da aplicação; não é honestamente testável na configuração atual.

## Execução e revisão

- `pnpm --filter @lumens/db test`: 47 testes passaram em PostgreSQL real.
- `pnpm check`: typecheck, lint, formatação e 77 testes passaram.
- Revisão independente dos testes: aprovada após fortalecer os oráculos de membership, sequência
  futura, saída de sucesso e histórico de migrações.
- Revisão independente do código: aprovada após completar as instruções de upgrade e rotação.

## Extensão de privilégios — casos propostos

- [principal · integração] **provisiona login aleatório ausente com atributos restritos** —
  oráculo: papel único, `LOGIN` verdadeiro, cinco atributos elevados falsos e autenticação TCP real
  com a senha fornecida — pega: criação incompleta, teste por `SET ROLE` ou senha ignorada.
- [transição · integração] **endurece e rota senha de login aleatório existente** — oráculo: papel
  permissivo termina restrito com o mesmo OID; nova senha autentica e antiga falha — pega: lógica
  limitada à criação ou recriação destrutiva.
- [repetição · integração] **reaplica o provisionamento preservando identidade** — oráculo: mesma
  role/OID e atributos após duas execuções — pega: comando não idempotente.
- [negativo · integração] **recusa membership preexistente sem mutação parcial** — oráculo: erro
  específico/sanitizado, atributos e autenticação pela senha original preservados — pega: caminho
  herdado de escalação ou endurecimento parcial.
- [negativo · integração] **recusa ownership preexistente sem mutação parcial** — oráculo: erro
  específico/sanitizado, objeto, atributos e autenticação originais preservados — pega: bypass por
  propriedade ou alteração antes da validação completa.
- [principal · integração] **permite INSERT e SELECT de evento pelo login real `lumens_app`** —
  oráculo: `session_user` e `current_user` exatos, linha inserida e relida pela fixture — pega:
  grants insuficientes ou teste inadvertidamente administrativo.
- [negativo · integração] **nega UPDATE, DELETE e TRUNCATE de evento por privilégio** — oráculo:
  catálogo retorna `false`; cada comando real falha com `42501`; leitura administrativa confirma a
  linha inalterada — pega: concessão ampla que neutraliza a segunda camada.
- [principal · integração] **permite DML representativo fora de evento** — oráculo: SELECT, INSERT,
  UPDATE e DELETE como aplicação produzem os estados explícitos esperados — pega: revogação ampla
  que quebra o restante do backend.
- [regressão · integração] **mantém o trigger para o owner** — oráculo: casos existentes continuam
  falhando em `P0001` com `evento é somente inserção` — pega: substituição acidental da primeira
  camada pela revogação.
- [compatibilidade futura · integração] **aplica defaults a tabela e sequência futuras** — oráculo:
  objetos criados depois da migração pelo mesmo owner permitem DML/geração de chave sem grant
  adicional — pega: defaults ausentes ou vinculados ao criador errado.
- [upgrade · integração] **aplica `0002` sobre banco que executou `0000`/`0001`** — oráculo: runner
  histórico real cria o journal, evento sentinela e grants mutáveis adversariais a `PUBLIC`; após
  `0002`, o evento permanece idêntico, journal ganha uma entrada e privilégios efetivos da
  aplicação/PUBLIC têm os valores exatos — pega: edição retroativa, upgrade destrutivo ou REVOKE
  ausente.
- [combinações · processo] **exige URL administrativa sem fallback** — oráculo: com arquivos de
  ambiente temporários controlados, `DATABASE_URL` válida e `DATABASE_URL_MIGRACAO` ausente falham
  explicitamente — pega: fallback silencioso ou variável reposta pelo `.env.database` real.
- [combinações · processo] **usa exclusivamente a URL administrativa** — oráculo: URL de migração
  válida e `DATABASE_URL` inválida ainda aplicam as migrações no banco esperado — pega: variável
  errada no migrador.
- [configuração · processo] **backend carrega somente `.env`** — oráculo: em layout temporário,
  sentinela presente apenas em `.env.database` não aparece em `process.env` ao executar a mesma flag
  do script; o entrypoint real valida o ambiente sem variáveis administrativas e o cliente do banco
  autentica pela URL restrita — pega: carregamento direto/indireto do arquivo admin.
- [negativo · processo] **rejeita senha ausente sem mutação** — oráculo: erro específico e papel
  ausente/inalterado — pega: senha padrão implícita ou provisionamento parcial.
- [segurança · processo] **não revela credenciais em sucesso ou falha** — oráculo: senha sentinela
  com caracteres especiais e URL completa não aparecem, literal ou codificadas, em stdout/stderr;
  a falha usa autenticação realmente inválida e afirma o erro sanitizado esperado — pega:
  interpolação insegura, diagnóstico sensível ou teste que aceita qualquer exceção.

### Lacunas da extensão

- A credencial real de produção e a criação do papel no provedor só podem ser validadas quando a
  infraestrutura existir; a suíte cobre o contrato com PostgreSQL 17 local/CI.
- Papéis de teste usam nomes aleatórios e são removidos no `finally`; o login fixo `lumens_app` é
  apenas autenticado/inspecionado pela suíte, nunca reprovisionado por ela.
