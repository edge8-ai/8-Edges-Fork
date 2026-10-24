-- fork-schema-upgrade: 20261015123913 -> 20261017151924
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261015123913 (then 02-rebrand.sql) to version 20261017151924.
-- Apply with scripts/fork-upgrade.sh, which runs it in one transaction and
-- records the new version; README Step 3b. Reference data is not here: a fresh
-- install inserts it once, and an upgraded database keeps its own rows.
--

-- The extensions 00-prereqs.sql creates, for a database built before one joined it.
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION company_os.search_candidates (
  terms text[],
  lim   integer
)
  RETURNS TABLE (
    id             uuid,
    current_title  text,
    display_name   text,
    preferred_name text,
    full_name      text,
    email          text,
    score          real
  )
  LANGUAGE sql
  STABLE
  AS $function$
  with q as (select company_os.search_terms(terms) as f)
  select c.id, c.current_title, p.display_name, p.preferred_name, p.full_name, p.email, s.score
  from q
  cross join company_os.candidates c
  join company_os.people p on p.id = c.person_id and p.archived_at is null
  cross join lateral (
    select company_os.search_score(
      company_os.search_fold(coalesce(p.full_name, '') || ' ' || coalesce(p.display_name, '') || ' ' || coalesce(p.preferred_name, '') || ' ' || coalesce(p.email, '')),
      company_os.search_fold(coalesce(p.display_name, p.preferred_name, p.full_name, p.email, '')),
      q.f
    ) as score
  ) s
  where cardinality(q.f) > 0
    and (company_os.search_fold(coalesce(p.full_name, '') || ' ' || coalesce(p.display_name, '') || ' ' || coalesce(p.preferred_name, '') || ' ' || coalesce(p.email, '')) like '%' || q.f[1] || '%'
         or (length(q.f[1]) >= 4 and q.f[1] operator(extensions.<%) company_os.search_fold(coalesce(p.full_name, '') || ' ' || coalesce(p.display_name, '') || ' ' || coalesce(p.preferred_name, '') || ' ' || coalesce(p.email, ''))))
    and s.score is not null
  order by s.score desc, c.updated_at desc
  limit lim
$function$;

CREATE OR REPLACE FUNCTION company_os.search_cards (
  terms     text[],
  board_ids uuid[],
  lim       integer
)
  RETURNS TABLE (
    id           uuid,
    title        text,
    parent_id    uuid,
    parent_title text,
    board_slug   text,
    board_name   text,
    score        real
  )
  LANGUAGE sql
  STABLE
  AS $function$
  with q as (select company_os.search_terms(terms) as f)
  select t.id, t.title, p.id, p.title, b.slug, b.name, s.score
  from q
  cross join company_os.tasks t
  join company_os.boards b on b.id = t.board_id and b.archived_at is null
  left join company_os.tasks p on p.id = t.parent_task_id
  cross join lateral (
    select company_os.search_score(company_os.search_fold(t.title), company_os.search_fold(t.title), q.f) as score
  ) s
  where cardinality(q.f) > 0
    and t.archived_at is null
    and (board_ids is null or t.board_id = any(board_ids))
    and (company_os.search_fold(t.title) like '%' || q.f[1] || '%'
         or (length(q.f[1]) >= 4 and q.f[1] operator(extensions.<%) company_os.search_fold(t.title)))
    and s.score is not null
  order by s.score desc, t.created_at desc
  limit lim
$function$;

CREATE OR REPLACE FUNCTION company_os.search_companies (
  terms text[],
  lim   integer
)
  RETURNS TABLE (
    id          uuid,
    name        text,
    website_url text,
    score       real
  )
  LANGUAGE sql
  STABLE
  AS $function$
  with q as (select company_os.search_terms(terms) as f)
  select c.id, c.name, c.website_url, s.score
  from q
  cross join company_os.companies c
  cross join lateral (
    select company_os.search_score(
      company_os.search_fold(coalesce(c.name, '') || ' ' || coalesce(c.website_url, '')),
      company_os.search_fold(coalesce(c.name, '')),
      q.f
    ) as score
  ) s
  where cardinality(q.f) > 0
    and c.archived_at is null
    and (company_os.search_fold(coalesce(c.name, '') || ' ' || coalesce(c.website_url, '')) like '%' || q.f[1] || '%'
         or (length(q.f[1]) >= 4 and q.f[1] operator(extensions.<%) company_os.search_fold(coalesce(c.name, '') || ' ' || coalesce(c.website_url, ''))))
    and s.score is not null
  order by s.score desc, c.name
  limit lim
