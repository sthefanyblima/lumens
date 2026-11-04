# Fonte local do painel

`inter-latin-var.woff2`, variável, subset `latin`, consumida por
`next/font/local` em `src/app/layout.tsx` e exposta como `--fonte-corpo`.

## Por que local

O `next/font/google` baixa as fontes durante o build, e uma falha de rede no
runner quebra o `check` — que é pré-requisito do `deploy`. O
`eslint.config.js` barra esse import em todo o repositório.

## Cópia deliberada

Este arquivo é **byte a byte o mesmo** de `apps/site/src/fontes/`, e a
duplicação é intencional. O `next/font/local` resolve o `src` como caminho
relativo ao arquivo que importa; consumir de um pacote do workspace exigiria
atravessar o symlink do pnpm, frágil demais para economizar 48 KB em um
arquivo só.

Se um dia uma terceira superfície precisar da Inter, aí vale extrair um pacote
compartilhado — com dois consumidores seria abstração prematura.

**Ao atualizar a Inter, atualize as duas cópias.** A procedência e as
instruções de atualização estão em
[`apps/site/src/fontes/README.md`](../../../site/src/fontes/README.md), que é
a fonte de verdade; não duplique as URLs aqui.

## Licença

SIL Open Font License 1.1, que permite redistribuir desde que o texto da
licença acompanhe os arquivos. É o que o `inter-OFL.txt` desta pasta é — não
remova.
