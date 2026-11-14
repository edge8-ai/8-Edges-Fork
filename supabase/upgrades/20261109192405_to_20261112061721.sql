-- fork-schema-upgrade: 20261109192405 -> 20261112061721
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261109192405 (then 02-rebrand.sql) to version 20261112061721.
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
  DROP CONSTRAINT "performance_reviews_rater_kind_check";

ALTER TABLE "company_os"."performance_reviews"
  DROP CONSTRAINT "performance_reviews_review_type_check";

CREATE TABLE "company_os"."review_cycle_members" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "cycle_id"                 uuid                     NOT NULL,
  "team_member_id"           uuid                     NOT NULL,
  "client_manager_person_id" uuid,
  "rater_unlocked_at"        timestamp with time zone,
  "rater_unlocked_by"        uuid,
  "hr_summary"               text,
  "skip_waived_at"           timestamp with time zone,
  "skip_waived_by"           uuid,
  "released_at"              timestamp with time zone,
  "released_by"              uuid,
  "withdrawn_at"             timestamp with time zone,
  "created_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "review_cycle_members_one_per_cycle" UNIQUE (cycle_id, team_member_id),
  CONSTRAINT "review_cycle_members_pkey" PRIMARY KEY (id),
  CONSTRAINT "review_cycle_members_release_whole" CHECK (((released_at IS NULL) = (released_by IS NULL))),
  CONSTRAINT "review_cycle_members_unlock_whole" CHECK (((rater_unlocked_at IS NULL) = (rater_unlocked_by IS NULL))),
  CONSTRAINT "review_cycle_members_waiver_whole" CHECK (((skip_waived_at IS NULL) = (skip_waived_by IS NULL)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."review_cycle_members" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."review_cycle_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."review_cycles" (
  "id"                             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "company_id"                     uuid,
  "framework_id"                   uuid                     NOT NULL,
  "name"                           text                     NOT NULL,
  "opened_by"                      uuid                     NOT NULL,
  "opened_at"                      timestamp with time zone NOT NULL DEFAULT now(),
  "closed_at"                      timestamp with time zone,
  "closed_by"                      uuid,
  "skip_manager_person_id"         uuid,
  "skip_manager_token"             text,
  "skip_manager_link_copied_at"    timestamp with time zone,
  "skip_manager_link_cancelled_at" timestamp with time zone,
  "created_at"                     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "review_cycles_closed_whole" CHECK (((closed_at IS NULL) = (closed_by IS NULL))),
  CONSTRAINT "review_cycles_name_check" CHECK ((length(btrim(name)) > 0)),
  CONSTRAINT "review_cycles_pkey" PRIMARY KEY (id),
  CONSTRAINT "review_cycles_token_needs_person" CHECK (((skip_manager_token IS NULL) OR (skip_manager_person_id IS NOT NULL)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."review_cycles" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."review_cycles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."review_frameworks" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"             text                     NOT NULL,
  "description"      text,
  "member_survey_id" uuid                     NOT NULL,
  "rater_survey_id"  uuid                     NOT NULL,
  "rating_scale"     text                     NOT NULL,
  "rating_keys"      text[]                   NOT NULL,
  "usual_open_month" smallint,
  "usual_open_day"   smallint,
  "archived_at"      timestamp with time zone,
  "archived_by"      uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "review_frameworks_name_check" CHECK ((length(btrim(name)) > 0)),
  CONSTRAINT "review_frameworks_pkey" PRIMARY KEY (id),
  CONSTRAINT "review_frameworks_rating_keys_check" CHECK ((cardinality(rating_keys) > 0)),
  CONSTRAINT "review_frameworks_rating_scale_check" CHECK ((length(btrim(rating_scale)) > 0)),
  CONSTRAINT "review_frameworks_two_forms" CHECK ((member_survey_id <> rater_survey_id)),
  CONSTRAINT "review_frameworks_usual_date_whole" CHECK (((usual_open_month IS NULL) = (usual_open_day IS NULL))),
  CONSTRAINT "review_frameworks_usual_open_day_check" CHECK (((usual_open_day >= 1) AND (usual_open_day <= 31))),
  CONSTRAINT "review_frameworks_usual_open_month_check" CHECK (((usual_open_month >= 1) AND (usual_open_month <= 12)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."review_frameworks" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."review_frameworks"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."performance_reviews"
  ADD COLUMN "review_cycle_id" uuid;

ALTER TABLE "company_os"."performance_reviews"
  ADD CONSTRAINT "performance_reviews_client_needs_cycle" CHECK (((review_type <> 'client'::text) OR (review_cycle_id IS NOT NULL)));

ALTER TABLE "company_os"."performance_reviews"
  ADD CONSTRAINT "performance_reviews_cycle_kinds_need_cycle" CHECK (((rater_kind <> ALL (ARRAY['client_manager'::text, 'skip_manager'::text])) OR (review_cycle_id IS NOT NULL)));

ALTER TABLE "company_os"."performance_reviews"
  ADD CONSTRAINT "performance_reviews_rater_kind_check"
    CHECK ((rater_kind = ANY (ARRAY['self'::text, 'manager'::text, 'reviewer'::text, 'external'::text, 'client_manager'::text, 'skip_manager'::text])));

ALTER TABLE "company_os"."performance_reviews"
  ADD CONSTRAINT "performance_reviews_review_type_check"
    CHECK ((review_type = ANY (ARRAY['probation'::text, 'midyear'::text, 'renewal'::text, 'adhoc'::text, 'annual'::text, 'quarterly'::text, 'client'::text])));

ALTER TABLE "company_os"."review_cycle_members"
  ADD CONSTRAINT "review_cycle_members_client_manager_person_id_fkey" FOREIGN KEY (client_manager_person_id) REFERENCES company_os.people(id);

ALTER TABLE "company_os"."review_cycle_members"
  ADD CONSTRAINT "review_cycle_members_rater_unlocked_by_fkey" FOREIGN KEY (rater_unlocked_by) REFERENCES company_os.people(id);

ALTER TABLE "company_os"."review_cycle_members"
  ADD CONSTRAINT "review_cycle_members_released_by_fkey" FOREIGN KEY (released_by) REFERENCES company_os.people(id);

ALTER TABLE "company_os"."review_cycle_members"
  ADD CONSTRAINT "review_cycle_members_skip_waived_by_fkey" FOREIGN KEY (skip_waived_by) REFERENCES company_os.people(id);

ALTER TABLE "company_os"."review_cycle_members"
  ADD CONSTRAINT "review_cycle_members_team_member_id_fkey" FOREIGN KEY (team_member_id) REFERENCES company_os.team_members(id) ON DELETE CASCADE;

ALTER TABLE "company_os"."review_cycles"
  ADD CONSTRAINT "review_cycles_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES company_os.people(id);

ALTER TABLE "company_os"."review_cycles"
  ADD CONSTRAINT "review_cycles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES company_os.companies(id);

ALTER TABLE "company_os"."review_cycles"
  ADD CONSTRAINT "review_cycles_opened_by_fkey" FOREIGN KEY (opened_by) REFERENCES company_os.people(id);

ALTER TABLE "company_os"."performance_reviews"
  ADD CONSTRAINT "performance_reviews_review_cycle_id_fkey" FOREIGN KEY (review_cycle_id) REFERENCES company_os.review_cycles(id);

ALTER TABLE "company_os"."review_cycle_members"
  ADD CONSTRAINT "review_cycle_members_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES company_os.review_cycles(id);

ALTER TABLE "company_os"."review_cycles"
  ADD CONSTRAINT "review_cycles_skip_manager_person_id_fkey" FOREIGN KEY (skip_manager_person_id) REFERENCES company_os.people(id);

ALTER TABLE "company_os"."review_frameworks"
  ADD CONSTRAINT "review_frameworks_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES company_os.people(id);

ALTER TABLE "company_os"."review_frameworks"
  ADD CONSTRAINT "review_frameworks_member_survey_id_fkey" FOREIGN KEY (member_survey_id) REFERENCES company_os.surveys(id);

ALTER TABLE "company_os"."review_cycles"
  ADD CONSTRAINT "review_cycles_framework_id_fkey" FOREIGN KEY (framework_id) REFERENCES company_os.review_frameworks(id);

ALTER TABLE "company_os"."review_frameworks"
  ADD CONSTRAINT "review_frameworks_rater_survey_id_fkey" FOREIGN KEY (rater_survey_id) REFERENCES company_os.surveys(id);

CREATE UNIQUE INDEX performance_reviews_cycle_part_uniq ON company_os.performance_reviews USING btree (review_cycle_id, team_member_id, rater_kind)
  WHERE (review_cycle_id IS NOT NULL);

CREATE INDEX review_cycle_members_member_idx ON company_os.review_cycle_members USING btree (team_member_id);

CREATE UNIQUE INDEX review_cycles_company_name_uniq ON company_os.review_cycles USING btree (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE INDEX review_cycles_framework_idx ON company_os.review_cycles USING btree (framework_id);

CREATE UNIQUE INDEX review_cycles_skip_token_uniq ON company_os.review_cycles USING btree (skip_manager_token)
  WHERE (skip_manager_token IS NOT NULL);

CREATE UNIQUE INDEX review_frameworks_name_uniq ON company_os.review_frameworks USING btree (lower(name));

CREATE TRIGGER review_cycle_members_updated_at
  BEFORE UPDATE ON company_os.review_cycle_members
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

CREATE TRIGGER review_cycles_updated_at
  BEFORE UPDATE ON company_os.review_cycles
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

CREATE TRIGGER review_frameworks_updated_at
  BEFORE UPDATE ON company_os.review_frameworks
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."performance_reviews"."review_cycle_id" IS 'The review cycle this part belongs to (review_cycles.id); null for the company''s own reviews. A client review part always has one.';

COMMENT ON COLUMN "company_os"."review_cycle_members"."client_manager_person_id" IS 'The member''s client manager, the person at the client who rates them (people.id); null when the rater is not a client contact.';

COMMENT ON COLUMN "company_os"."review_cycle_members"."created_at" IS 'When the row was created.';

COMMENT ON COLUMN "company_os"."review_cycle_members"."cycle_id" IS 'The cycle (review_cycles.id).';

COMMENT ON COLUMN "company_os"."review_cycle_members"."hr_summary" IS 'The HR summary, a note the person running the cycle writes about this member''s review. Shown to the member only after release.';

COMMENT ON COLUMN "company_os"."review_cycle_members"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."review_cycle_members"."rater_unlocked_at" IS 'When the rater''s part was opened before the member submitted theirs; null when the usual order holds.';

COMMENT ON COLUMN "company_os"."review_cycle_members"."rater_unlocked_by" IS 'Who unlocked it (people.id).';

COMMENT ON COLUMN "company_os"."review_cycle_members"."released_at" IS 'When the review was released to the member; null until then. Before it, the member sees only their own part.';

COMMENT ON COLUMN "company_os"."review_cycle_members"."released_by" IS 'Who released it (people.id).';

COMMENT ON COLUMN "company_os"."review_cycle_members"."skip_waived_at" IS 'When the wait for the skip-manager''s Reviewed mark was waived for this member; null when it was not.';

COMMENT ON COLUMN "company_os"."review_cycle_members"."skip_waived_by" IS 'Who waived it (people.id).';

COMMENT ON COLUMN "company_os"."review_cycle_members"."team_member_id" IS 'The team member reviewed (team_members.id). One row per member per cycle.';

COMMENT ON COLUMN "company_os"."review_cycle_members"."updated_at" IS 'When the row last changed (the house trigger).';

COMMENT ON COLUMN "company_os"."review_cycle_members"."withdrawn_at" IS 'When the member was taken out of the cycle; null while they are in it. Their rows stay.';

COMMENT ON COLUMN "company_os"."review_cycles"."closed_at" IS 'When the cycle was closed; null while it is open. Closing stops every link in the cycle.';

COMMENT ON COLUMN "company_os"."review_cycles"."closed_by" IS 'Who closed it (people.id).';

COMMENT ON COLUMN "company_os"."review_cycles"."company_id" IS 'The client whose team is reviewed (companies.id); null for a cycle that is not about a client.';

COMMENT ON COLUMN "company_os"."review_cycles"."created_at" IS 'When the row was created.';

COMMENT ON COLUMN "company_os"."review_cycles"."framework_id" IS 'The framework the cycle runs (review_frameworks.id).';

COMMENT ON COLUMN "company_os"."review_cycles"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."review_cycles"."name" IS 'The cycle''s name as people read it, such as the month and year it covers. Unique per client, ignoring case.';

COMMENT ON COLUMN "company_os"."review_cycles"."opened_at" IS 'When the cycle was opened and its members were asked.';

COMMENT ON COLUMN "company_os"."review_cycles"."opened_by" IS 'Who opened the cycle (people.id). They are told when parts are submitted.';

COMMENT ON COLUMN "company_os"."review_cycles"."skip_manager_link_cancelled_at" IS 'When the skip-manager''s link was cancelled without a replacement; cleared when a new link is issued.';

COMMENT ON COLUMN "company_os"."review_cycles"."skip_manager_link_copied_at" IS 'When the person running the cycle last copied the skip-manager''s link to send it herself.';

COMMENT ON COLUMN "company_os"."review_cycles"."skip_manager_person_id" IS 'The skip-manager, the person at the client the client managers answer to (people.id); null when the cycle has none.';

COMMENT ON COLUMN "company_os"."review_cycles"."skip_manager_token" IS 'The secret in the skip-manager''s personal link; null when there is no skip-manager or the link was cancelled. Never shown to anyone but the person running the cycle.';

COMMENT ON COLUMN "company_os"."review_cycles"."updated_at" IS 'When the row last changed (the house trigger).';

COMMENT ON COLUMN "company_os"."review_frameworks"."archived_at" IS 'When the framework was retired; null while it can be picked.';

COMMENT ON COLUMN "company_os"."review_frameworks"."archived_by" IS 'Who retired it (people.id).';

COMMENT ON COLUMN "company_os"."review_frameworks"."created_at" IS 'When the row was created.';

COMMENT ON COLUMN "company_os"."review_frameworks"."description" IS 'What the framework is for, in a sentence or two.';

COMMENT ON COLUMN "company_os"."review_frameworks"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."review_frameworks"."member_survey_id" IS 'The form the reviewed member fills in (surveys.id).';

COMMENT ON COLUMN "company_os"."review_frameworks"."name" IS 'The framework''s name as the person opening a cycle reads it. Unique among frameworks, ignoring case.';

COMMENT ON COLUMN "company_os"."review_frameworks"."rater_survey_id" IS 'The form the member''s rater fills in (surveys.id), worded about the member.';

COMMENT ON COLUMN "company_os"."review_frameworks"."rating_keys" IS 'The rating keys whose mean is a part''s average. An average exists only when every key has a rating.';

COMMENT ON COLUMN "company_os"."review_frameworks"."rating_scale" IS 'The key stamped on each review part''s rating_scale, so ratings on different scales are never compared.';

COMMENT ON COLUMN "company_os"."review_frameworks"."updated_at" IS 'When the row last changed (the house trigger).';

COMMENT ON COLUMN "company_os"."review_frameworks"."usual_open_day" IS 'The day of that month the cycle usually opens (1 to 31); null with the month.';

COMMENT ON COLUMN "company_os"."review_frameworks"."usual_open_month" IS 'The month this framework''s cycle usually opens (1 to 12), for the opening nudge; null when it has no usual date.';

COMMENT ON TABLE "company_os"."review_cycle_members" IS 'One row is: one team member''s place in one review cycle: who rates them, and what the person running the cycle has decided about their review. [transactional · People operations | tier 3 support | waiting]';

COMMENT ON TABLE "company_os"."review_cycles" IS 'One row is: one cycle, one holding of a review on one framework: the members reviewed, each one''s rater, and the skip-manager, from the day it is opened to the day it is closed. [transactional · People operations | tier 3 support | waiting]';

COMMENT ON TABLE "company_os"."review_frameworks" IS 'One row is: one framework, a named set of review questions and the scale they are answered on, with one form for the member and one for whoever rates them. It belongs to no client and no team; a cycle picks one. [master · Reference & rules | tier 3 support | waiting]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."review_cycle_members" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."review_cycle_members" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."review_cycles" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."review_cycles" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."review_frameworks" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."review_frameworks" TO "service_role";
