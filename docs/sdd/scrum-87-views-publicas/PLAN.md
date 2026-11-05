# Plano: SCRUM-87 — views públicas e usuário do banco só de leitura

> Aprovação: pendente.

## Abordagem

Criar as sete views numa migração custom do drizzle-kit, rodando com os privilégios do owner (sem
`security_invoker`) e com `security_barrier`. Provisionar `lumens_site` com o mesmo código que já
endurece `lumens_app`, mudando só o nome e a variável da senha. Na migração, revogar tudo de
`lumens_site` nas tabelas e sequências e conceder `SELECT` só nas views.

## Fontes e decisões

- **Regra vigente:** ticket SCRUM-87; schema de `packages/db/src/schema.ts`; catálogo de eventos e
  status da T7 em `docs/esquema.md`; precedente de papel/grants da SCRUM-78 (`0003`, `app-role.ts`,
  `provision-app-role.ts`).
- **Senha fora da migração:** como `lumens_app`, o login é criado por `pnpm db:provision` com a senha
  de `POSTGRES_SITE_PASSWORD`; a migração só concede privilégios e falha se o papel não existir.
  `db:provision` provisiona primeiro a aplicação e depois o site; a primeira falha encerra o comando.
- **Privilégios futuros:** os privilégios padrão da `0003` valem só para `lumens_app`. Nenhum é
  dado a `lumens_site`, então tabelas e views novas não chegam a ele sem `GRANT` explícito.
- **Voluntários:** pertencem à proposta. `v_caminho_publico` une caminhos e propostas
  (`tipo = 'proposta'`) em vez de inventar uma relação caminho→voluntário.
- **Próxima etapa:** coluna calculada na view. `cobrando` usa o prazo do caminho Fala.BR aberto por
  último (mesmo vencido, por ser o dado factual); se esse caminho ainda não tem prazo, o texto é
  `Aguardando resposta`, nunca o prazo de um Fala.BR anterior. `prometido` usa a promessa ativa;
  `conquistada` fica nulo.
- **Ids dentro de `dados`:** `v_linha_do_tempo` e `v_atividade` removem do JSONB as chaves `id` e
  `*_id` (o catálogo da T7 tem `caminho_id`, `proposta_id`, `promessa_id`, `relato_id`). O filtro é
  por sufixo, não por lista fechada, para cobrir tipos de evento futuros; payload que não é objeto
  vira `{}`.
- **Data da conquista:** evento público `status_alterado` com `dados.para = 'conquistada'`.
- **Feed de atividade:** `v_atividade` traz os 50 mais recentes (`ORDER BY criado_em DESC LIMIT 50`).
  Índice parcial `evento (criado_em DESC) WHERE publico`; os demais caminhos já têm índice (PKs e
  índices por `pauta_id`).
- **Fora de escopo:** API REST (SCRUM-88), varredura de identidade no CI (SCRUM-89), validação do
  JSONB de `evento.dados` no banco.

## Passos

1. Índice parcial no `schema.ts` e `drizzle-kit generate` → `0005_indice_atividade_publica.sql`.
2. `drizzle-kit generate --custom --name views_publicas` → `0006_views_publicas.sql` com as sete
   views, `REVOKE ALL` em tabelas e sequências, `USAGE` no schema e `SELECT` nas views.
3. `PAPEL_SITE` em `app-role.ts`; `executarProvisionamento({ papel: 'site' })` em
   `provision-app-role.ts`; o CLI provisiona os dois papéis.
4. `criarBancoEmMemoria` cria também `lumens_site` antes das migrações.
5. `POSTGRES_SITE_PASSWORD` em `.env.database.example` e no CI; `DATABASE_URL_LEITURA` com
   `lumens_site` em `.env.example`, no CI e no README.
6. Testes: `views-publicas.test.ts` (PGlite, `SET ROLE lumens_site`); login real em
   `privileges.test.ts`; provisionamento do site em `app-role.test.ts`.
7. Ajustar testes existentes que a migração nova afeta: contagem fixa de migrações em
   `privileges.test.ts` (passa a ler o journal) e o teste de defaults de `schema.test.ts` (restrito a
   tabelas, porque as views repetem `criado_em`, `criada_em` e `aberto_em` sem default).
8. Documentar as colunas em `packages/db/README.md`.

## Impactos e verificação

- **Consumidores:** o site passa a ter um contrato estável; `lumens_app` não muda.
- **Ambientes existentes:** é preciso definir `POSTGRES_SITE_PASSWORD` em `.env.database` e rodar
  `pnpm db:provision` **antes** de `pnpm db:migrate`; sem o papel, a `0006` falha e nada é aplicado.
  Depois, trocar `DATABASE_URL_LEITURA` no `.env` para `lumens_site`.
- **Dados e deploy:** só objetos novos (índice e views); nenhum dado é alterado.

## Riscos & decisões

- **Vazamento por filtro de quem consulta:** mitigado com `security_barrier`; `lumens_site` não pode
  criar objetos no schema `public`, mas pode criar funções temporárias.
- **Payload de evento com dado pessoal:** o banco não valida; depende do contrato da T7 no domínio.
- **Divergência de padrão:** nenhuma em relação à SCRUM-78.
