# Spec: SCRUM-88 — API de leitura pública

> Ticket: SCRUM-88 — T15 · Criar a API de leitura pública
> Contexto: o site (parte 4) precisa mostrar pautas, relatos, caminhos, conquistas e atividade sem
> login. A SCRUM-87 entregou as views públicas e o login `lumens_site`, que só enxerga essas views.
> Esta API expõe as views por HTTP, só para leitura, com um contrato de resposta que lista cada
> campo: nada que não esteja declarado sai, nem se a view ganhar coluna.

## Comportamento principal

Qualquer pessoa, sem login, consulta as rotas abaixo no mesmo servidor do webhook (porta `PORT`,
padrão `3001`). Toda rota conecta ao banco com `lumens_site`, por `DATABASE_URL_LEITURA`, num pool
separado do pool da aplicação; nenhuma consulta toca tabela. Nenhuma resposta traz telefone,
e-mail, HMAC, cifra, `estudante_id` ou outro id interno (RNF01).

| Rota                | View                                                                           | Requisito | Entrega                                             |
| ------------------- | ------------------------------------------------------------------------------ | --------- | --------------------------------------------------- |
| `GET /resumo`       | `v_resumo`                                                                     | RF-S01    | pautas abertas, apoios e conquistas                 |
| `GET /blocos`       | `v_bloco`                                                                      | RF-S02    | todos os blocos, por nome                           |
| `GET /pautas`       | `v_pauta_publica`                                                              | RF-S01/02 | pautas públicas, filtro opcional `bloco`, paginadas |
| `GET /pautas/:slug` | `v_pauta_publica`, `v_relato_publico`, `v_caminho_publico`, `v_linha_do_tempo` | RF-S03    | uma pauta com relatos, caminhos e linha do tempo    |
| `GET /conquistas`   | `v_conquista`                                                                  | RF-S06    | pautas conquistadas, da mais recente                |
| `GET /atividade`    | `v_atividade`                                                                  | RF-S07    | eventos públicos, do mais recente, paginados        |

**Formato:** instantes em ISO 8601 UTC; `prazo` como `AAAA-MM-DD`. Listas paginadas respondem
`{ itens, proximo }`, com `proximo` = offset da página seguinte ou `null`; listas sem paginação,
`{ itens }`. Erros respondem `{ erro }`.

A referência completa (campos, exemplos, cabeçalhos) está em [`docs/api.md`](../../api.md).

## Critérios de aceitação

- [x] As rotas respondem `200` com os dados do seed.
- [x] `/pautas?bloco=<slug>` traz só as pautas daquele bloco; sem filtro, todas as públicas.
- [x] `/pautas/:slug` de pauta em curadoria ou recusada responde `404`, igual ao de slug inexistente.
- [x] Slug ou bloco fora do formato, `limit` fora de 1–100, `offset` negativo e parâmetro repetido
      respondem `400`.
- [x] `limit` padrão 20, máximo 100; `offset` em `/pautas` e `/atividade`.
- [x] `/atividade` vem do mais recente para o mais antigo.
- [x] Nenhuma resposta traz telefone, e-mail, HMAC ou `estudante_id` (verificado também na
      SCRUM-89).
- [x] Campo não declarado no contrato não sai na resposta.
- [x] Nenhuma rota de escrita.
- [x] CORS só para as origens configuradas; `Cache-Control` curto no sucesso.
- [x] Tipos das respostas no pacote `@lumens/contratos`, importável pelo site.
- [x] Rotas documentadas.
- [x] `/pautas/:slug` responde em menos de 300 ms localmente com o seed.

## Contextuais

- **Atores:** o site público (navegador e servidor do Next.js); qualquer pessoa sem login.
- **Casos de borda:** pauta em curadoria ou recusada pedida pelo slug; slug inexistente; slug com
  maiúscula, espaço, `..` ou mais de 120 caracteres; bloco válido que não existe; bloco sem pauta
  pública; `limit=0`, `limit=101`, `limit=abc`, `offset=-1`; `?bloco=a&bloco=b`; `offset` além do
  fim; dois eventos com o mesmo `criado_em`; pautas empatadas em apoios; pauta do campus inteiro
  (`bloco` nulo) com e sem filtro; requisição de origem fora da lista de CORS; coluna nova numa view.
- **Não-funcional:** RNF01 (identidade nunca exposta, garantida pelo login `lumens_site` e pelo
  contrato); RNF11 (página da pauta em até 2 s em conexão móvel, daí o limite de 300 ms local e o
  cache curto).
- **Fora de escopo:** rotas do painel de curadoria (parte 5); card da pauta em imagem (RF-S05,
  RF-B08); varredura de identidade no CI (SCRUM-89); as telas do site que consomem a API.
- **Dependências:** depende da SCRUM-87 (mergeada); bloqueia a SCRUM-89 e as telas do site.

## Padrões aplicáveis

- Nenhum catálogo `.agent/patterns/`. Segue o servidor Fastify já existente do webhook (`app.ts`) e
  a validação de ambiente de `config/env.ts`; zod já é dependência do back-end.
