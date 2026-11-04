# SCRUM-245 — fontes locais para o build não depender de rede

> Artefato de SDD gerado pelo Tour em 2026-11-04. Registro do que foi
> especificado, planejado e aprovado — a contraparte documental do código.

|                            |                                                                 |
| -------------------------- | --------------------------------------------------------------- |
| **Ticket**                 | [SCRUM-245](https://ic-team-pds.atlassian.net/browse/SCRUM-245) |
| **Dev**                    | @sthefanyblima                                                  |
| **Branch**                 | `fix/SCRUM-245-fontes-locais`                                   |
| **Commit no arquivamento** | `4fa3551`                                                       |
| **Fase alcançada**         | REVIEW                                                          |
| **Tour**                   | v0.10.0                                                         |

## Documentos

| Arquivo                | O que contém                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| [`SPEC.md`](SPEC.md)   | O que foi especificado: comportamento, critérios de aceitação, o que ficou fora de escopo. |
| [`PLAN.md`](PLAN.md)   | Como foi planejado: abordagem, passos, riscos e decisões técnicas.                         |
| [`TESTS.md`](TESTS.md) | Estratégia de verificação: o que foi exercitado, com que oráculo, e as lacunas conhecidas. |

## Aprovação

2026-11-04 por @sthefanyblima, incluindo autorização explícita para criar o
ticket no Jira e para baixar os arquivos de fonte para dentro do repositório.

## Desvios do plano aprovado

- O plano previa `.woff2` variáveis subset latin para as três famílias. A
  JetBrains Mono tem eixo de peso 100–800, não 100–900 como as outras duas; o
  `weight` declarado acompanha cada arquivo em vez de usar uma faixa única.
- O plano não previa documentar a procedência dos binários. Foi acrescentado
  `apps/site/src/fontes/README.md`, porque um `.woff2` commitado não diz de
  onde veio nem como atualizar, e isso não é verificável no diff.
- A revisão independente apontou que a regra do ESLint, como implementada,
  valia só em `apps/*/src` e usava `paths` — que casa apenas o especificador
  exato. A dev aprovou ampliar para o repositório inteiro com `patterns`,
  corrigido em `4fa3551`.

## Dívida técnica aceita

_Nenhuma dívida registrada nesta feature._ Os quatro ajustes P3 da revisão
foram aplicados na própria entrega. O quinto achado era pré-existente e fora
de escopo, e virou ticket próprio:
[SCRUM-246](https://ic-team-pds.atlassian.net/browse/SCRUM-246) — o painel
declara `font-family: Inter` sem carregar fonte alguma.

## Exceções do processo

- Projeto sem `policy.yaml` e sem catálogo de padrões; `AGENTS.md` é a fonte
  local de convenções, como nas sessões anteriores.
- O critério "build sem acesso de rede" não foi provado isolando a rede: o
  ambiente de desenvolvimento é Windows e não havia forma confiável de isolá-la
  sem afetar a máquina da dev. A evidência é indireta — build limpo gera as três
  fontes como assets do próprio site, sem nenhuma URL do Google na saída, e o
  `next/font/local` lê de disco por construção.
- A procedência dos binários não é verificável por quem revisa: os arquivos
  foram baixados nesta sessão das URLs registradas em
  `apps/site/src/fontes/README.md`. A revisão independente validou o conteúdo
  (família, eixos, cobertura de acentuação, formato), não a origem.
