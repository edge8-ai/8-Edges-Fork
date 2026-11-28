-- fork-schema-upgrade: 20261103074144 -> 20261103091843
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261103074144 (then 02-rebrand.sql) to version 20261103091843.
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

CREATE TABLE "company_os"."training_programme_narrations" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "viewer_id"    uuid                     NOT NULL,
  "week"         date                     NOT NULL,
  "period"       text                     NOT NULL,
  "grain"        text                     NOT NULL,
  "slice_id"     uuid                     NOT NULL,
  "figures"      jsonb                    NOT NULL,
  "figures_hash" text                     NOT NULL,
  "body"         text                     NOT NULL,
  "model"        text                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "training_programme_narrations_body_check" CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 800))),
  CONSTRAINT "training_programme_narrations_grain_check" CHECK ((grain = ANY (ARRAY['type'::text, 'plan'::text]))),
  CONSTRAINT "training_programme_narrations_one_per_slice" UNIQUE (viewer_id, week, period, grain, slice_id),
  CONSTRAINT "training_programme_narrations_period_check" CHECK ((period = ANY (ARRAY['start'::text, 'q'::text, 'm'::text]))),
  CONSTRAINT "training_programme_narrations_pkey" PRIMARY KEY (id),
  CONSTRAINT "training_programme_narrations_week_check" CHECK ((EXTRACT(isodow FROM week) = (1)::numeric))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_programme_narrations" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_programme_narrations"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."training_programme_narrations"
  ADD CONSTRAINT "training_programme_narrations_viewer_id_fkey" FOREIGN KEY (viewer_id) REFERENCES company_os.people(id) ON DELETE CASCADE;

COMMENT ON COLUMN "company_os"."training_programme_narrations"."body" IS 'The story, 1 to 800 characters. Kept only when every number in it is one of its figures.';

COMMENT ON COLUMN "company_os"."training_programme_narrations"."created_at" IS 'When the story was written.';

COMMENT ON COLUMN "company_os"."training_programme_narrations"."figures" IS 'The slice''s figures the story was written from: counts, the star average, the load mix, tags and skip reasons. Never a name or a note''s words.';

COMMENT ON COLUMN "company_os"."training_programme_narrations"."figures_hash" IS 'A hash of figures, so identical figures seen by two viewers are written once and reused.';

COMMENT ON COLUMN "company_os"."training_programme_narrations"."grain" IS 'What the slice is: type (a training type) or plan (a training plan).';

COMMENT ON COLUMN "company_os"."training_programme_narrations"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_programme_narrations"."model" IS 'The model that wrote it.';

COMMENT ON COLUMN "company_os"."training_programme_narrations"."period" IS 'The programme read''s period: start (since the start), q (last 3 months) or m (last 30 days).';

COMMENT ON COLUMN "company_os"."training_programme_narrations"."slice_id" IS 'The training type''s or plan''s id, by grain. No foreign key, because it names one of two tables.';

COMMENT ON COLUMN "company_os"."training_programme_narrations"."viewer_id" IS 'Who the story was written for (people.id): a manager, organiser or admin whose programme read showed the slice. Only they read it. The row goes with the person.';

COMMENT ON COLUMN "company_os"."training_programme_narrations"."week" IS 'The Monday (Vietnam time) the story was written for; always a Monday.';

COMMENT ON CONSTRAINT "training_programme_narrations_one_per_slice" ON "company_os"."training_programme_narrations" IS 'One story per viewer, week, period and slice (TR.9).';

COMMENT ON TABLE "company_os"."training_programme_narrations" IS 'One row is: one weekly story about one programme-read slice, written for one viewer from the figures that viewer saw that Monday. Shown only to that viewer, beside the slice. [transactional · People operations | tier 3 support | active]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_programme_narrations" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_programme_narrations" TO "service_role";
