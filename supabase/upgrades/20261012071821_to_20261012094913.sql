-- fork-schema-upgrade: 20261012071821 -> 20261012094913
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261012071821 (then 02-rebrand.sql) to version 20261012094913.
-- Apply with scripts/fork-upgrade.sh, which runs it in one transaction and
-- records the new version; README Step 3b. Reference data is not here: a fresh
-- install inserts it once, and an upgraded database keeps its own rows.
--

CREATE TABLE "company_os"."training_plan_members" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"    uuid                     NOT NULL,
  "person_id"  uuid                     NOT NULL,
  "added_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "added_by"   uuid,
  "removed_at" timestamp with time zone,
  "removed_by" uuid,
  CONSTRAINT "training_plan_members_one_per_person" UNIQUE (plan_id, person_id),
  CONSTRAINT "training_plan_members_pkey" PRIMARY KEY (id),
  CONSTRAINT "training_plan_members_removed_after_added" CHECK (((removed_at IS NULL) OR (removed_at >= added_at)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_plan_members" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_plan_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."training_plans" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "type_id"               uuid                     NOT NULL,
  "title"                 text                     NOT NULL,
  "organiser_id"          uuid                     NOT NULL,
  "rhythm"                jsonb                    NOT NULL,
  "published_until"       date,
  "lark_title"            text,
  "recipients"            jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "philosophy"            jsonb,
  "philosophy_updated_at" timestamp with time zone,
  "philosophy_updated_by" uuid,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "archived_at"           timestamp with time zone,
  "archived_by"           uuid,
  CONSTRAINT "training_plans_lark_title_check" CHECK (((lark_title IS NULL) OR (length(TRIM(BOTH FROM lark_title)) > 0))),
  CONSTRAINT "training_plans_philosophy_check" CHECK (((philosophy IS NULL) OR (jsonb_typeof(philosophy) = 'object'::text))),
  CONSTRAINT "training_plans_philosophy_shape" CHECK (((philosophy IS NULL) = (philosophy_updated_at IS NULL))),
  CONSTRAINT "training_plans_pkey" PRIMARY KEY (id),
  CONSTRAINT "training_plans_recipients_check" CHECK ((jsonb_typeof(recipients) = 'array'::text)),
  CONSTRAINT "training_plans_rhythm_check" CHECK ((jsonb_typeof(rhythm) = 'object'::text)),
  CONSTRAINT "training_plans_title_check" CHECK ((length(TRIM(BOTH FROM title)) > 0))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_plans" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_plans"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."trainings"
  ADD COLUMN "plan_id" uuid;

ALTER TABLE "company_os"."training_plan_members"
  ADD CONSTRAINT "training_plan_members_added_by_fkey" FOREIGN KEY (added_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."training_plan_members"
  ADD CONSTRAINT "training_plan_members_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_plan_members"
  ADD CONSTRAINT "training_plan_members_removed_by_fkey" FOREIGN KEY (removed_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."training_plans"
  ADD CONSTRAINT "training_plans_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."training_plans"
  ADD CONSTRAINT "training_plans_organiser_id_fkey" FOREIGN KEY (organiser_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_plans"
  ADD CONSTRAINT "training_plans_philosophy_updated_by_fkey" FOREIGN KEY (philosophy_updated_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."training_plan_members"
  ADD CONSTRAINT "training_plan_members_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES company_os.training_plans(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_plans"
  ADD CONSTRAINT "training_plans_type_id_fkey" FOREIGN KEY (type_id) REFERENCES company_os.training_types(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."trainings"
  ADD CONSTRAINT "trainings_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES company_os.training_plans(id) ON DELETE RESTRICT;

CREATE INDEX training_plan_members_person_idx ON company_os.training_plan_members USING btree (person_id);

CREATE INDEX training_plans_organiser_idx ON company_os.training_plans USING btree (organiser_id);

CREATE INDEX training_plans_type_idx ON company_os.training_plans USING btree (type_id);

CREATE INDEX trainings_plan_idx ON company_os.trainings USING btree (plan_id, starts_at);

CREATE TRIGGER training_plans_updated_at
  BEFORE UPDATE ON company_os.training_plans
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."training_plan_members"."added_at" IS 'When the organiser put them on the plan.';

COMMENT ON COLUMN "company_os"."training_plan_members"."added_by" IS 'The person (company_os.people) who put them on it.';

COMMENT ON COLUMN "company_os"."training_plan_members"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_plan_members"."person_id" IS 'The person (company_os.people) on it; once per plan.';

COMMENT ON COLUMN "company_os"."training_plan_members"."plan_id" IS 'The plan (training_plans).';

COMMENT ON COLUMN "company_os"."training_plan_members"."removed_at" IS 'When the organiser took them off; trainings already published keep their attendance row. Never deleted.';

COMMENT ON COLUMN "company_os"."training_plan_members"."removed_by" IS 'The person (company_os.people) who took them off.';

COMMENT ON COLUMN "company_os"."training_plans"."archived_at" IS 'When the organiser retired the plan; its trainings keep it, nothing new is published from it.';

COMMENT ON COLUMN "company_os"."training_plans"."archived_by" IS 'The person (company_os.people) who retired it.';

COMMENT ON COLUMN "company_os"."training_plans"."created_at" IS 'When the plan was created.';

COMMENT ON COLUMN "company_os"."training_plans"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_plans"."lark_title" IS 'The title of the Lark meeting the plan''s sessions are recorded under, which the pickup matches recordings by; null when sessions are not recorded.';

COMMENT ON COLUMN "company_os"."training_plans"."organiser_id" IS 'The person (company_os.people) who runs the plan: the teacher or coach. Only they publish, extend or change it.';

COMMENT ON COLUMN "company_os"."training_plans"."philosophy" IS 'The programme brief every prep draft and recap reads and the members see: {purpose, halves: {presentation, reactive, split}, group_for, one_on_one_for, pressure_rule, homework_rule, good_looks_like: [{line, side}], source}; null until seeded.';

COMMENT ON COLUMN "company_os"."training_plans"."philosophy_updated_at" IS 'When the philosophy was last written; null while it is null.';

COMMENT ON COLUMN "company_os"."training_plans"."philosophy_updated_by" IS 'The person (company_os.people) who last wrote the philosophy.';

COMMENT ON COLUMN "company_os"."training_plans"."published_until" IS 'The last date trainings have been created up to; null until the organiser first publishes. Nothing but the organiser extends it.';

COMMENT ON COLUMN "company_os"."training_plans"."recipients" IS 'Who receives the plan''s weekly recap email: an array of {person_id, email}, the person (company_os.people) and the address of theirs the recap goes to, since a person may have more than one row. Empty when no recap is sent.';

COMMENT ON COLUMN "company_os"."training_plans"."rhythm" IS 'When it meets: {weekdays: [2, 4], start: "14:00", end: "15:15", tz: "Asia/Ho_Chi_Minh"}; weekdays are ISO numbers, Monday 1 to Sunday 7, in the plan''s zone.';

COMMENT ON COLUMN "company_os"."training_plans"."title" IS 'What the plan is called, as its members see it; each published training takes it as its title.';

COMMENT ON COLUMN "company_os"."training_plans"."type_id" IS 'The kind of training every occurrence of this plan is (training_types).';

COMMENT ON COLUMN "company_os"."training_plans"."updated_at" IS 'When the row last changed.';

COMMENT ON COLUMN "company_os"."trainings"."plan_id" IS 'The plan (training_plans) this occurrence was published from; null for a single training or one a member logged for themselves.';

COMMENT ON TABLE "company_os"."training_plan_members" IS 'One row is: one person on one training plan''s roster — every training the plan publishes while they are on it puts them on its attendance. [transactional · People operations | tier 3 support | active]';

COMMENT ON TABLE "company_os"."training_plans" IS 'One row is: one series of trainings an organiser runs on a rhythm — an English class on Tuesdays and Thursdays, a weekly 1-1, a scrim block — published as trainings up to a date, with the programme philosophy its prep drafts and recaps read. [transactional · People operations | tier 3 support | active]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_plan_members" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_plan_members" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_plans" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_plans" TO "service_role";
