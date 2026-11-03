# SCRUM-80 · Decisões e pedidos da equipe

> **Estado: REUNIÃO PENDENTE.** Não marque a T7 como estável nem avise a equipe enquanto os campos
> obrigatórios desta ata não estiverem preenchidos e os ajustes aprovados não estiverem no CI.

Material da apresentação: [`esquema.md`](esquema.md).

## Reunião

| Campo           | Registro                   |
| --------------- | -------------------------- |
| Data            | **PENDENTE**               |
| Participantes   | **PENDENTE**               |
| Facilitador     | parte 1                    |
| Duração         | prevista: 15–20 min        |
| Versão avaliada | branch/commit **PENDENTE** |

## Validação das partes 2 a 5

Cada parte deve confirmar ciência e registrar o que precisa chamar. “Sem pedidos” é uma resposta
válida; célula vazia ou `PENDENTE` não é confirmação.

| Parte | Representante | Viu o esquema? | Operações previstas                                                      | Resultado da auditoria técnica                                   |
| ----: | ------------- | -------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
|     2 | **PENDENTE**  | **PENDENTE**   | `criarPauta`, `registrarApoio`, owners, caminhos, protocolos e propostas | contrato cobre o bot atual; confirmação humana pendente          |
|     3 | **PENDENTE**  | **PENDENTE**   | resposta oficial, promessa, conferência, status e owner inativo          | contrato cobre o agendador previsto; confirmação humana pendente |
|     4 | **PENDENTE**  | **PENDENTE**   | leitura pública e `registrarApoio` via API quando habilitado             | tipos atuais são compatíveis; confirmação humana pendente        |
|     5 | **PENDENTE**  | **PENDENTE**   | aprovar/recusar pauta, aprovar relato, resposta oficial e promessa       | contrato cobre a curadoria prevista; confirmação humana pendente |

## Decisões

|   # | Pergunta                                                | Situação                  | Proposta ou resultado                                                                                 |
| --: | ------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
|   1 | Node.js ou Python?                                      | **DECIDIDO**              | Node.js + TypeScript                                                                                  |
|   2 | Onde hospedar backend, banco, site e fotos?             | **PARCIALMENTE DECIDIDO** | AWS + PostgreSQL. A escolha entre os serviços de backend, banco e fotos pertence à T20.               |
|   3 | A meta congela na criação ou acompanha a base do bloco? | **DECIDIDO**              | Congela na criação. Alterar `bloco.base_estudantes` não recalcula pautas existentes.                  |
|   4 | Menos de 10% dos apoiadores responderam à conferência?  | **DECIDIDO**              | Continua `prometido` e a conferência reabre uma única vez por mais sete dias.                         |
|   5 | Empate na conferência?                                  | **DECIDIDO**              | Resultado `entregue_em_parte`.                                                                        |
|   6 | O que é “owner sem responder há 30 dias”?               | **DECIDIDO**              | Nenhuma mensagem do owner ao bot em 30 dias; enviar aviso preventivo no dia 25.                       |
|   7 | Pauta do campus inteiro: qual base?                     | **DECIDIDO**              | Meta máxima 300, como na RN04 e em `calcularMeta(null)`.                                              |
|   8 | Quem revisa os PRs da parte 1?                          | **DECIDIDO**              | Revisor fixo da parte 2; a parte 2 indica a pessoa responsável.                                       |
|   9 | `descumprida` volta para `cobrando` ou `prometido`?     | **DECIDIDO**              | Quando reaberta, volta para `cobrando`. Só uma nova promessa registrada leva novamente a `prometido`. |

## Catálogo de eventos

- Catálogo final: **DECIDIDO — os quinze tipos propostos mais `pauta_criada`**.
- Não públicos: `pauta_criada`, `pauta_recusada` e o `status_alterado` que leva a `recusada`.
- Sempre públicos: treze tipos. `status_alterado` é público nas demais transições.
- Payload mínimo por tipo: **DECIDIDO** no [catálogo do esquema](esquema.md#payloads-mínimos).

Resultado final dos nomes e da visibilidade: **DECIDIDO**.

O site atual considera `entregue_em_parte` e `descumprida` encerradas. Isso continua válido enquanto
a pauta permanece nesses status; quando for reaberta, a transição para `cobrando` faz com que volte
ao conjunto de pautas abertas sem exigir mudança no filtro atual.

## Pedidos e ajustes

Nenhum pedido foi registrado porque a reunião ainda está pendente.

Quando houver pedidos, registrar uma linha por item:

| ID  | Parte | Pedido | Impacto | Decisão | Evidência de implementação |
| --- | ----- | ------ | ------- | ------- | -------------------------- |
| —   | —     | —      | —       | —       | —                          |

Classificação do impacto:

- **Documentação:** atualizar os contratos sem criar migration vazia.
- **Domínio/API:** revisar o plano e implementar a função com teste de regra e evento atômico.
- **Persistência:** alterar `schema.ts`, gerar uma migration nova sem editar as anteriores, atualizar o
  seed e provar upgrade sobre dados existentes.
- **Fora da T7:** registrar responsável e task de destino; não ampliar silenciosamente esta entrega.

## Checklist para congelar a versão

- [ ] Partes 2, 3, 4 e 5 confirmaram ciência e registraram pedido ou “sem pedidos”.
- [x] Os nove status e todas as transições permitidas foram confirmados.
- [x] O catálogo de eventos e a visibilidade foram confirmados.
- [x] Os payloads mínimos dos eventos foram confirmados.
- [x] As decisões 3 a 9 receberam resultado explícito.
- [ ] Pedidos aprovados foram implementados; mudanças de persistência usam migration nova.
- [x] O seed representa o contrato final e não usa nomes de evento obsoletos.
- [x] Typecheck, lint, format e 341 testes passaram em PostgreSQL 17 local, no mesmo gate `pnpm check` do CI.
- [ ] Branch/commit estável foi registrado nesta ata.
- [ ] A equipe foi avisada de que a versão está na `main`.

Enquanto algum item aplicável permanecer aberto, o resultado da SCRUM-80 é material preparatório,
não o contrato estável do restante do sprint.
