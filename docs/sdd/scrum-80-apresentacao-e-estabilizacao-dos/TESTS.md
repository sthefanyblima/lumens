# Testes: SCRUM-80 — payload mínimo de `pauta_criada`

## Estratégia

Teste de integração em PostgreSQL real, junto do seed existente. O oráculo vem do contrato em `docs/esquema.md`, não da implementação: para cada um dos nove status, deve existir exatamente um evento `pauta_criada` com `dados = { status: 'em_curadoria' }`.

## Casos

- [x] **Integração/regressão · nove status:** executar o seed, consultar `evento` por status da pauta e `tipo = 'pauta_criada'` e comparar a linha inteira com `[{ dados: { status: 'em_curadoria' } }]`.
  - Falha no seed anterior: `dados` também continha `titulo`.
  - Também detecta: evento ausente, duplicado ou payload com qualquer chave adicional.

## Pontos cegos assumidos

- Os outros quatorze tipos futuros ainda não são emitidos pelo seed e serão testados nas respectivas implementações de domínio.

## Revisão

- `APROVADO` pelo `tour-test-reviewer`: oráculo independente, igualdade exata, asserção incondicional e isolamento por banco conferidos.
- Execução: `pnpm check` passou em PostgreSQL 17; pacote de banco com 86 testes verdes e monorepo com 341.
