-- fork-schema-upgrade: 20261029003440 -> 20261102014444
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261029003440 (then 02-rebrand.sql) to version 20261102014444.
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

ALTER TABLE "company_os"."performance_reviews"
  DROP CONSTRAINT "performance_reviews_review_type_check";

CREATE TABLE "company_os"."coaching_mirrors" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "coach_id"       uuid                     NOT NULL,
  "quarter"        text                     NOT NULL,
  "brief_markdown" text,
  "ai_model"       text,
  "ai_error"       text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "coaching_mirrors_coach_id_quarter_key" UNIQUE (coach_id, quarter),
  CONSTRAINT "coaching_mirrors_pkey" PRIMARY KEY (id),
  CONSTRAINT "coaching_mirrors_quarter_check" CHECK ((quarter ~ '^\d{4}Q[1-4]$'::text))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."coaching_mirrors" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."coaching_mirrors"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."coaching_mirrors"
  ADD CONSTRAINT "coaching_mirrors_coach_id_fkey" FOREIGN KEY (coach_id) REFERENCES company_os.team_members(id) ON DELETE CASCADE;

ALTER TABLE "company_os"."performance_reviews"
  ADD CONSTRAINT "performance_reviews_review_type_check"
    CHECK ((review_type = ANY (ARRAY['probation'::text, 'midyear'::text, 'renewal'::text, 'adhoc'::text, 'annual'::text, 'quarterly'::text])));

COMMENT ON COLUMN "company_os"."coaching_mirrors"."ai_error" IS 'Why the last generation failed, if it did.';

COMMENT ON COLUMN "company_os"."coaching_mirrors"."ai_model" IS 'The model that wrote the brief.';

COMMENT ON COLUMN "company_os"."coaching_mirrors"."brief_markdown" IS 'The brief, Markdown; null when generation failed.';

COMMENT ON COLUMN "company_os"."coaching_mirrors"."coach_id" IS 'The coach the brief is about (team_members.id).';

COMMENT ON COLUMN "company_os"."coaching_mirrors"."created_at" IS 'When the brief was first generated.';

COMMENT ON COLUMN "company_os"."coaching_mirrors"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."coaching_mirrors"."quarter" IS 'The quarter the brief reads, as 2026Q3.';

COMMENT ON COLUMN "company_os"."coaching_mirrors"."updated_at" IS 'When the brief was last regenerated.';

COMMENT ON TABLE "company_os"."coaching_mirrors" IS 'One AI brief per coach per quarter on their own coaching (the coach mirror): their coach/mentor/direct mix, follow-through and what to change. Derived and rebuildable; private to the coach and Super Admin.';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."coaching_mirrors" TO "postgres";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."coaching_mirrors" TO "service_role";
