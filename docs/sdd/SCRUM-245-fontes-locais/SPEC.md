# SPEC — SCRUM-245

## Problema

O build do site dependia de uma chamada de rede. `apps/site/src/app/layout.tsx`
importava três famílias de `next/font/google`, que baixa os arquivos de
`fonts.gstatic.com` **em tempo de build**. Quando essa chamada falha no runner,
o Turbopack não resolve o módulo:

```
Error: Turbopack build failed with 12 errors:
Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
Error while looking up import map: next/font/google queries have exactly one entry
```

Aconteceu no merge da PR 33 (base do painel), em 2026-11-03, derrubando a `main`.
Só o site quebrou porque o painel não usa `next/font`.

## Por que agora

Antes, uma falha dessas deixava apenas o `check` vermelho. Depois que o job
`deploy` passou a ter `needs: check`, o mesmo engasgo de rede bloqueia a
publicação do site e do painel na Vercel. O custo de um flake subiu de
"reexecutar a run" para "produção não atualiza".

## Comportamento esperado

O build do site conclui sem nenhum acesso de rede para fontes, e o site
renderiza exatamente como antes.

## Critérios de aceitação

1. O build do site conclui sem nenhum acesso de rede para fontes.
2. Nenhuma referência a `next/font/google` em `apps/site`.
3. As três variáveis CSS (`--fonte-titulo`, `--fonte-corpo`, `--fonte-rotulo`)
   mantêm os mesmos nomes e continuam resolvendo.
4. As mesmas famílias e pesos são renderizados, sem mudança visual.
5. CI verde.

## Contexto que tornou a mudança cirúrgica

Nenhum componente importa fonte diretamente — todos consomem as três variáveis
CSS, declaradas em `globals.css`, `page.module.css`,
`componentes/componentes.module.css` e `app/dev/componentes/page.tsx`. Trocar a
origem no `layout.tsx` preservando os nomes das variáveis bastava.

## Fora de escopo

- O painel (`apps/painel`).
- Qualquer ajuste visual.
