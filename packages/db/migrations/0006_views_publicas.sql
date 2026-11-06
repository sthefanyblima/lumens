-- Views públicas do site (SCRUM-87) e o login só de leitura que enxerga apenas elas.
--
-- O site nunca mostra nome, telefone ou e-mail de quem apoiou, relatou ou se voluntariou; nem
-- pautas em curadoria ou recusadas; nem relatos que não foram aprovados (RN03, RN12, RNF01).
-- Do estudante, o público vê só o curso. Nenhuma view tem id de estudante, HMAC, cifra ou e-mail,
-- e a pauta é identificada pelo slug, não pelo id interno.
--
-- As views rodam com os privilégios do owner (sem security_invoker): é assim que `lumens_site`
-- lê o resultado sem ter acesso a nenhuma tabela. `security_barrier` impede que um filtro escrito
-- por quem consulta (por exemplo, uma função temporária que imprime o que recebe) rode antes dos
-- filtros da view e enxergue as linhas escondidas.
--
-- Pauta pública = status numa lista FECHADA (allowlist), repetida em cada filtro abaixo:
--   juntando_apoios, meta_batida, cobrando, prometido, entregue_em_parte, descumprida, conquistada.
-- `em_curadoria` e `recusada` ficam de fora. Um valor novo de `status_pauta` nasce escondido até
-- alguém incluí-lo aqui, numa migração nova (o teste de classificação do enum falha até lá).
-- A lista fica inline, e não numa função `pauta_publica(status)`: o EXECUTE de função chamada
-- dentro de view é conferido contra quem consulta, não contra o owner, e a função exigiria
-- EXECUTE para `lumens_site` e mais um objeto a proteger.

CREATE VIEW "v_resumo" WITH (security_barrier = true) AS
SELECT
	count(*) FILTER (
		WHERE p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido')
	)::int AS pautas_abertas,
	(
		SELECT count(*)
		FROM "apoio" a
		JOIN "pauta" pa ON pa.id = a.pauta_id
		WHERE pa.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada')
	)::int AS apoios,
	count(*) FILTER (WHERE p.status = 'conquistada')::int AS conquistas
FROM "pauta" p
WHERE p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada');
--> statement-breakpoint
CREATE VIEW "v_pauta_publica" WITH (security_barrier = true) AS
SELECT
	p.slug,
	p.titulo,
	p.descricao,
	p.categoria,
	p.status,
	p.meta,
	apoios.total AS apoios,
	b.slug AS bloco_slug,
	b.nome AS bloco_nome,
	responsaveis.cursos AS cursos_responsaveis,
	p.criada_em,
	p.aprovada_em,
	p.meta_batida_em,
	-- Texto pronto para o card; `conquistada` não tem próxima etapa e fica nulo.
	CASE p.status
		WHEN 'juntando_apoios' THEN CASE
			WHEN p.meta - apoios.total > 1 THEN format('Faltam %s apoios', p.meta - apoios.total)
			WHEN p.meta - apoios.total = 1 THEN 'Falta 1 apoio'
			ELSE 'Meta alcançada'
		END
		WHEN 'meta_batida' THEN 'Aguardando o encaminhamento'
		WHEN 'cobrando' THEN coalesce(
			'Prazo do Fala.BR em ' || to_char(falabr.prazo, 'DD/MM'),
			'Aguardando resposta'
		)
		WHEN 'prometido' THEN coalesce(
			'Entrega prometida para ' || to_char(promessa.data_entrega, 'DD/MM'),
			'Aguardando a entrega'
		)
		WHEN 'entregue_em_parte' THEN 'Cobrar o restante'
		WHEN 'descumprida' THEN 'Retomar a cobrança'
	END AS proxima_etapa
