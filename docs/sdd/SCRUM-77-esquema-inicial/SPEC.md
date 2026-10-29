# Spec: SCRUM-77 — esquema inicial do Lumens

Data: 2026-10-26. Responsável: @sthefanyblima.
Fonte: conteúdo da SCRUM-77 e da história SCRUM-69 colado pela dev nesta conversa.

## Comportamento principal

Em uma base PostgreSQL 17 vazia, `pnpm db:migrate` instala o contrato inicial de dados compartilhado pelas partes 1 a 5. `pnpm db:generate` gera futuras migrações SQL editáveis a partir do esquema Drizzle. O pacote `@lumens/db` exporta as tabelas e seus tipos TypeScript sem abrir conexão ao ser importado.

## Critérios de aceitação

- AC1: criar as 16 tabelas da task: estudante, codigo_verificacao, bloco, pauta, papel_pauta, apoio, relato, caminho, proposta, voluntario, promessa, resposta_conferencia, evento, conversa, mensagem_processada e curador.
- AC2: enum de pauta contém exatamente em_curadoria, recusada, juntando_apoios, meta_batida, cobrando, prometido, entregue_em_parte, descumprida e conquistada.
- AC3: PKs compostas rejeitam apoio duplicado por pauta/estudante, voluntário duplicado por proposta/estudante e resposta duplicada por promessa/estudante; wamid é PK.
- AC4: telefone_hmac e email_hmac de estudante são únicos; slugs de bloco e pauta são únicos; duas promessas ativas para a mesma pauta são rejeitadas.
- AC5: nenhuma coluna específica de telefone ou e-mail em texto puro. Decisão da dev em 2026-10-26: curador também usa email_hmac e email_cifrado.
- AC6: FKs usam ON DELETE RESTRICT e têm índices adequados; pauta tem índice por status; evento tem índice por pauta/criado_em; promessa tem índice único parcial para ativa.
- AC7: pauta tem tsvector gerado em português a partir de título e descrição e índice GIN.
- AC8: migração do zero funciona localmente e no CI; reaplicação não duplica objetos; testes contra PostgreSQL verificam as restrições.
- AC9: tipos exportados de @lumens/db compilam em um consumidor do pacote dominio.
- AC10: diagrama ER e decisões de modelagem documentam a primeira versão para discussão na T7.

## Matriz de campos da fonte

Esta matriz preserva os nomes recebidos no ticket; nulabilidade/defaults concretos serão documentados no schema. A substituição de email do curador foi confirmada pela dev.

| Tabela               | Campos                                                                                                                | Restrição/enum explícito da fonte                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| estudante            | id, telefone_hmac, telefone_cifrado, email_hmac, email_cifrado, curso, verificado_em, saiu_em                         | HMACs únicos                                                                               |
| codigo_verificacao   | telefone_hmac, codigo_hash, expira_em, tentativas                                                                     | Prazo de 10 minutos e tentativas limitadas, operacionalização no domínio                   |
| bloco                | id, slug, nome, base_estudantes                                                                                       | slug único                                                                                 |
| pauta                | id, slug, titulo, descricao, bloco_id, categoria, status, meta, criada_em, aprovada_em, meta_batida_em, motivo_recusa | bloco_id nulo = campus; slug único; nove status do AC2; adicionar coluna de busca tsvector |
| papel_pauta          | pauta_id, estudante_id, papel, desde, ate, ultima_atividade_em                                                        | papel: owner, co_owner; máximo três ativos é do domínio                                    |
| apoio                | pauta_id, estudante_id, origem, criado_em                                                                             | PK pauta/estudante; origem: bot, site                                                      |
| relato               | id, pauta_id, estudante_id, texto, foto_chave, moderacao, moderado_em                                                 | moderacao: pendente, aprovado, recusado                                                    |
| caminho              | id, pauta_id, tipo, status, protocolo, prazo, aberto_em                                                               | tipo: falabr, comunidade, representante                                                    |
| proposta             | id, pauta_id, descricao, pessoas_necessarias, status, executada_em                                                    | status: aberta, executada                                                                  |
| voluntario           | proposta_id, estudante_id, criado_em                                                                                  | PK proposta/estudante                                                                      |
| promessa             | id, pauta_id, resumo, data_entrega, fonte, registrada_por, conferencia_abre_em, conferencia_fecha_em, resultado       | Uma ativa por pauta; proposta de ativa = resultado nulo                                    |
| resposta_conferencia | promessa_id, estudante_id, resposta, criado_em                                                                        | PK promessa/estudante; resposta: sim, em_parte, nao                                        |
| evento               | id, pauta_id, tipo, dados, origem, publico, criado_em                                                                 | dados JSONB sem dados pessoais; origem: bot, curadoria, agendador; trigger na T5           |
| conversa             | telefone_hmac, passo, dados, atualizado_em                                                                            | Dados privados do backend; retenção de 24h operacionalizada no domínio/agendador           |
| mensagem_processada  | wamid, recebida_em                                                                                                    | PK wamid                                                                                   |
| curador              | id, email_hmac, email_cifrado, nome, ativo                                                                            | email em texto puro substituído por decisão humana                                         |

Defaults obrigatórios: timestamps de criação com now(), conforme campo criado_em/criada_em ou equivalente. Todos os relacionamentos definidos como FK usam ON DELETE RESTRICT. Não há enum fornecido para categoria, status de caminho, tipo de evento e resultado de promessa.

## Contextuais

- Atores: desenvolvimento, CI, domínio e futuros consumidores bot/agendador/site/curadoria.
- Casos de borda: duplicatas, referências inexistentes, exclusão de registros referenciados, campos obrigatórios ausentes, enum inválido, promessa concluída permitindo uma nova ativa, instalação e reaplicação de migração.
- Não funcional: dados identificadores protegidos no esquema; conexão de teste separada; nenhum reset da base de desenvolvimento nos testes.
- Fora de escopo desta entrega: trigger de evento e bloqueio de TRUNCATE (T5), seed e db:fresh (T6), validação humana pelas partes 2 a 5 e catálogo final de eventos/rótulos (T7), regras de negócio e expiração operacional, views públicas e implementação da cifra/HMAC.

## Padrões aplicáveis

Não há catálogo .agent/patterns nem configuração Tour no repositório. Usar TypeScript strict, ESM, Vitest, ESLint e Prettier já configurados; regras de negócio continuam no domínio. Tour é opcional e utilizado somente nesta sessão local, por orientação da dev. Não criar carregadores ou política obrigatória para a equipe.
