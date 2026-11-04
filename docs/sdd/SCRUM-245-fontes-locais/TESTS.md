# TESTS — SCRUM-245

Nenhum teste automatizado novo. A mudança troca a origem de um asset de build;
o comportamento que importa é o do próprio build, e o oráculo é a saída dele,
não uma asserção em runtime. Escrever um teste unitário aqui passaria com o
código quebrado.

## O que foi exercitado

| verificação                                                | oráculo                                                                       | critério |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| build do site com `.next` apagado                          | conclui, e `.next/static/media/` contém os três `.woff2`                      | 1        |
| varredura da saída do build                                | nenhuma URL `gstatic`/`googleapis` (a única ocorrência é texto de comentário) | 1        |
| CSS gerado no bundle                                       | `src: url(../media/*.woff2)`, caminho local                                   | 1        |
| busca por `next/font/google` em `apps/`                    | nenhuma importação; só comentários explicativos                               | 2        |
| variáveis CSS no bundle                                    | `--fonte-titulo`, `--fonte-corpo` e `--fonte-rotulo` resolvem                 | 3        |
| eixos `fvar` dos três arquivos contra o `weight` declarado | Inter 100–900, Outfit 100–900, JetBrains Mono 100–800 — batem                 | 4        |
| pesos usados nos CSS do site                               | 400/600/700/800 — todos dentro das faixas                                     | 4        |
| faces de fallback no CSS gerado                            | `ascent-override`/`size-adjust` calculados dos próprios arquivos              | 4        |
| `pnpm typecheck`, `pnpm lint`, 37 testes do site           | passam                                                                        | 5        |
| CI da PR 36                                                | `check: success`                                                              | 5        |

As verificações de `fvar`, CSS gerado e faces de fallback foram feitas pela
revisão independente, em contexto isolado, com fontTools.

## Guarda do ESLint

Testada com arquivos descartáveis importando `next/font/google`, apagados em
seguida:

- `apps/site/src/` — barrado
- `packages/dominio/src/` — barrado
- `.mjs` na raiz — barrado
- subcaminho `next/font/google/target.css` — barrado

## Lacunas conhecidas

- **O critério 1 não foi provado isolando a rede.** O ambiente é Windows e não
  havia forma confiável de isolá-la sem afetar a máquina da dev. A evidência é
  indireta, como descrito acima.
- **Nenhum teste falha se o `weight` divergir do eixo do arquivo.** Alguém pode
  declarar `100 900` num arquivo que vai até 800 e o build passa; o navegador
  sintetiza o peso em silêncio. A proteção hoje é o comentário no `layout.tsx` e
  o `apps/site/src/fontes/README.md`.
- **Nenhuma comparação visual automatizada.** A revisão recomendou um smoke
  manual em `/` e `/dev/componentes`, nos títulos em 800 e nos rótulos
  monoespaçados em 600 — é onde uma diferença entre instância estática e fonte
  variável apareceria primeiro.
