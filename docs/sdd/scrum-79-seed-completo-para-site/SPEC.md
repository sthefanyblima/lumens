# Spec: SCRUM-79 — seed completo para site e curadoria

> Contexto (de DISCOVERY): popular `packages/db` com um conjunto determinístico e realista que permita desenvolver a lista, o detalhe da pauta e o painel de curadoria sem o bot.
> Ticket: SCRUM-79 — T6 · Seed com blocos e as pautas do protótipo (uma em cada status)

## Comportamento principal

Com o PostgreSQL provisionado, `pnpm db:fresh` recria o banco, aplica todas as migrações e executa o seed. Ao final, a base contém blocos com bases pequena, média e grande, uma pauta em cada um dos nove status e dados relacionados suficientes para as telas públicas e de curadoria. Executar somente `pnpm db:seed` novamente não duplica registros nem viola constraints.

## Critérios de aceitação

- [x] `pnpm db:fresh` executa reset, migrações e seed em sequência, por um único comando.
- [x] O seed cria entre 5 e 8 blocos e cobre `base_estudantes` 120 → meta 30, 1.200 → meta 120, 5.000 → meta 300 e uma pauta de campus com `bloco_id` nulo → meta 300.
- [x] Existe ao menos uma pauta em cada status: `em_curadoria`, `recusada`, `juntando_apoios`, `meta_batida`, `cobrando`, `prometido`, `entregue_em_parte`, `descumprida` e `conquistada`.
- [x] Pautas que já bateram a meta têm apoios maiores ou iguais à meta; cada estudante apoia uma pauta no máximo uma vez.
- [x] Cada pauta tem no máximo três owners/co-owners ativos e sua linha do tempo contém `pauta_criada` e um `status_alterado` com `dados.de/para` para cada etapa do percurso `em_curadoria → juntando_apoios → meta_batida → cobrando → prometido → estado final`; `recusada` sai diretamente de `em_curadoria`.
- [x] O conjunto inclui estudantes fictícios de cursos variados, owners/co-owners, relatos nas três moderações, caminhos Fala.BR e comunidade, propostas com voluntários, promessas, respostas de conferência e curadores de teste.
- [x] Nenhum telefone ou e-mail real é persistido; HMACs SHA-256 são determinísticos e os campos cifrados usam os prefixos `seed:v1:telefone:` e `seed:v1:email:`.
- [x] O seed pode ser reaplicado sem alterar as contagens dos registros que ele administra.
- [x] Um teste em banco vazio prova a cobertura dos nove status, a coerência dos apoios e o limite de até três owners/co-owners.

## Contextuais

- **Atores e contexto:** devs do site, painel de curadoria e testes ponta a ponta executam os scripts locais; as telas consomem o banco resultante.
- **Casos de borda:** banco vazio; segunda execução do seed; pauta de campus sem bloco; metas nos limites mínimo/médio/máximo; constraints de apoio, papel e promessa ativa.
- **Não-funcional:** determinismo entre execuções, nenhum dado pessoal real ou segredo, transação única e volume pequeno o bastante para desenvolvimento local.
- **Fora de escopo:** confirmar nomes oficiais no mapa da DIACOM, implementar T17/criptografia de produção, criar funções de escrita da T9, alterar schema/migrações ou ligar o site diretamente ao banco nesta task.

## Padrões aplicáveis

- Não existe catálogo `.agent/patterns/`; seguir contratos tipados do schema, scripts existentes e padrão Vitest/PostgreSQL real de `packages/db/src/schema.test.ts`.
- Mudança cirúrgica: nenhum refactor adjacente e nenhuma dependência de dados aleatórios/Faker quando dados escritos à mão e geradores determinísticos bastam.
