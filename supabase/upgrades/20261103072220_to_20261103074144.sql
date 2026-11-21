-- fork-schema-upgrade: 20261103072220 -> 20261103074144
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261103072220 (then 02-rebrand.sql) to version 20261103074144.
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

CREATE TABLE "company_os"."training_weekly_goals" (
  "person_id"      uuid                     NOT NULL,
  "weekly_minutes" integer,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "training_weekly_goals_pkey" PRIMARY KEY (person_id),
  CONSTRAINT "training_weekly_goals_weekly_minutes_check" CHECK (((weekly_minutes >= 15) AND (weekly_minutes <= 1200)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_weekly_goals" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_weekly_goals"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."training_weekly_goals"
  ADD CONSTRAINT "training_weekly_goals_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE CASCADE;

CREATE TRIGGER training_weekly_goals_updated_at
  BEFORE UPDATE ON company_os.training_weekly_goals
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."training_weekly_goals"."created_at" IS 'When the person first set a goal.';

COMMENT ON COLUMN "company_os"."training_weekly_goals"."person_id" IS 'The person whose goal it is (people.id); one goal each. The row goes with the person.';

COMMENT ON COLUMN "company_os"."training_weekly_goals"."updated_at" IS 'When the goal last changed (the house trigger).';

COMMENT ON COLUMN "company_os"."training_weekly_goals"."weekly_minutes" IS 'Minutes of training a week the person aims for, 15 to 1200; null when they cleared it (no goal).';

COMMENT ON TABLE "company_os"."training_weekly_goals" IS 'One row is: one person''s weekly training goal, the minutes a week they aim for, set on My Training. Seen only by that person. [master · People operations | tier 3 support | active]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_weekly_goals" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_weekly_goals" TO "service_role";
