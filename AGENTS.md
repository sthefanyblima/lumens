# Instruções do projeto

## Code Review Rules

### Idioma

- Escreva o resumo, o veredito e todos os comentários da revisão em português do Brasil.
- Não publique comentários em inglês, exceto nomes técnicos, identificadores e trechos de código.
- Seja direto, técnico e respeitoso.

### Fonte de verdade

- O catálogo `.agent/patterns/`, quando existir, prevalece sobre o estilo do código vizinho.
- Código novo deve seguir o catálogo ou uma divergência explicitamente aprovada na PR.
- Considere o escopo e os critérios de aceite descritos na PR.
- Aponte divergências antigas fora das linhas alteradas, mas não exija que sejam corrigidas nesta entrega.
- Falhas preexistentes de lint ou formatação em linhas não tocadas devem ser relatadas, não atribuídas à PR.

### Prioridades da revisão

Revise principalmente:

1. Bugs funcionais e casos de borda.
2. Violações dos critérios de aceite.
3. Segurança, autorização e exposição de dados.
4. Integridade do banco, migrations, constraints e transações.
5. Concorrência, idempotência e condições de corrida.
6. Regressões e incompatibilidades.
7. Testes insuficientes ou que passam mesmo com o comportamento quebrado.
8. Problemas relevantes de acessibilidade e performance.

Não bloqueie a PR apenas por preferências pessoais de estilo.

### Simplicidade e escopo

- Prefira mudanças cirúrgicas e soluções simples.
- Aponte complexidade desnecessária e abstrações prematuras.
- Não sugira refatorações fora do escopo, salvo quando necessárias para corrigir um problema real.
- Diferencie claramente problemas introduzidos pela PR de problemas preexistentes.
- Todo apontamento deve descrever um impacto concreto e reproduzível.

### Testes e evidências

- Verifique se os testes exercitam o comportamento real e falhariam sem a implementação.
- Para correções de bug, solicite um teste de regressão quando aplicável.
- Não considere apenas a existência do teste; valide suas asserções.
- Em migrations, verifique upgrade, constraints, dados existentes e efeitos destrutivos.
- Não afirme que algo falha sem indicar um cenário concreto e reproduzível.

### Formato dos apontamentos

Para cada problema encontrado, informe:

- Severidade: `P0`, `P1`, `P2` ou `P3`.
- Arquivo e linha exata.
- Cenário em que o problema acontece.
- Impacto observável.
- Correção mínima recomendada.

Use as severidades:

- `P0`: perda grave de dados, vulnerabilidade crítica ou sistema indisponível.
- `P1`: bug grave que deve bloquear o merge.
- `P2`: bug real de impacto moderado.
- `P3`: melhoria relevante, mas não bloqueante.

Não publique apontamentos vagos, especulativos ou puramente cosméticos.

### Resultado final

Finalize com um dos seguintes veredictos:

- `APROVADO`
- `APROVADO COM RESSALVAS`
- `ALTERAÇÕES NECESSÁRIAS`

Inclua:

- resumo curto;
- problemas bloqueantes;
- sugestões não bloqueantes;
- testes ou verificações recomendados.

Não aprove uma PR quando houver problema `P0` ou `P1`.
