-- fork-schema-upgrade: 20261027091732 -> 20261027184628
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261027091732 (then 02-rebrand.sql) to version 20261027184628.
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

CREATE UNIQUE INDEX quests_one_live_fire_per_learning_idx ON company_os.quests USING btree (origin_idea_id)
  WHERE ((kind = 'raid'::text) AND (state <> 'withdrawn'::text) AND (origin_idea_id IS NOT NULL));

COMMENT ON INDEX "company_os"."quests_one_live_fire_per_learning_idx" IS 'One live fire per learning: a second Raid evolved from the same learning is refused (23505) unless the first was withdrawn.';
