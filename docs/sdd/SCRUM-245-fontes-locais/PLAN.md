# PLAN — SCRUM-245

## Abordagem

Trocar `next/font/google` por `next/font/local`, com os arquivos commitados no
repositório. Fontes variáveis, subset `latin`, uma por família.

A alternativa considerada e **descartada** era pôr retry no step do build. Ela
esconde o sintoma e mantém a dependência de rede: o build continuaria podendo
falhar, só com menos frequência.

## Escolha: fonte variável em vez de pesos estáticos

Um `.woff2` variável por família cobre todos os pesos de uma vez. A alternativa
— um arquivo por peso em uso — seria um pouco menor, mas cada peso novo no
futuro viraria arquivo novo e PR nova. A cobertura também ficou maior que a
anterior, porque o `next/font/google` carregava Outfit só em 600/700/800 e
JetBrains Mono só em 500/600.

| arquivo                          | família        | eixo de peso | tamanho |
| -------------------------------- | -------------- | ------------ | ------- |
| `inter-latin-var.woff2`          | Inter          | 100–900      | 48 KB   |
| `outfit-latin-var.woff2`         | Outfit         | 100–900      | 32 KB   |
| `jetbrains-mono-latin-var.woff2` | JetBrains Mono | 100–800      | 40 KB   |

121 KB no total. O `weight` declarado no `layout.tsx` acompanha o eixo de cada
arquivo: declarar faixa maior que a do arquivo faria o navegador sintetizar o
peso que falta.

## Licença

As três famílias são SIL Open Font License 1.1, que permite redistribuir desde
que o texto da licença acompanhe os arquivos. Um `*-OFL.txt` por família vai
junto em `apps/site/src/fontes/`. Sem isso, o repositório público ficaria em
violação. Nenhuma das três declara _Reserved Font Name_, então redistribuir o
subset com o nome original é permitido.

## Fallback de métricas

O `next/font/google` injeta sozinho uma fonte de fallback com métricas
ajustadas, que reduz o deslocamento de layout enquanto a fonte carrega. O
`next/font/local` não faz isso. Ignorar esse detalhe deixaria o site igual
depois de carregado, mas com mais deslocamento durante o carregamento — uma
regressão silenciosa, invisível em qualquer teste.

Por isso o `fallback` é declarado em cada família. Na JetBrains Mono o
`adjustFontFallback` fica **desligado**: o ajuste automático só conhece Arial e
Times New Roman, ambas proporcionais, e colocá-las na frente de `ui-monospace`
desalinharia os rótulos — pior que o pulo que se quer evitar.

## Guarda contra regressão

`no-restricted-imports` no `eslint.config.js` barrando `next/font/google`. Sem
isso, o próximo componente reintroduz a dependência de rede e ninguém percebe
até o deploy falhar.

Escopo do repositório inteiro, com `patterns` em vez de `paths`: um componente
em `packages/`, uma rota fora de `src`, um `next.config.ts` ou um subcaminho
como `next/font/google/target.css` chegam ao mesmo build e escapariam de uma
regra restrita a `apps/*/src` com `paths`.

## Passos e verificação

1. Criar o ticket → status muda para _Em andamento_ ao publicar a branch.
2. Baixar os `.woff2` e os `OFL.txt` → tamanhos conferidos no download.
3. Trocar o `layout.tsx` → `pnpm --filter @lumens/site build` passa.
4. Guarda no ESLint → arquivo descartável importando `next/font/google` é
   barrado; `.mjs`, `packages/**` e subcaminhos também.
5. Build limpo, com `.next` apagado → três `.woff2` como assets do site e
   nenhuma URL do Google na saída.
6. `pnpm typecheck`, `pnpm lint`, testes do site.

## Riscos

- **Fontes desatualizadas.** Arquivo commitado não recebe correção do upstream.
  Mitigado pelo `apps/site/src/fontes/README.md`, que registra as URLs de origem
  e como atualizar.
- **Faixa de peso divergente do arquivo.** Mudar o `weight` para fora do eixo
  suportado faz o navegador sintetizar o peso, sem erro de build. Não há teste
  que pegue isso; a proteção é o comentário no `layout.tsx` e o README.
- **Procedência dos binários.** Quem revisa o diff não consegue verificar que
  os bytes vieram das URLs declaradas. Registrado como exceção no `README.md`
  deste SDD.