FROM "pauta" p
LEFT JOIN "bloco" b ON b.id = p.bloco_id
CROSS JOIN LATERAL (
	SELECT count(*)::int AS total FROM "apoio" a WHERE a.pauta_id = p.id
) apoios
-- Cursos distintos dos responsáveis com mandato ativo; nunca quem são.
CROSS JOIN LATERAL (
	SELECT coalesce(
		array_agg(DISTINCT e.curso ORDER BY e.curso) FILTER (WHERE e.curso IS NOT NULL),
		'{}'
	) AS cursos
	FROM "papel_pauta" pp
	JOIN "estudante" e ON e.id = pp.estudante_id
	WHERE pp.pauta_id = p.id AND pp.ate IS NULL
) responsaveis
-- Prazo do caminho Fala.BR aberto mais recentemente; se ele ainda não tem prazo, o texto cai em
-- 'Aguardando resposta' em vez de mostrar o prazo de um Fala.BR anterior.
LEFT JOIN LATERAL (
	SELECT c.prazo
	FROM "caminho" c
	WHERE c.pauta_id = p.id AND c.tipo = 'falabr'
	ORDER BY c.aberto_em DESC
	LIMIT 1
) falabr ON true
-- Promessa ativa: o índice promessa_ativa_por_pauta_unique garante no máximo uma.
LEFT JOIN LATERAL (
	SELECT pr.data_entrega
	FROM "promessa" pr
	WHERE pr.pauta_id = p.id AND pr.resultado IS NULL
) promessa ON true
WHERE p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada');
--> statement-breakpoint
CREATE VIEW "v_relato_publico" WITH (security_barrier = true) AS
SELECT
	p.slug AS pauta_slug,
	r.texto,
	r.foto_chave,
	e.curso,
	r.moderado_em
FROM "relato" r
JOIN "pauta" p ON p.id = r.pauta_id
JOIN "estudante" e ON e.id = r.estudante_id
WHERE r.moderacao = 'aprovado' AND p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada');
--> statement-breakpoint
-- Caminhos (Fala.BR, comunidade, representante) e propostas, que são o caminho que pede
-- voluntários. `tipo = 'proposta'` distingue as linhas; colunas que não se aplicam ficam nulas.
CREATE VIEW "v_caminho_publico" WITH (security_barrier = true) AS
SELECT
	p.slug AS pauta_slug,
	c.tipo::text AS tipo,
	c.status,
	c.protocolo,
	c.prazo,
	c.aberto_em,
	NULL::text AS descricao,
	NULL::int AS pessoas_necessarias,
	NULL::int AS voluntarios,
	NULL::timestamptz AS executada_em
FROM "caminho" c
JOIN "pauta" p ON p.id = c.pauta_id
WHERE p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada')
UNION ALL
SELECT
	p.slug AS pauta_slug,
	'proposta' AS tipo,
	pr.status::text AS status,
	NULL AS protocolo,
	NULL AS prazo,
	NULL AS aberto_em,
	pr.descricao,
	pr.pessoas_necessarias,
	(SELECT count(*) FROM "voluntario" v WHERE v.proposta_id = pr.id)::int AS voluntarios,
	pr.executada_em
FROM "proposta" pr
JOIN "pauta" p ON p.id = pr.pauta_id
WHERE p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada');
--> statement-breakpoint
CREATE VIEW "v_linha_do_tempo" WITH (security_barrier = true) AS
SELECT
	p.slug AS pauta_slug,
	e.tipo,
	-- Sem as chaves de id interno do catálogo da T7 (caminho_id, proposta_id, promessa_id,
	-- relato_id…): a view não expõe id nenhum, nem dentro do JSONB.
	CASE WHEN jsonb_typeof(e.dados) = 'object' THEN (
		SELECT coalesce(jsonb_object_agg(d.chave, d.valor), '{}'::jsonb)
		FROM jsonb_each(e.dados) AS d(chave, valor)
		WHERE d.chave <> 'id' AND right(d.chave, 3) <> '_id'
	) ELSE '{}'::jsonb END AS dados,
	e.criado_em
