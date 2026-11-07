-- fork-schema-upgrade: 20261102070439 -> 20261103024511
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261102070439 (then 02-rebrand.sql) to version 20261103024511.
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

CREATE TABLE "company_os"."training_change_notes" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"    uuid                     NOT NULL,
  "body"       text                     NOT NULL,
  "posted_by"  uuid                     NOT NULL,
  "posted_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "removed_at" timestamp with time zone,
  "removed_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "training_change_notes_body_check" CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 600))),
  CONSTRAINT "training_change_notes_pkey" PRIMARY KEY (id),
  CONSTRAINT "training_change_notes_removed_by_with_removed_at" CHECK (((removed_at IS NULL) = (removed_by IS NULL)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_change_notes" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_change_notes"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."training_change_notes"
  ADD CONSTRAINT "training_change_notes_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES company_os.training_plans(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_change_notes"
  ADD CONSTRAINT "training_change_notes_posted_by_fkey" FOREIGN KEY (posted_by) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_change_notes"
  ADD CONSTRAINT "training_change_notes_removed_by_fkey" FOREIGN KEY (removed_by) REFERENCES company_os.people(id) ON DELETE RESTRICT;

CREATE INDEX training_change_notes_plan_idx ON company_os.training_change_notes USING btree (plan_id, posted_at DESC)
  WHERE (removed_at IS NULL);

CREATE TRIGGER training_change_notes_updated_at
  BEFORE UPDATE ON company_os.training_change_notes
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."training_change_notes"."body" IS 'What the organiser changed and why, in their words; 1 to 600 characters. Never edited: a correction is a new note.';

COMMENT ON COLUMN "company_os"."training_change_notes"."created_at" IS 'When the row was written.';

COMMENT ON COLUMN "company_os"."training_change_notes"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_change_notes"."plan_id" IS 'The plan the note is about (training_plans); its learners see it. Restricts the plan''s delete, so a retired plan keeps its notes.';

COMMENT ON COLUMN "company_os"."training_change_notes"."posted_at" IS 'When it was posted; the learners see the day.';

COMMENT ON COLUMN "company_os"."training_change_notes"."posted_by" IS 'Who posted it (people.id): the plan''s organiser when they posted it. Shown to the learners by name.';

COMMENT ON COLUMN "company_os"."training_change_notes"."removed_at" IS 'When the organiser removed it; the learners no longer see it. Null while it is shown.';

COMMENT ON COLUMN "company_os"."training_change_notes"."removed_by" IS 'Who removed it (people.id); set exactly when removed_at is.';

COMMENT ON COLUMN "company_os"."training_change_notes"."updated_at" IS 'When the row last changed (the house trigger).';

COMMENT ON CONSTRAINT "training_change_notes_removed_by_with_removed_at" ON "company_os"."training_change_notes" IS 'A removed note says who removed it, and only a removed one does (TR.8).';

COMMENT ON TABLE "company_os"."training_change_notes" IS 'One row is: one note the organiser of a training plan posts to its learners, saying what they changed because of the reviews. Shown on the learners'' plan card while the plan is open to them; removed notes are kept and hidden. [transactional · People operations | tier 3 support | active]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_change_notes" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_change_notes" TO "service_role";
