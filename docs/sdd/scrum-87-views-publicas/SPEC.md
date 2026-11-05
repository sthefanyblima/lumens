# Spec: SCRUM-87 — views públicas e usuário do banco só de leitura

> Ticket: SCRUM-87 — T14 · Criar as views públicas e o usuário do banco só de leitura
> Contexto: o site precisa ler pautas, relatos, caminhos e a linha do tempo sem nunca alcançar
> identidade de estudante. A garantia mais forte da RNF01 é o banco: o login do site só enxerga
> views que já vêm sem identidade, então nem um bug no código do site vaza telefone ou e-mail.

## Comportamento principal

O site nunca mostra nome, telefone ou e-mail de quem apoiou, relatou ou se voluntariou; nem pautas
em curadoria ou recusadas; nem relatos ou fotos não aprovados (RN03, RN12). Do estudante, o público
vê só o curso.

Depois de `pnpm db:provision` e `pnpm db:migrate`, o login `lumens_site` consegue `SELECT` nas oito
views abaixo e recebe `permission denied` (`42501`) em qualquer tabela.

| View                | Entrega                                                                       | Filtro obrigatório                     |
| ------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| `v_resumo`          | totais: pautas abertas, apoios, conquistas                                    | só pautas públicas                     |
| `v_pauta_publica`   | pauta com bloco, status, meta, apoios, cursos dos responsáveis, próxima etapa | pauta pública                          |
| `v_relato_publico`  | relatos aprovados, só com o curso de quem relatou                             | `moderacao = aprovado` e pauta pública |
| `v_caminho_publico` | caminhos, status, prazos; propostas com nº de voluntários                     | pauta pública                          |
| `v_linha_do_tempo`  | eventos de uma pauta                                                          | `publico = true` e pauta pública       |
| `v_conquista`       | pautas conquistadas, com data, nº de apoiadores e se houve proposta executada | `status = conquistada`                 |
| `v_atividade`       | eventos públicos de todas as pautas, sem corte; quem consulta pagina          | `publico = true` e pauta pública       |
| `v_bloco`           | todos os blocos: slug, nome e base de estudantes                              | nenhum: lista até bloco sem pauta      |

**Pauta pública** = status na allowlist `juntando_apoios`, `meta_batida`, `cobrando`, `prometido`, `entregue_em_parte`, `descumprida` e `conquistada`. `em_curadoria`, `recusada` e qualquer status
criado depois ficam escondidos até serem classificados. **Pauta aberta** (para o
resumo) = `juntando_apoios`, `meta_batida`, `cobrando` ou `prometido`.

## Critérios de aceitação

- [x] `lumens_site` faz `SELECT` nas oito views.
- [x] `v_atividade` não corta resultado: com mais de 50 eventos públicos, todos voltam, e a
      paginação (`ORDER BY criado_em DESC LIMIT/OFFSET` ou cursor por `criado_em`) usa o índice
      parcial.
- [x] `v_bloco` lista todos os blocos, inclusive sem pauta ou só com pauta escondida.
- [x] Os filtros usam allowlist de status; todo valor de `status_pauta` está classificado como
      público ou escondido, e um teste falha se aparecer um sem classificação.
- [x] O README avisa que o drizzle-kit não conhece as views e explica como migrar colunas e enums
      que elas usam.
- [x] O mesmo login recebe `permission denied` em `SELECT * FROM estudante` e em qualquer tabela.
- [x] Nenhuma view tem coluna com telefone, e-mail, HMAC, cifra, `estudante_id` ou outro id.
- [x] `dados` de `v_linha_do_tempo` e `v_atividade` sai sem as chaves `id` e `*_id` do catálogo da T7
      (`caminho_id`, `proposta_id`, `promessa_id`, `relato_id`).
- [x] Caminhos, propostas e apoios de pautas escondidas não entram em `v_caminho_publico` nem em
      `v_resumo`; cursos de mandatos encerrados não entram em `cursos_responsaveis`.
- [x] A próxima etapa de `cobrando` usa o Fala.BR aberto por último; sem prazo nele, cai em
      `Aguardando resposta`, nunca no prazo de um Fala.BR anterior.
- [x] Pautas `em_curadoria`/`recusada` e relatos não aprovados não aparecem.
- [x] Com o seed, cada view devolve os dados esperados.
- [x] "Próxima etapa" derivada do status (`Faltam N apoios`, `Prazo do Fala.BR em DD/MM`, …).
- [x] `DATABASE_URL_LEITURA` documentada em `.env.example` e nas demais listas de URLs.
- [x] Colunas de cada view documentadas em `packages/db/README.md` (contrato com o site, parte 4).

## Contextuais

- **Atores:** o site (SCRUM-88 em diante) com `DATABASE_URL_LEITURA`; owner/migrador cria as views.
- **Casos de borda:** evento público de pauta escondida; evento não público de pauta pública;
  relato aprovado, caminho, proposta e apoio de pauta escondida; mandato encerrado; dois Fala.BR na
  mesma pauta, o mais recente sem prazo; ids internos dentro de `evento.dados`; tabelas e views
  criadas depois da migração; filtro de quem consulta tentando rodar antes do filtro da view
  (`security_barrier`); status novo no enum; bloco sem pauta pública; mais de 50 eventos públicos.
- **Limite da garantia:** a garantia vale para as linhas e colunas devolvidas. Metadados do
  planejador (por exemplo, contagens de `EXPLAIN ANALYZE`) não fazem parte dela.
- **Não-funcional:** RNF01 (identidade nunca exposta). Desempenho: um índice parcial para o feed de
  atividade; sem view materializada, porque o volume é pequeno.
- **Fora de escopo:** a API REST (SCRUM-88) e a varredura de identidade no CI (SCRUM-89).

## Padrões aplicáveis

- Nenhum catálogo `.agent/patterns/`. Segue o precedente da SCRUM-78: o papel é criado por
  `db:provision` antes de `db:migrate`, a senha vem de `.env.database`, e os grants ficam versionados
  numa migração custom do drizzle-kit.
