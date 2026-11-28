-- fork-schema-upgrade: 20261103024511 -> 20261103072220
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261103024511 (then 02-rebrand.sql) to version 20261103072220.
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

DROP POLICY "team_chatbot_reader_select" ON "company_os"."meetings";

CREATE OR REPLACE FUNCTION company_os.normalize_meeting_type (
  raw text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  select case
    when raw is null then null
    when raw in ('Sales','1-1','Leadership Sync','Vendor Call','General','Performance','Team Ceremony','Training','English Training','AI Program Review') then raw
    when raw ilike '%program review%' then 'AI Program Review'
    when raw ilike any (array['%stand-up%','%standup%','%sprint%','%grooming%','%project planning%','%retro%','%ceremony%','%kickoff%','%kick-off%']) then 'Team Ceremony'
    when raw ilike '%vendor%' then 'Vendor Call'
    when raw ilike '%leadership%' or raw ilike '%exec %' or raw ilike '%leadership sync%' then 'Leadership Sync'
    when raw ilike '%performance review%' or raw ilike '%perf review%' or raw ilike '%performance%' then 'Performance'
    when raw ilike '%english%' then 'English Training'
    when raw ilike any (array['%training%','%class%']) then 'Training'
    when raw ilike '%1-1%' or raw ilike '%1:1%' or raw ilike '%one-on-one%' or raw ilike '%one on one%' or raw ilike '% <> %' then '1-1'
    when raw ilike '%sales%' or raw ilike '%discovery%' or raw ilike '%capabilities audit%' or raw ilike '%demo%' or raw ilike '%proposal%' then 'Sales'
    else 'General'
  end
$function$;

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."meetings"
  FOR SELECT
  TO "team_chatbot_reader"
  USING ((meeting_type = ANY (ARRAY['General'::text, 'Sales'::text, 'Team Ceremony'::text, 'AI Program Review'::text])));

COMMENT ON COLUMN "company_os"."meetings"."meeting_type" IS 'Canonical meeting taxonomy, coerced on every write by the `meetings_normalize_type` trigger so imports can never introduce a new type; Training since English Program PR 5, English Training since 2026-10-26, AI Program Review since 2026-10-30. Valid values: [Sales, 1-1, Leadership Sync, Vendor Call, General, Performance, Team Ceremony, Training, English Training, AI Program Review].';