$function$;

CREATE OR REPLACE FUNCTION company_os.search_deals (
  terms text[],
  lim   integer
)
  RETURNS TABLE (
    id           uuid,
    title        text,
    company_name text,
    score        real
  )
  LANGUAGE sql
  STABLE
  AS $function$
  with q as (select company_os.search_terms(terms) as f)
  select d.id, d.title, c.name, s.score
  from q
  cross join company_os.deals d
  left join company_os.companies c on c.id = d.company_id
  cross join lateral (
    select company_os.search_score(company_os.search_fold(d.title), company_os.search_fold(d.title), q.f) as score
  ) s
  where cardinality(q.f) > 0
    and d.archived_at is null
    and (company_os.search_fold(d.title) like '%' || q.f[1] || '%'
         or (length(q.f[1]) >= 4 and q.f[1] operator(extensions.<%) company_os.search_fold(d.title)))
    and s.score is not null
  order by s.score desc, d.updated_at desc
  limit lim
$function$;

CREATE OR REPLACE FUNCTION company_os.search_fold (
  value text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
RETURN lower(extensions.unaccent('extensions.unaccent'::regdictionary, replace(replace(VALUE, 'Đ'::text, 'D'::text), 'đ'::text, 'd'::text)));

CREATE OR REPLACE FUNCTION company_os.search_invoices (
  terms text[],
  lim   integer
)
  RETURNS TABLE (
    id            uuid,
    doc_number    text,
    customer_name text,
    status        text,
    score         real
  )
  LANGUAGE sql
  STABLE
  AS $function$
  with q as (select company_os.search_terms(terms) as f)
  select i.id, i.doc_number, i.customer_name, i.status, s.score
  from q
  cross join company_os.invoices i
  cross join lateral (
    select company_os.search_score(
      company_os.search_fold(coalesce(i.doc_number, '') || ' ' || coalesce(i.customer_name, '')),
      company_os.search_fold(coalesce(i.doc_number, i.customer_name, '')),
      q.f
    ) as score
  ) s
  where cardinality(q.f) > 0
    -- A voided invoice is hidden from the list a hit opens.
    and i.status <> 'voided'
    and (company_os.search_fold(coalesce(i.doc_number, '') || ' ' || coalesce(i.customer_name, '')) like '%' || q.f[1] || '%'
         or (length(q.f[1]) >= 4 and q.f[1] operator(extensions.<%) company_os.search_fold(coalesce(i.doc_number, '') || ' ' || coalesce(i.customer_name, ''))))
    and s.score is not null
  order by s.score desc, i.txn_date desc nulls last
  limit lim
$function$;

CREATE OR REPLACE FUNCTION company_os.search_people (
  terms text[],
  lim   integer
)
  RETURNS TABLE (
    id             uuid,
    display_name   text,
    preferred_name text,
    full_name      text,
    email          text,
    score          real
  )
  LANGUAGE sql
  STABLE
  AS $function$
  with q as (select company_os.search_terms(terms) as f)
  select p.id, p.display_name, p.preferred_name, p.full_name, p.email, s.score
  from q
  cross join company_os.people p
  cross join lateral (
    select company_os.search_score(
      company_os.search_fold(coalesce(p.full_name, '') || ' ' || coalesce(p.display_name, '') || ' ' || coalesce(p.preferred_name, '') || ' ' || coalesce(p.email, '')),
      company_os.search_fold(coalesce(p.display_name, p.preferred_name, p.full_name, p.email, '')),
      q.f
    ) as score
  ) s
  where cardinality(q.f) > 0
    and p.archived_at is null
    and (company_os.search_fold(coalesce(p.full_name, '') || ' ' || coalesce(p.display_name, '') || ' ' || coalesce(p.preferred_name, '') || ' ' || coalesce(p.email, '')) like '%' || q.f[1] || '%'
         or (length(q.f[1]) >= 4 and q.f[1] operator(extensions.<%) company_os.search_fold(coalesce(p.full_name, '') || ' ' || coalesce(p.display_name, '') || ' ' || coalesce(p.preferred_name, '') || ' ' || coalesce(p.email, ''))))
    and s.score is not null
  order by s.score desc, coalesce(p.display_name, p.full_name)
  limit lim
$function$;

CREATE OR REPLACE FUNCTION company_os.search_score (
  haystack text,
  name     text,
  terms    text[]
)
  RETURNS real
  LANGUAGE plpgsql
  STABLE
  PARALLEL SAFE
  AS $function$
declare
  words text := ' ' || pg_catalog.regexp_replace(haystack, '[^[:alnum:]]+', ' ', 'g');
  query text := pg_catalog.array_to_string(terms, ' ');
  score real := 0;
  matched int := 0;
  term text;
  word text;
begin
  foreach term in array coalesce(terms, '{}') loop
    continue when term = '';
    matched := matched + 1;
    word := pg_catalog.btrim(pg_catalog.regexp_replace(term, '[^[:alnum:]]+', ' ', 'g'));
    if word <> '' and pg_catalog.strpos(words, ' ' || word) > 0 then
      score := score + 30;
    elsif pg_catalog.strpos(haystack, term) > 0 then
      score := score + 10;
    elsif pg_catalog.length(term) >= 4 and term operator(extensions.<%) haystack then
      score := score + 20 * extensions.word_similarity(term, haystack);
    else
      return null;
    end if;
  end loop;
  if matched = 0 then
    return null;
  end if;
  if name = query then
    score := score + 100;
  elsif pg_catalog.starts_with(name, query) then
    score := score + 60;
  end if;
  return score;
end
$function$;

CREATE OR REPLACE FUNCTION company_os.search_terms (
  terms text[]
)
  RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  AS $function$
  select coalesce(array_agg(f order by n) filter (where f <> ''), '{}')
  from (select btrim(company_os.search_fold(t)) as f, n from unnest(terms) with ordinality as u(t, n)) folded
$function$;

REVOKE ALL ON FUNCTION "company_os"."search_candidates"(text[], integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "company_os"."search_candidates"(text[], integer) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "company_os"."search_cards"(text[], uuid[], integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "company_os"."search_cards"(text[], uuid[], integer) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "company_os"."search_companies"(text[], integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "company_os"."search_companies"(text[], integer) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "company_os"."search_deals"(text[], integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "company_os"."search_deals"(text[], integer) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "company_os"."search_fold"(text) FROM PUBLIC;

-- Edited by hand (gen-fork-schema.mjs asks for it when its proof fails): two grants, in production's
-- order, so the upgraded database's ACL lists service_role before chatbot_writer as 01-schema.sql does.
GRANT EXECUTE ON FUNCTION "company_os"."search_fold"(text) TO "postgres", "service_role";
GRANT EXECUTE ON FUNCTION "company_os"."search_fold"(text) TO "chatbot_writer";

REVOKE ALL ON FUNCTION "company_os"."search_invoices"(text[], integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "company_os"."search_invoices"(text[], integer) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "company_os"."search_people"(text[], integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "company_os"."search_people"(text[], integer) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "company_os"."search_score"(text, text, text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "company_os"."search_score"(text, text, text[]) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "company_os"."search_terms"(text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "company_os"."search_terms"(text[]) TO "postgres", "service_role";

CREATE INDEX companies_search_fold_trgm ON company_os.companies
  USING gin (company_os.search_fold(((COALESCE(name, ''::text) || ' '::text) || (COALESCE(website_url, ''::extensions.citext))::text)) extensions.gin_trgm_ops)
  WHERE (archived_at IS NULL);

CREATE INDEX deals_search_fold_trgm ON company_os.deals USING gin (company_os.search_fold(title) extensions.gin_trgm_ops)
  WHERE (archived_at IS NULL);

CREATE INDEX invoices_search_fold_trgm ON company_os.invoices
  USING gin (company_os.search_fold(((COALESCE(doc_number, ''::text) || ' '::text) || COALESCE(customer_name, ''::text))) extensions.gin_trgm_ops);

CREATE INDEX people_search_fold_trgm ON company_os.people
  USING gin
  (company_os.search_fold(((((((COALESCE(full_name, ''::text) || ' '::text) || COALESCE(display_name, ''::text)) || ' '::text) || COALESCE(preferred_name, ''::text)) || ' '::text)
  || (COALESCE(email, ''::extensions.citext))::text)) extensions.gin_trgm_ops)
  WHERE (archived_at IS NULL);

CREATE INDEX tasks_search_fold_trgm ON company_os.tasks USING gin (company_os.search_fold(title) extensions.gin_trgm_ops)
  WHERE (archived_at IS NULL);
