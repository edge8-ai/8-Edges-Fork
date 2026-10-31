-- fork-schema-upgrade: 20261026090859 -> 20261027080216
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261026090859 (then 02-rebrand.sql) to version 20261027080216.
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

CREATE TABLE "company_os"."training_learner_feedback" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "training_id"      uuid                     NOT NULL,
  "person_id"        uuid                     NOT NULL,
  "evaluation"       jsonb,
  "evaluation_model" text,
  "evaluated_at"     timestamp with time zone,
  "feedback"         text,
  "feedback_by"      uuid,
  "feedback_at"      timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "training_learner_feedback_evaluated" CHECK (((evaluation IS NULL) = (evaluated_at IS NULL))),
  CONSTRAINT "training_learner_feedback_evaluation_check" CHECK (((evaluation IS NULL) OR (jsonb_typeof(evaluation) = 'object'::text))),
  CONSTRAINT "training_learner_feedback_one_per_lesson" UNIQUE (training_id, person_id),
  CONSTRAINT "training_learner_feedback_pkey" PRIMARY KEY (id),
  CONSTRAINT "training_learner_feedback_written" CHECK (((feedback IS NULL) = (feedback_at IS NULL)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_learner_feedback" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_learner_feedback"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."training_learner_feedback"
  ADD CONSTRAINT "training_learner_feedback_feedback_by_fkey" FOREIGN KEY (feedback_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."training_learner_feedback"
  ADD CONSTRAINT "training_learner_feedback_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_learner_feedback"
  ADD CONSTRAINT "training_learner_feedback_training_id_fkey" FOREIGN KEY (training_id) REFERENCES company_os.trainings(id) ON DELETE RESTRICT;

CREATE INDEX training_learner_feedback_person_idx ON company_os.training_learner_feedback USING btree (person_id);

CREATE TRIGGER training_learner_feedback_updated_at
  BEFORE UPDATE ON company_os.training_learner_feedback
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."training_learner_feedback"."created_at" IS 'When the row was created.';

COMMENT ON COLUMN "company_os"."training_learner_feedback"."evaluated_at" IS 'When the evaluation was written; null while it is null.';

COMMENT ON COLUMN "company_os"."training_learner_feedback"."evaluation" IS 'Claude''s evaluation of the learner''s English in this lesson, read from the transcript: {level, summary, strengths, improvements, examples: [{said, better}]}; null until evaluated.';

COMMENT ON COLUMN "company_os"."training_learner_feedback"."evaluation_model" IS 'The model that wrote the evaluation.';

COMMENT ON COLUMN "company_os"."training_learner_feedback"."feedback" IS 'The teacher''s feedback for this learner on this lesson, in their words; null until written.';

COMMENT ON COLUMN "company_os"."training_learner_feedback"."feedback_at" IS 'When the feedback was last written; null while it is null.';

COMMENT ON COLUMN "company_os"."training_learner_feedback"."feedback_by" IS 'The person (company_os.people) who last wrote the feedback.';

COMMENT ON COLUMN "company_os"."training_learner_feedback"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_learner_feedback"."person_id" IS 'The learner (company_os.people).';

COMMENT ON COLUMN "company_os"."training_learner_feedback"."training_id" IS 'The lesson (trainings).';

COMMENT ON COLUMN "company_os"."training_learner_feedback"."updated_at" IS 'When the row last changed.';

COMMENT ON TABLE "company_os"."training_learner_feedback" IS 'One row is: one learner''s feedback on one lesson — Claude''s evaluation of their English from the transcript and the teacher''s own feedback — read by the teacher and admins. [transactional · People operations | tier 3 support | active]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_learner_feedback" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_learner_feedback" TO "service_role";
