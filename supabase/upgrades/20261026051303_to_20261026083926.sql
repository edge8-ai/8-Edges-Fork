-- fork-schema-upgrade: 20261026051303 -> 20261026083926
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261026051303 (then 02-rebrand.sql) to version 20261026083926.
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

ALTER TABLE "company_os"."training_plans"
  ADD COLUMN "open_to_learners" boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN "company_os"."training_plans"."open_to_learners" IS 'Whether the plan''s learners see its sessions: true from creation; false keeps every session of the plan off My Training, the learner''s session page and learner notifications while the organiser and the routines carry on, so a plan can be reviewed before it opens.';
