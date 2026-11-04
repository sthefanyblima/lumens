# Fontes locais do site

Arquivos `.woff2` variáveis, subset `latin`, consumidos por `next/font/local` em
`src/app/layout.tsx`.

## Por que locais

O `next/font/google` baixa as fontes de `fonts.gstatic.com` **durante o build**.
Quando essa chamada falha no runner, o Turbopack não resolve o módulo e o build
do site quebra — foi o que derrubou a `main` no merge da PR 33. Como o job
`deploy` depende do `check`, a mesma falha passou a bloquear a publicação.
Arquivos locais tiram a rede do caminho do build.

Para a dependência não voltar sem ninguém perceber, o `eslint.config.js` tem um
`no-restricted-imports` barrando `next/font/google` em todo o repositório.

## Fallback de métricas

O `next/font/google` injetava sozinho uma fonte de fallback com métricas
ajustadas, que reduz o pulo de layout enquanto a fonte carrega. O
`next/font/local` não faz isso sozinho, então o `layout.tsx` declara `fallback`
em cada família.

Na JetBrains Mono o `adjustFontFallback` está **desligado de propósito**: o
ajuste automático só conhece Arial e Times New Roman, ambas proporcionais, e
colocá-las na frente de `ui-monospace` desalinharia os rótulos — pior que o
pulo que se quer evitar. Nas outras duas ele fica ligado, e o Next calcula as
métricas a partir dos próprios arquivos.

## Origem

Baixados do Google Fonts, bloco `/* latin */` do CSS de cada família.

| arquivo                          | família        | faixa de pesos | origem                                                                        |
| -------------------------------- | -------------- | -------------- | ----------------------------------------------------------------------------- |
| `inter-latin-var.woff2`          | Inter          | 100–900        | `fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2`    |
| `outfit-latin-var.woff2`         | Outfit         | 100–900        | `fonts.gstatic.com/s/outfit/v15/QGYvz_MVcBeNP4NJtEtq.woff2`                   |
| `jetbrains-mono-latin-var.woff2` | JetBrains Mono | 100–800        | `fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD7OwE.woff2` |

Para atualizar, pegue a URL do bloco `latin` em
`https://fonts.googleapis.com/css2?family=<Família>:wght@<faixa>&display=swap`
com User-Agent de navegador moderno — sem isso o Google devolve `ttf` em vez de
`woff2`. Confira se a faixa de pesos mudou e ajuste o `weight` no `layout.tsx`.

## Licença

As três famílias são SIL Open Font License 1.1, que permite redistribuir desde
que o texto da licença acompanhe os arquivos. Os `*-OFL.txt` desta pasta são
isso — não remova.
