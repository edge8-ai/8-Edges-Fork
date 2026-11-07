-- fork-schema-upgrade: 20261021041122 -> 20261021101922
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261021041122 (then 02-rebrand.sql) to version 20261021101922.
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

ALTER TABLE "company_os"."ladder_display"
  ADD COLUMN "game_style" boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN "company_os"."ladder_display"."game_style" IS 'True while the person sees Quests in its game style, monsters and HP, and the Ladders'' full-screen rank-up and badge drops; false shows the plain view, where My Week''s plant grows as people answer, and quiets the Ladders. On for everyone until the person turns it off, from the Quests page head.';
