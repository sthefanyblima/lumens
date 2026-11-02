# Mensagens modelo da Meta

SCRUM-193 · RNF04 · Parte 3.

Fora da janela de atendimento de 24h, o bot só escreve primeiro com uma mensagem modelo aprovada pela
Meta. São cinco, todas da categoria **UTILITY** e em `pt_BR`. A fonte da verdade é
[`apps/backend/src/bot/whatsapp/modelos.ts`](../../apps/backend/src/bot/whatsapp/modelos.ts); este
documento só mostra os textos para revisão e registra o andamento da aprovação.

## Os textos

Todas levam o rodapé "Lumens · pautas estudantis da UFAL". "Ver a pauta" é um botão de link para
`<site>/p/{slug}`.

| Modelo                    | Para quem    | Texto                                                                                                                                                                                 | Botões                       |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `lumens_meta_batida`      | apoiadores   | A pauta "{{1}}", que você apoiou, chegou à meta de {{2}} apoios. Agora ela segue para os responsáveis na universidade, e você recebe aqui a resposta oficial quando ela chegar.       | Ver a pauta                  |
| `lumens_resposta_oficial` | apoiadores   | A pauta "{{1}}", que você apoiou, recebeu resposta oficial de {{2}}. A resposta completa está na página da pauta.                                                                     | Ver a pauta                  |
| `lumens_conferencia`      | apoiadores   | A pauta "{{1}}", que você apoiou, tinha uma promessa para {{2}}: {{3}}. Foi feito? Você pode responder até {{4}}, e a resposta de quem apoiou decide o resultado que aparece no site. | Sim · Em parte · Não         |
| `lumens_lembrete_prazo`   | responsáveis | Lembrete da pauta "{{1}}": o prazo da UFAL para responder à manifestação no Fala.BR vence em {{2}}. Avisamos aqui quando a resposta chegar.                                           | Ver a pauta                  |
| `lumens_owner_inativo`    | responsáveis | Você é responsável pela pauta "{{1}}" e não vemos atividade sua nela desde {{2}}. Quer continuar como responsável?                                                                    | Quero continuar · Quero sair |

### Por que os textos são assim

- **Sem apelo nenhum.** Nada de "compartilhe" ou "ajude a divulgar". A Meta reclassifica como
  marketing qualquer modelo com intenção promocional, e marketing custa mais e pesa contra a
  qualidade do número (decisão da SCRUM-192).
- **Sempre sobre algo da pessoa.** "A pauta que você apoiou", "você é responsável". Utilitário
  precisa ser específico de quem recebe.
- **Nenhuma variável na ponta do texto.** A Meta recusa corpo que começa ou termina com variável.
- **Os botões da conferência são respostas que o bot já entende.** "Sim", "Em parte" e "Não" são
  formas aceitas por `interpretarResposta` (SCRUM-224), então tocar no botão e digitar caem no
  mesmo caminho.

Os testes em `modelos.test.ts` conferem as regras que fazem a Meta recusar uma submissão: nome,
numeração das variáveis, exemplos, pontas do texto e limites de tamanho.

## Como submeter

Precisa de quem tem acesso ao app da Meta: o token (`META_TOKEN`) e o id da conta do WhatsApp
Business (`META_WABA_ID`, no WhatsApp Manager). As duas ficam no `.env` da raiz.

```bash
# confere o que vai ser enviado, sem enviar nada
pnpm --filter @lumens/backend modelos --site https://<dominio-do-site>

# envia os cinco
pnpm --filter @lumens/backend modelos --site https://<dominio-do-site> --enviar

# envia um só
pnpm --filter @lumens/backend modelos --site https://<dominio-do-site> --so lumens_conferencia --enviar
```

**O domínio fica fixo no botão.** Trocar de domínio depois exige editar o modelo e esperar nova
aprovação. Submeta com o domínio definitivo do site, não com o de homologação.

A resposta da Meta traz `id`, `status` e `category`. Se `category` vier `MARKETING`, a Meta leu o
texto como promocional: ajuste o texto e reabra a SCRUM-192 antes de seguir.

Para mudar um texto depois de aprovado: altere `modelos.ts`, submeta de novo e só então faça deploy
de quem envia. A Meta recusa envio cujo número de variáveis não bate com o modelo aprovado.

## Andamento

Atualize a tabela a cada submissão.

| Modelo                    | Submetido em | Situação    | Categoria aprovada |
| ------------------------- | ------------ | ----------- | ------------------ |
| `lumens_meta_batida`      |              | não enviado |                    |
| `lumens_resposta_oficial` |              | não enviado |                    |
| `lumens_conferencia`      |              | não enviado |                    |
| `lumens_lembrete_prazo`   |              | não enviado |                    |
| `lumens_owner_inativo`    |              | não enviado |                    |

## O que este documento não resolve

- **Webhook das respostas rápidas (Parte 2).** Tocar num botão de modelo chega ao webhook como
  mensagem `type: 'button'`, com `button.text` e `button.payload`, e não como `interactive`. O tipo
  `MetaMessage` ainda não aceita esse formato.
- **Quando sai o lembrete de prazo** e o que acontece com o owner que responde "Quero sair" ou não
  responde: são regras das histórias do agendador. Os textos não prometem nada além de perguntar.
