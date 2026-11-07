-- fork-schema-upgrade: 20261102021245 -> 20261102070439
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261102021245 (then 02-rebrand.sql) to version 20261102070439.
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

CREATE TABLE "company_os"."training_outcome_credits" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "outcome_id"  uuid                     NOT NULL,
  "person_id"   uuid                     NOT NULL,
  "training_id" uuid,
  "plan_id"     uuid,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "training_outcome_credits_one_per_plan" UNIQUE (outcome_id, plan_id),
  CONSTRAINT "training_outcome_credits_one_per_training" UNIQUE (outcome_id, training_id),
  CONSTRAINT "training_outcome_credits_one_target" CHECK (((training_id IS NULL) <> (plan_id IS NULL))),
  CONSTRAINT "training_outcome_credits_pkey" PRIMARY KEY (id)
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_outcome_credits" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_outcome_credits"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."training_outcomes" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "person_id"           uuid                     NOT NULL,
  "happened_on"         date                     NOT NULL,
  "description"         text                     NOT NULL,
  "source"              text                     NOT NULL,
  "status"              text                     NOT NULL DEFAULT 'accepted'::text,
  "suggested_by"        uuid,
  "certification_track" text,
  "answered_at"         timestamp with time zone,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "training_outcomes_certification_track_check" CHECK (((certification_track IS NULL) OR (length(TRIM(BOTH FROM certification_track)) > 0))),
  CONSTRAINT "training_outcomes_description_check" CHECK (((length(TRIM(BOTH FROM description)) >= 1) AND (length(TRIM(BOTH FROM description)) <= 500))),
  CONSTRAINT "training_outcomes_id_person_key" UNIQUE (id, person_id),
  CONSTRAINT "training_outcomes_member_is_accepted" CHECK (((source <> 'member'::text) OR (status = 'accepted'::text))),
  CONSTRAINT "training_outcomes_one_per_track" UNIQUE (person_id, certification_track),
  CONSTRAINT "training_outcomes_pkey" PRIMARY KEY (id),
  CONSTRAINT "training_outcomes_source_check" CHECK ((source = ANY (ARRAY['member'::text, 'organiser'::text, 'certification'::text]))),
  CONSTRAINT "training_outcomes_status_check" CHECK ((status = ANY (ARRAY['suggested'::text, 'accepted'::text, 'dismissed'::text]))),
  CONSTRAINT "training_outcomes_suggested_by_organiser" CHECK (((source = 'organiser'::text) = (suggested_by IS NOT NULL))),
  CONSTRAINT "training_outcomes_track_for_certification" CHECK (((source = 'certification'::text) = (certification_track IS NOT NULL)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_outcomes" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_outcomes"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."training_outcome_credits"
  ADD CONSTRAINT "training_outcome_credits_attendance_fkey" FOREIGN KEY (training_id, person_id) REFERENCES company_os.training_attendance(training_id, person_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_outcome_credits"
  ADD CONSTRAINT "training_outcome_credits_member_fkey" FOREIGN KEY (plan_id, person_id) REFERENCES company_os.training_plan_members(plan_id, person_id) ON UPDATE RESTRICT
    ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_outcome_credits"
  ADD CONSTRAINT "training_outcome_credits_outcome_fkey" FOREIGN KEY (outcome_id, person_id) REFERENCES company_os.training_outcomes(id, person_id) ON UPDATE RESTRICT
    ON DELETE CASCADE;

ALTER TABLE "company_os"."training_outcomes"
  ADD CONSTRAINT "training_outcomes_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_outcomes"
  ADD CONSTRAINT "training_outcomes_suggested_by_fkey" FOREIGN KEY (suggested_by) REFERENCES company_os.people(id) ON DELETE RESTRICT;

CREATE INDEX training_outcome_credits_plan_idx ON company_os.training_outcome_credits USING btree (plan_id)
  WHERE (plan_id IS NOT NULL);

CREATE INDEX training_outcome_credits_training_idx ON company_os.training_outcome_credits USING btree (training_id)
  WHERE (training_id IS NOT NULL);

CREATE INDEX training_outcomes_person_idx ON company_os.training_outcomes USING btree (person_id, status, happened_on DESC);

CREATE TRIGGER training_outcomes_updated_at
  BEFORE UPDATE ON company_os.training_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."training_outcome_credits"."created_at" IS 'When the credit was given.';

COMMENT ON COLUMN "company_os"."training_outcome_credits"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_outcome_credits"."outcome_id" IS 'The outcome credited (training_outcomes); removing the outcome removes its credits.';

COMMENT ON COLUMN "company_os"."training_outcome_credits"."person_id" IS 'The outcome''s person, carried so each key can hold the credit to that person''s own register row, roster row and outcome.';

COMMENT ON COLUMN "company_os"."training_outcome_credits"."plan_id" IS 'The plan credited (training_plans), through the person''s own roster row on it; null when a training is credited.';

COMMENT ON COLUMN "company_os"."training_outcome_credits"."training_id" IS 'The training credited (trainings), through the person''s own register row on it; null when a plan is credited.';

COMMENT ON COLUMN "company_os"."training_outcomes"."answered_at" IS 'When the person accepted or dismissed a suggestion; null for their own outcomes and for a suggestion still waiting.';

COMMENT ON COLUMN "company_os"."training_outcomes"."certification_track" IS 'The certification track whose certified status offered it; set exactly when source is certification, and unique per person, so each track is offered once.';

COMMENT ON COLUMN "company_os"."training_outcomes"."created_at" IS 'When the outcome was recorded or suggested.';

COMMENT ON COLUMN "company_os"."training_outcomes"."description" IS 'What the outcome was, in the person''s words (or the suggester''s, until the person edits it); 1 to 500 characters.';

COMMENT ON COLUMN "company_os"."training_outcomes"."happened_on" IS 'The day the outcome happened, as the person gives it.';

COMMENT ON COLUMN "company_os"."training_outcomes"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_outcomes"."person_id" IS 'The person the outcome is about and belongs to; it follows their person record, so a leaver''s outcomes stay theirs and are never reassigned.';

COMMENT ON COLUMN "company_os"."training_outcomes"."source" IS 'Where the outcome came from: the person, an organiser''s suggestion, or a certification reaching certified. Valid values: [member, organiser, certification]';

COMMENT ON COLUMN "company_os"."training_outcomes"."status" IS 'Whether it counts: a suggestion waits for the person''s word, and only an accepted outcome is on their record. A dismissed suggestion is kept only so it is not offered again; nobody reads it. Valid values: [suggested, accepted, dismissed]';

COMMENT ON COLUMN "company_os"."training_outcomes"."suggested_by" IS 'The organiser who suggested it (training organiser, people.id); set exactly when source is organiser.';

COMMENT ON COLUMN "company_os"."training_outcomes"."updated_at" IS 'When the row last changed.';

COMMENT ON CONSTRAINT "training_outcomes_id_person_key" ON "company_os"."training_outcomes" IS 'The key a credit points at with its person (TR.6), so a credit always belongs to the outcome''s own person.';

COMMENT ON TABLE "company_os"."training_outcome_credits" IS 'One row is: one training or one plan a person says led to one of their outcomes, held to their own register row or roster row by composite keys. Never read about one person for someone else (ADR 0016). [transactional · People operations | tier 3 support | active]';

COMMENT ON TABLE "company_os"."training_outcomes" IS 'One row is: one result a person records about themselves — a cup won, a certificate passed — with its date, recorded by them or suggested by an organiser or a certification and accepted by them. Never read about one person for someone else (ADR 0016). [transactional · People operations | tier 3 support | active]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_outcome_credits" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_outcome_credits" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_outcomes" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_outcomes" TO "service_role";