FROM "evento" e
JOIN "pauta" p ON p.id = e.pauta_id
WHERE e.publico AND p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada');
--> statement-breakpoint
CREATE VIEW "v_conquista" WITH (security_barrier = true) AS
SELECT
	p.slug AS pauta_slug,
	p.titulo,
	b.nome AS bloco_nome,
	conquista.em AS conquistada_em,
	(SELECT count(*) FROM "apoio" a WHERE a.pauta_id = p.id)::int AS apoios,
	EXISTS (
		SELECT 1 FROM "proposta" pr WHERE pr.pauta_id = p.id AND pr.status = 'executada'
	) AS proposta_executada
FROM "pauta" p
LEFT JOIN "bloco" b ON b.id = p.bloco_id
-- A pauta não guarda a data da conquista: ela sai do evento público da transição.
LEFT JOIN LATERAL (
	SELECT max(e.criado_em) AS em
	FROM "evento" e
	WHERE e.pauta_id = p.id
		AND e.publico
		AND e.tipo = 'status_alterado'
		AND e.dados ->> 'para' = 'conquistada'
) conquista ON true
WHERE p.status = 'conquistada';
--> statement-breakpoint
-- Eventos públicos de todas as pautas públicas, para o feed de atividade. Sem LIMIT: quem consulta
-- ordena por `criado_em DESC` e pagina (a API aceita até 100 por página).
-- O ORDER BY interno não limita nada; ele existe pelo plano. Com `security_barrier`, a view é
-- planejada à parte e não enxerga o ORDER BY ... LIMIT de fora: sem ordem própria, ela junta tudo,
-- calcula `dados` de cada evento e só então ordena. Ordenada, a página sai do índice parcial
-- `evento_publico_criado_em_idx` (criado_em DESC) por nested loop, e só as linhas da página são
-- calculadas. O SQL não promete a ordem de uma view; por isso quem consulta ordena mesmo assim.
CREATE VIEW "v_atividade" WITH (security_barrier = true) AS
SELECT
	p.slug AS pauta_slug,
	p.titulo AS pauta_titulo,
	e.tipo,
	-- Sem as chaves de id interno do catálogo da T7 (caminho_id, proposta_id, promessa_id,
	-- relato_id…): a view não expõe id nenhum, nem dentro do JSONB.
	CASE WHEN jsonb_typeof(e.dados) = 'object' THEN (
		SELECT coalesce(jsonb_object_agg(d.chave, d.valor), '{}'::jsonb)
		FROM jsonb_each(e.dados) AS d(chave, valor)
		WHERE d.chave <> 'id' AND right(d.chave, 3) <> '_id'
	) ELSE '{}'::jsonb END AS dados,
	e.criado_em
FROM "evento" e
JOIN "pauta" p ON p.id = e.pauta_id
WHERE e.publico AND p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada')
ORDER BY e.criado_em DESC;
--> statement-breakpoint
-- Todos os blocos, inclusive os sem pauta pública: o filtro de bloco do site lista todos.
-- Bloco não tem dado pessoal; a view existe para o site não precisar ler tabela nenhuma.
CREATE VIEW "v_bloco" WITH (security_barrier = true) AS
SELECT
	b.slug,
	b.nome,
	b.base_estudantes
FROM "bloco" b;
--> statement-breakpoint
-- `lumens_site` é criado por `pnpm db:provision` antes desta migração, como `lumens_app`.
-- Começa sem nada em tabelas e sequências e recebe SELECT só nas oito views. Os privilégios
-- padrão da 0003 valem apenas para `lumens_app`: tabelas e views futuras não chegam a ele.
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "lumens_site";
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "lumens_site";
--> statement-breakpoint
GRANT USAGE ON SCHEMA "public" TO "lumens_site";
--> statement-breakpoint
GRANT SELECT ON
	"v_resumo",
	"v_pauta_publica",
	"v_relato_publico",
	"v_caminho_publico",
	"v_linha_do_tempo",
	"v_conquista",
	"v_atividade",
	"v_bloco"
TO "lumens_site";
