# SCRUM-192 · Canal dos avisos que só informam

Spike · Parte 3 · 2026-11-02 · @JGSEIXAS
**Situação:** proposta, aguardando aprovação da equipe na PR. Aprovada, vira regra e esta linha muda.

## A pergunta

O que só informa (sem pedir resposta) vai por e-mail? A ideia é poupar a cota de 250 da Meta para o
que precisa de ação. A decisão muda as histórias 3.2 e 3.6, que pela SCRUM-202 e pela SCRUM-193 são
os avisos de **meta batida** e de **resposta oficial**.

| Aviso                    | Pede ação?                      |
| ------------------------ | ------------------------------- |
| Meta batida              | Não                             |
| Resposta oficial         | Não                             |
| Conferência "Foi feito?" | Sim: responder sim/em parte/não |
| Lembrete de prazo        | Sim, ao owner                   |
| Owner inativo            | Sim, ao owner                   |

## Decisão proposta

**Não. Na v1 todos os avisos vão pelo WhatsApp.** Os que só informam saem com prioridade menor na
fila (SCRUM-202) e podem atrasar quando a cota aperta. O site mostra a novidade na hora pela linha
do tempo, então ninguém fica sem a informação, só sem a notificação.

## Por quê

1. **E-mail não alcança todo mundo.** No esquema, `estudante.email_hmac` é opcional: só tem e-mail
   quem escolheu "Verificar e-mail" no menu do bot (história 2.4). Quem não verificou precisaria
   cair no WhatsApp de qualquer forma, e o mesmo aviso passaria a ter dois caminhos, dois textos e
   dois registros de entrega.
2. **Os avisos que só informam são o que tira o bot dos 250.** Pela documentação da Meta, um dos
   caminhos para subir a 2.000 é entregar 2.000 mensagens fora da janela de atendimento em 30 dias
   (detalhes na SCRUM-191). Meta batida e resposta oficial são boa parte desse volume. Desviá-los
   para o e-mail adia justamente a saída do aperto que motivou a pergunta.
3. **A cota aperta menos do que parecia.** Ela conta pessoas diferentes numa janela móvel de 24h,
   não mensagens. Os avisos de uma mesma pauta saem com semanas de distância, então não se somam
   no mesmo dia. O pico real é o disparo de uma pauta grande (até 300 pessoas), que cabe em dois
   dias a 250 e em um a 2.000.
4. **O SMTP que existe não foi feito para aviso coletivo.** O backend já tem `EMAIL_*` para o
   código de verificação, que é uma mensagem para quem acabou de pedir. Aviso coletivo é outra
   coisa: até 300 destinatários de uma vez, limite de envio do provedor, tratamento de devolução e
   link de descadastro em cada mensagem. Nada disso está planejado no sprint.
5. **Estudante lê WhatsApp, não e-mail institucional.** O bot pede o e-mail institucional
   (`@*.ufal.br`), que pouca gente abre no dia a dia.

## O risco que esta decisão aceita

Aviso que só informa é o tipo que as pessoas bloqueiam quando acham irrelevante, e bloqueio derruba a
**qualidade** do número, que a Meta usa para subir o limite e para manter os modelos como
utilitários. Mitigações, todas já no escopo de outras tasks:

- **Texto utilitário de verdade** (SCRUM-193): o aviso fala da pauta que a pessoa apoiou, sem apelo,
  sem "compartilhe". Mensagem com cara de campanha vira marketing, custa mais e conta contra a
  qualidade.
- **Um aviso por evento por pessoa**: a fila já junta duplicatas (SCRUM-202).
- **Só para quem apoiou**: ninguém recebe aviso de pauta que não apoiou.

## Quando reabrir

Reabrir esta decisão se acontecer qualquer um destes:

- A qualidade do número cair para média ou baixa no WhatsApp Manager.
- Avisos que só informam ficarem mais de **três dias** na fila, de forma recorrente, mesmo depois de
  o limite subir para 2.000.
- A Meta reclassificar os modelos de meta batida ou resposta oficial como marketing.

## O que muda nas histórias

| História               | Mudança                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 3.2 · meta batida      | Canal fica WhatsApp. Critério de aceite novo: o aviso pode sair depois, por prioridade; o site mostra o evento na hora.        |
| 3.6 · resposta oficial | Igual à 3.2.                                                                                                                   |
| SCRUM-193              | Os dois modelos precisam ser aprovados como **utilitários**. Se a Meta os classificar como marketing, esta decisão é reaberta. |
| SCRUM-202              | Nenhuma mudança: a fila continua com um canal só.                                                                              |

## Fontes

- [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Template categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)
- Esquema: [`docs/database/schema.md`](../database/schema.md)
