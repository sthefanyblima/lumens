# SCRUM-190 · O que acontece quando a conferência fica sem quórum

Spike · Parte 3 · 2026-11-02 · @JGSEIXAS
**Situação:** proposta, aguardando aprovação da equipe na PR. Aprovada, vira regra e esta linha muda.

## A pergunta

A RN10 manda apurar a conferência "Foi feito?" sete dias depois do disparo, e só vale se pelo menos
10% dos apoiadores responderem. A pergunta da task é o que acontece com a pauta quando esse quórum
não vem.

Ela bloqueia a Parte 1 porque a resposta pode exigir um valor novo no enum `status_pauta`. O enum
já está migrado (SCRUM-77) com nove valores, e nenhum deles descreve "a promessa venceu e a base
não respondeu".

## Decisão proposta

1. **A pauta vai para um status novo, `sem_conferencia`**, com rótulo público sugerido
   "Encerrada sem conferência". É terminal, como `conquistada`, `entregue_em_parte` e
   `descumprida`.
2. **A promessa fecha com `resultado = 'sem_quorum'`.** É o valor que a apuração da PR #14
   (SCRUM-226) já devolve, então nada muda no domínio.
3. **O evento público da apuração leva a participação** (`respondentes` de `apoiadores`). O site
   mostra "12 de 300 responderam" em vez de um selo vazio. Isso é o que torna o status honesto:
   quem olha vê por que não houve veredito.
4. **A curadoria não decide no lugar da base.** Não há botão para "resolver na mão" uma conferência
   sem quórum.
5. **Sem prorrogação nem segunda rodada na v1.** A janela continua de sete dias, fixa.

## Por que um status novo, e não um dos que já existem

| Alternativa                           | Por que não                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manter `prometido`                    | A data de entrega já passou. A pauta ficaria anunciando uma promessa vencida para sempre, sem nada que a tire dali.                                                                                                                            |
| Cair em `descumprida`                 | Silêncio não é "não foi feito". Uma pauta resolvida de verdade, numa turma que não respondeu, sairia em público como promessa quebrada. O erro cai sobre quem trabalhou e sobre quem prometeu.                                                 |
| Cair em `entregue_em_parte`           | Diria que a base achou que foi feito pela metade, e a base não disse nada. Esse status já tem significado na apuração (empate ou maioria nenhuma) e misturar os dois casos apaga a diferença.                                                  |
| Cair em `conquistada`                 | É o pior erro possível. A apuração exige maioria absoluta justamente para não anunciar vitória que não houve.                                                                                                                                  |
| Curador decide com base em evidência  | Põe na mão de uma pessoa o veredito que a RN10 entrega à base. Também cria trabalho manual sem prazo e abre espaço para pressão sobre a curadoria. Se a equipe quiser esse caminho no futuro, ele cabe por cima do status novo sem desfazê-lo. |
| Prorrogar a janela até bater o quórum | A conferência deixa de ter prazo. A pauta pode ficar meses em `prometido`, e cada rodada extra gasta a cota diária da Meta, onde a conferência já é o disparo de prioridade 1.                                                                 |

O status novo é o único que diz exatamente o que aconteceu: o prazo passou, perguntamos, e a base
não respondeu o bastante para haver veredito.

## Por que não uma segunda rodada (ainda)

Uma repescagem, mandando lembrete só para quem não respondeu, provavelmente sobe a participação. Mas
ela custa até 90% da base em cota, e ainda não sabemos se a participação real vai ficar perto de
10% ou muito acima. Fica de fora até termos dado: se, nas primeiras conferências, mais de uma em
cada quatro cair em `sem_conferencia`, a repescagem vira história própria.

## O que muda em cada parte

| Parte         | Mudança                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · banco     | Migração nova: `ALTER TYPE status_pauta ADD VALUE 'sem_conferencia' AFTER 'descumprida'`. Atualizar a tabela de status em `docs/database/schema.md`. Nenhum dado existente muda. |
| 1 · domínio   | Nada na apuração (`sem_quorum` já existe na PR #14). A transição `prometido → sem_conferencia` entra junto com as demais transições de status.                                   |
| 3 · agendador | Ao fechar a janela, se a apuração der `sem_quorum`, grava a promessa e muda a pauta na mesma transação, como nos outros três resultados.                                         |
| 4 · site      | Rótulo público e um texto curto explicando o status, com a participação vinda do evento.                                                                                         |
| 5 · curadoria | Nada. O status só aparece no painel como mais um final possível.                                                                                                                 |

### Nota sobre a migração

`ALTER TYPE ... ADD VALUE` não pode ser usado na mesma transação que o valor novo. A migração precisa
adicionar o valor e não fazer mais nada com ele. Seed ou testes que usem `sem_conferencia` rodam
depois, já em outra transação.

## O que ainda depende de alguém

- **Rótulo público:** "Encerrada sem conferência" é sugestão. Os rótulos de todos os status são
  validados na T7.
- **Quem abre a migração:** a Parte 1. Esta spike não traz código, como pede a task.
