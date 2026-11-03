# SCRUM-191 · Verificação da empresa na Meta

Spike · Parte 3 · 2026-11-02 · @JGSEIXAS
**Situação:** proposta, aguardando aprovação da equipe na PR. Aprovada, vira regra e esta linha muda.

## A pergunta

Tem CNPJ? Quem submete? A urgência é alta porque a verificação demora a sair, e enquanto não sai o
bot fica preso à cota de 250 da RNF06.

## O que a Meta diz hoje

Lido na documentação oficial em 2026-11-02 (links no fim). Três pontos mudam o que a equipe vinha
assumindo:

1. **A cota não é "250 conversas por dia".** É o número de **pessoas diferentes** que o bot alcança
   **fora da janela de atendimento**, numa **janela móvel de 24 horas**. Não zera à meia-noite, em
   fuso nenhum. Mensagem para quem escreveu ao bot nas últimas 24h não conta. Duas mensagens para a
   mesma pessoa dentro das 24h contam uma vez.
2. **O limite é do portfólio de negócios**, não do número. Todos os números do portfólio dividem os
   mesmos 250.
3. **Verificar a empresa não é o único jeito de sair dos 250.** A Meta oferece três caminhos para ir
   a 2.000: verificar a empresa, verificação pelo parceiro (se o número tiver sido cadastrado por
   um provedor), ou **entregar 2.000 mensagens fora da janela de atendimento em 30 dias**, com
   modelos de boa qualidade. Depois de 2.000, o limite sobe sozinho (10 mil, 100 mil, ilimitado)
   quando o bot usa metade da cota por sete dias com qualidade alta.

Para o Brasil, a verificação pede documento da pessoa jurídica. O documento central é o
**cartão CNPJ**, normalmente acompanhado de comprovante como extrato bancário da empresa. Pessoa
física não verifica.

Desde 1º de outubro de 2026 a Meta também cobra mensagens utilitárias, inclusive dentro da janela de
atendimento. O portfólio precisa de um meio de pagamento cadastrado, e quem é dono do portfólio paga.

## Tem CNPJ?

O Lumens não tem CNPJ próprio. As opções são usar o de alguém:

| Opção                                     | Avaliação                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CNPJ da UFAL**                          | Descartada. O Lumens existe para estudantes cobrarem a universidade. Se o canal for da UFAL, quem é cobrado passa a ser dono do número, do portfólio e do histórico de mensagens. Além disso, o pedido passaria por setores da reitoria, sem prazo que a equipe controle. |
| **CNPJ do DCE ou de um centro acadêmico** | Melhor encaixe. É uma entidade dos próprios estudantes, independente da administração. Depende de a entidade ter CNPJ ativo, conta bancária no nome dela e alguém da diretoria disposto a assumir o portfólio.                                                            |
| **MEI de alguém da equipe**               | Descartada. Amarra o canal de toda a comunidade a uma pessoa física que vai se formar, e põe a conta da Meta no CPF dela.                                                                                                                                                 |
| **Não verificar agora**                   | Viável. O bot funciona com 250 e pode subir para 2.000 pelo caminho das 2.000 entregas em 30 dias, sem documento nenhum.                                                                                                                                                  |

## Decisão proposta

**Não bloquear o projeto na verificação.** Seguir os dois caminhos em paralelo:

1. **Caminho principal: operar sem verificação.** Lançar com 250 e mirar as 2.000 entregas em 30
   dias. Os avisos coletivos da Parte 3 são justamente o volume que leva até lá. Para isso, os
   modelos precisam ser utilitários de verdade (SCRUM-193) e o bot não pode ser bloqueado em
   massa: a qualidade conta na avaliação da Meta.
2. **Caminho de reserva: verificação pelo DCE.** Perguntar ao DCE se ele tem CNPJ ativo e se aceita
   ser o dono do portfólio. Se aceitar, a verificação acontece no portfólio dele, e a equipe entra
   como administradora técnica.

### Quem submete

A verificação é submetida por quem é **administrador do portfólio de negócios** e tem os documentos
da entidade. No caminho do DCE, é alguém da diretoria. A equipe não submete documento de terceiro.

O que a equipe faz:

- **Responsável pela conversa com o DCE:** @JGSEIXAS (dono desta spike), até a equipe indicar
  outra pessoa.
- **Responsável técnico pelo portfólio:** quem hoje administra o app da Meta usado pelo webhook
  (SCRUM-97). A confirmar na PR.

## O que muda no código

- **RNF06 e `envio.ts`:** o comentário fala em "250 conversas por dia" e o parâmetro se chama
  `jaIniciadasHoje`. A política continua valendo, mas o contador precisa ser **pessoas distintas
  alcançadas fora da janela de atendimento nas últimas 24h**, e não "envios desde a meia-noite". A
  correção entra com a fila persistida da SCRUM-202.
- **Limite configurável:** a cota não pode ficar fixa no código, porque muda sem deploy quando a
  Meta sobe o nível. A Meta expõe o limite atual no campo
  `whatsapp_business_manager_messaging_limit` (o antigo `messaging_limit_tier` está obsoleto).

## O que ainda depende de alguém

- [ ] Perguntar ao DCE se tem CNPJ ativo e se aceita ser dono do portfólio.
- [ ] Confirmar na PR quem administra o portfólio e o app da Meta hoje.
- [ ] Cadastrar meio de pagamento no portfólio, com o dono definido acima.

## Fontes

- [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- Lista de documentos por país: [WATI](https://support.wati.io/en/articles/11463208-meta-business-verification-required-documents-by-country)
  e [Woztell](https://support.woztell.com/portal/en/kb/articles/meta-business-verification).
  São provedores, não a Meta; conferir na Central de Ajuda da Meta na hora de submeter.
