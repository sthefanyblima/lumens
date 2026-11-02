# Plano de testes — SCRUM-79: seed completo

<!-- Gerado pela skill /tour:test-authoring (passo 1, subagente independente).
     Será aprovado pelo mesmo gate do WORKING_PLAN.md antes da escrita dos testes. -->

Aprovado em: 2026-11-02 por @sthefanyblima
Linguagem/framework: TypeScript, Vitest e PostgreSQL real
Exemplos do repo usados como base: `packages/db/src/schema.test.ts`, `packages/db/src/privileges.test.ts`, `packages/dominio/src/meta.test.ts`
Oráculo: SCRUM-79, `WORKING_SPEC.md`, `WORKING_PLAN.md` e pares literais da RN04

Os testes não importarão os arrays do seed para obter valores esperados e não dependerão da ordem de execução.

## Casos

- [principal · integração · smoke] **popula banco vazio com os nove status** — oráculo: nove pautas e os nove status literais da spec — pega: seed vazio, status ou pauta omitida/duplicada.
- [principal · integração] **cria blocos e metas nas três escalas** — oráculo: seis blocos e pares 120→30, 1200→120, 5000→300 — pega: bloco, percentual, piso ou teto incorreto.
- [fronteira · integração] **cria pauta de campus sem bloco** — oráculo: `bloco_id IS NULL` e meta 300 — pega: associação indevida ou meta incorreta.
- [combinações · integração] **mantém apoios coerentes com cada status** — oráculo: pré-meta `< meta`; de `meta_batida` em diante `>= meta`, incluindo pautas sem apoio na consulta — pega: estado avançado sem apoios ou agregação que omite zero.
- [principal · integração] **não duplica apoio por estudante e pauta** — oráculo: conjunto não vazio e nenhum par duplicado — pega: geração/reaplicação incorreta.
- [fronteira · integração] **limita owners e co-owners ativos** — oráculo: no máximo três papéis ativos por pauta e presença dos dois papéis no conjunto — pega: limite aplicado somente a owners.
- [transição de estado · integração] **mantém histórico contínuo até o status atual** — oráculo: `pauta_criada`, percursos `de/para` literais e último destino igual ao status persistido — pega: evento faltante, fora de ordem ou final divergente.
- [principal · integração] **inclui relatos nas três moderações** — oráculo: `pendente`, `aprovado` e `recusado`, com pauta e autor existentes — pega: categoria ausente ou dado desconectado.
- [principal · integração] **inclui caminhos Fala.BR e comunidade** — oráculo: ambos os tipos relacionados; Fala.BR com protocolo e prazo — pega: tipo/campo exigido ausente.
- [principal · integração] **disponibiliza proposta com voluntário** — oráculo: relacionamento completo proposta→pauta e voluntário→proposta/estudante — pega: tabelas preenchidas isoladamente.
- [principal · integração] **disponibiliza promessa com resposta de conferência** — oráculo: relacionamento completo promessa→pauta/curador e resposta→promessa/estudante — pega: promessa sem conferência utilizável.
- [principal · integração] **inclui cursos variados e curador ativo** — oráculo: mais de um curso não vazio e ao menos um curador ativo — pega: massa homogênea ou curadoria indisponível.
- [segurança · integração] **persiste somente contatos fictícios** — oráculo: HMAC hexadecimal e placeholder com prefixo reservado de desenvolvimento — pega: telefone/e-mail em claro ou cifra confundível com produção.
- [regressão · integração] **reaplica sem aumentar contagens nem apagar sentinela externa** — oráculo: todas as tabelas administradas preservam contagens e uma linha alheia permanece idêntica — pega: IDs variáveis, duplicação ou limpeza destrutiva.
- [exceção · integração] **desfaz inserções quando uma gravação tardia falha** — oráculo: erro PostgreSQL induzido em tabela posterior e nenhuma linha do seed persistida — pega: transação ausente ou commit parcial.
- [negativo · processo] **recusa CLI sem `DATABASE_URL`** — oráculo: processo falha com diagnóstico da variável, mesmo com URL administrativa — pega: fallback indevido ou falso sucesso.
- [exceção · processo] **não expõe credenciais em erro de conexão** — oráculo: processo falha sem usuário/senha sentinela na saída — pega: URL sensível em log.
- [principal · smoke manual] **executa `pnpm db:fresh` em banco local destinado a reset** — oráculo: reset remove sentinela, migrações e seed deixam os nove status consultáveis — pega: comando ausente, ordem errada ou etapa omitida.

## Dimensões não-funcionais (ISO 25010) conferidas

- **Functional suitability:** cobertura dos status, vínculos, metas e históricos.
- **Security:** contatos fictícios e ausência de credenciais nos erros; login restrito coberto pelas regressões existentes de privilégio.
- **Reliability:** rollback, reaplicação e preservação de dados externos.
- **Performance efficiency:** ponto cego assumido; massa de 300 estudantes é pequena e a task não define SLA.
- **Compatibility/Maintainability:** runner público, PostgreSQL real e regressão das suítes existentes.
- **Safety:** não aplicável a risco físico.

## Lacunas / TBD

- O formato do HMAC não prova sozinho a origem fictícia; a revisão também inspecionará as entradas determinísticas e a chave exclusiva de desenvolvimento.
- A suposição de apoios pré-meta `< meta` é mais restritiva que o requisito mínimo e está explicitada no plano para aprovação.
- Concorrência e recuperação de banco manualmente divergente não têm comportamento especificado nesta task.
- O smoke de `db:fresh` é destrutivo e só deve rodar em banco local explicitamente destinado a reset.

## Execução e revisão

- 28 testes do seed passaram em PostgreSQL real, sem erros não tratados.
- `pnpm typecheck`, `pnpm lint` e `pnpm format:check` passaram.
- Revisão independente dos testes: aprovada após fortalecer determinismo entre dois bancos e o ciclo de encerramento das conexões.
- Revisão independente do código: `APROVADO`, sem achados P0–P3 após corrigir a cronologia das conferências.
- A suíte completa do banco teve 63 testes verdes e falhou somente nos testes preexistentes que exigem `.env.database` e `DATABASE_URL` autenticando `lumens_app`.
