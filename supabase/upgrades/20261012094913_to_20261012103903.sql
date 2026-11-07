-- fork-schema-upgrade: 20261012094913 -> 20261012103903
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261012094913 (then 02-rebrand.sql) to version 20261012103903.
-- Apply with scripts/fork-upgrade.sh, which runs it in one transaction and
-- records the new version; README Step 3b. Reference data is not here: a fresh
-- install inserts it once, and an upgraded database keeps its own rows.
--

SET local check_function_bodies = off;

ALTER TABLE "company_os"."meeting_associations"
  DROP CONSTRAINT "meeting_links_entity_type_check";

ALTER TABLE "company_os"."meetings"
  DROP CONSTRAINT "meetings_source_check";

ALTER TABLE "company_os"."training_attendance"
  DROP CONSTRAINT "training_attendance_status_check";

CREATE TABLE "company_os"."training_assignments" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "training_id" uuid                     NOT NULL,
  "due_at"      timestamp with time zone NOT NULL,
  "prompt"      text                     NOT NULL,
  "accepts"     text[]                   NOT NULL DEFAULT '{written,upload,link,recording}'::text[],
  "created_by"  uuid,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "archived_at" timestamp with time zone,
  CONSTRAINT "training_assignments_accepts_check" CHECK (((cardinality(accepts) > 0) AND (accepts <@ ARRAY['written'::text, 'upload'::text, 'link'::text, 'recording'::text]))),
  CONSTRAINT "training_assignments_pkey" PRIMARY KEY (id),
  CONSTRAINT "training_assignments_prompt_check" CHECK ((length(TRIM(BOTH FROM prompt)) > 0))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_assignments" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_assignments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."training_exercises" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"         text                     NOT NULL,
  "side"          text                     NOT NULL,
  "skills"        text[]                   NOT NULL DEFAULT '{}'::text[],
  "format"        text,
  "minutes_min"   integer                  NOT NULL,
  "minutes_max"   integer                  NOT NULL,
  "instructions"  text,
  "materials_url" text,
  "homework_able" boolean                  NOT NULL DEFAULT false,
  "created_by"    uuid,
  "plan_id"       uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "archived_at"   timestamp with time zone,
  "archived_by"   uuid,
  CONSTRAINT "training_exercises_format_check" CHECK (((format IS NULL) OR (length(TRIM(BOTH FROM format)) > 0))),
  CONSTRAINT "training_exercises_materials_url_check" CHECK (((materials_url IS NULL) OR (length(TRIM(BOTH FROM materials_url)) > 0))),
  CONSTRAINT "training_exercises_minutes_min_check" CHECK ((minutes_min > 0)),
  CONSTRAINT "training_exercises_minutes_range" CHECK ((minutes_max >= minutes_min)),
  CONSTRAINT "training_exercises_pkey" PRIMARY KEY (id),
  CONSTRAINT "training_exercises_side_check" CHECK ((side = ANY (ARRAY['presentation'::text, 'reactive'::text]))),
  CONSTRAINT "training_exercises_title_check" CHECK ((length(TRIM(BOTH FROM title)) > 0))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_exercises" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_exercises"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."training_learner_notes" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"    uuid                     NOT NULL,
  "person_id"  uuid                     NOT NULL,
  "strong"     text                     NOT NULL DEFAULT ''::text,
  "weak"       text                     NOT NULL DEFAULT ''::text,
  "focus"      text                     NOT NULL DEFAULT ''::text,
  "written_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "training_learner_notes_pkey" PRIMARY KEY (id)
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_learner_notes" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_learner_notes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."training_session_blocks" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "training_id" uuid                     NOT NULL,
  "position"    integer                  NOT NULL,
  "side"        text                     NOT NULL,
  "exercise_id" uuid,
  "text"        text,
  "minutes"     integer                  NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "training_session_blocks_exercise_or_text" CHECK (((exercise_id IS NULL) <> (text IS NULL))),
  CONSTRAINT "training_session_blocks_minutes_check" CHECK ((minutes > 0)),
  CONSTRAINT "training_session_blocks_one_position" UNIQUE (training_id, "position"),
  CONSTRAINT "training_session_blocks_pkey" PRIMARY KEY (id),
  CONSTRAINT "training_session_blocks_position_check" CHECK (("position" >= 0)),
  CONSTRAINT "training_session_blocks_side_check" CHECK ((side = ANY (ARRAY['presentation'::text, 'reactive'::text]))),
  CONSTRAINT "training_session_blocks_text_check" CHECK (((text IS NULL) OR (length(TRIM(BOTH FROM text)) > 0)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_session_blocks" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_session_blocks"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."training_submissions" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" uuid                     NOT NULL,
  "person_id"     uuid                     NOT NULL,
  "kind"          text                     NOT NULL,
  "text"          text,
  "url"           text,
  "storage_path"  text,
  "submitted_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "training_submissions_kind_check" CHECK ((kind = ANY (ARRAY['written'::text, 'upload'::text, 'link'::text, 'recording'::text]))),
  CONSTRAINT "training_submissions_one_per_person" UNIQUE (assignment_id, person_id),
  CONSTRAINT "training_submissions_pkey" PRIMARY KEY (id),
  CONSTRAINT "training_submissions_shape" CHECK ((((kind = 'written'::text) AND (text IS
    NOT NULL) AND (url IS NULL) AND (storage_path IS NULL)) OR ((kind = 'link'::text) AND (url IS
    NOT NULL) AND (text IS NULL) AND (storage_path IS NULL)) OR ((kind = ANY (ARRAY['upload'::text, 'recording'::text])) AND (storage_path IS
    NOT NULL) AND (text IS NULL) AND (url IS NULL))))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_submissions" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_submissions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."training_weekly_recaps" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"         uuid                     NOT NULL,
  "week_start"      date                     NOT NULL,
  "step"            text                     NOT NULL DEFAULT 'drafting'::text,
  "draft"           jsonb,
  "instructor_note" text,
  "edited_at"       timestamp with time zone,
  "edited_by"       uuid,
  "hold_reason"     text,
  "send_after"      timestamp with time zone,
  "sent_at"         timestamp with time zone,
  "sent_to"         jsonb,
  "interaction_ids" uuid[]                   NOT NULL DEFAULT '{}'::uuid[],
  "attempts"        integer                  NOT NULL DEFAULT 0,
  "error"           text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "training_weekly_recaps_draft_check" CHECK (((draft IS NULL) OR (jsonb_typeof(draft) = 'object'::text))),
  CONSTRAINT "training_weekly_recaps_held_shape" CHECK (((step <> 'held'::text) OR (hold_reason IS NOT NULL))),
  CONSTRAINT "training_weekly_recaps_one_per_week" UNIQUE (plan_id, week_start),
  CONSTRAINT "training_weekly_recaps_pkey" PRIMARY KEY (id),
  CONSTRAINT "training_weekly_recaps_sent_shape" CHECK (((step = 'sent'::text) = (sent_at IS NOT NULL))),
  CONSTRAINT "training_weekly_recaps_sent_to_check" CHECK (((sent_to IS NULL) OR (jsonb_typeof(sent_to) = 'array'::text))),
  CONSTRAINT "training_weekly_recaps_step_check" CHECK ((step = ANY (ARRAY['drafting'::text, 'waiting'::text, 'sending'::text, 'sent'::text, 'held'::text, 'failed'::text])))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."training_weekly_recaps" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."training_weekly_recaps"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."training_attendance"
  ADD COLUMN "source" text NOT NULL DEFAULT 'member'::text;

ALTER TABLE "company_os"."trainings"
  ADD COLUMN "plan_state" text NOT NULL DEFAULT 'none'::text;

ALTER TABLE "company_os"."trainings"
  ADD COLUMN "plan_reasoning" text;

ALTER TABLE "company_os"."trainings"
  ADD COLUMN "materials" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "company_os"."trainings"
  ADD COLUMN "recap" jsonb;

ALTER TABLE "company_os"."trainings"
  ADD COLUMN "recap_state" text NOT NULL DEFAULT 'none'::text;

ALTER TABLE "company_os"."trainings"
  ADD COLUMN "recap_published_at" timestamp WITH time zone;

ALTER TABLE "company_os"."trainings"
  ADD COLUMN "recap_published_by" uuid;

CREATE OR REPLACE FUNCTION company_os.normalize_meeting_type (
  raw text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  select case
    when raw is null then null
    when raw in ('Sales','1-1','Leadership Sync','Vendor Call','General','Performance','Team Ceremony','Training') then raw
    when raw ilike any (array['%stand-up%','%standup%','%sprint%','%grooming%','%project planning%','%retro%','%ceremony%','%kickoff%','%kick-off%']) then 'Team Ceremony'
    when raw ilike '%vendor%' then 'Vendor Call'
    when raw ilike '%leadership%' or raw ilike '%exec %' or raw ilike '%leadership sync%' then 'Leadership Sync'
    when raw ilike '%performance review%' or raw ilike '%perf review%' or raw ilike '%performance%' then 'Performance'
    when raw ilike any (array['%english communication%','%training%','%class%']) then 'Training'
    when raw ilike '%1-1%' or raw ilike '%1:1%' or raw ilike '%one-on-one%' or raw ilike '%one on one%' or raw ilike '% <> %' then '1-1'
    when raw ilike '%sales%' or raw ilike '%discovery%' or raw ilike '%capabilities audit%' or raw ilike '%demo%' or raw ilike '%proposal%' then 'Sales'
    else 'General'
  end
$function$;

ALTER TABLE "company_os"."meeting_associations"
  ADD CONSTRAINT "meeting_links_entity_type_check"
    CHECK ((entity_type = ANY (ARRAY['deal'::text, 'company'::text, 'project'::text, 'inquiry'::text, 'person'::text, 'training'::text])));

ALTER TABLE "company_os"."meetings"
  ADD CONSTRAINT "meetings_source_check"
    CHECK
    ((source = ANY (ARRAY['lark'::text, 'thoughtflow'::text, 'manual'::text, 'zoom'::text, 'google'::text, 'other'::text, 'notes'::text, 'coaching'::text, 'review'::text,
    'training'::text])));

ALTER TABLE "company_os"."training_assignments"
  ADD CONSTRAINT "training_assignments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."training_assignments"
  ADD CONSTRAINT "training_assignments_training_id_fkey" FOREIGN KEY (training_id) REFERENCES company_os.trainings(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_attendance"
  ADD CONSTRAINT "training_attendance_source_check" CHECK ((source = ANY (ARRAY['member'::text, 'transcript'::text, 'organiser'::text])));

ALTER TABLE "company_os"."training_attendance"
  ADD CONSTRAINT "training_attendance_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'attended'::text, 'skipped'::text, 'absent'::text])));

ALTER TABLE "company_os"."training_exercises"
  ADD CONSTRAINT "training_exercises_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."training_exercises"
  ADD CONSTRAINT "training_exercises_created_by_fkey" FOREIGN KEY (created_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."training_exercises"
  ADD CONSTRAINT "training_exercises_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES company_os.training_plans(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_learner_notes"
  ADD CONSTRAINT "training_learner_notes_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_learner_notes"
  ADD CONSTRAINT "training_learner_notes_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES company_os.training_plans(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_learner_notes"
  ADD CONSTRAINT "training_learner_notes_written_by_fkey" FOREIGN KEY (written_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."training_session_blocks"
  ADD CONSTRAINT "training_session_blocks_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES company_os.training_exercises(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_session_blocks"
  ADD CONSTRAINT "training_session_blocks_training_id_fkey" FOREIGN KEY (training_id) REFERENCES company_os.trainings(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_submissions"
  ADD CONSTRAINT "training_submissions_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES company_os.training_assignments(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_submissions"
  ADD CONSTRAINT "training_submissions_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."training_weekly_recaps"
  ADD CONSTRAINT "training_weekly_recaps_edited_by_fkey" FOREIGN KEY (edited_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."training_weekly_recaps"
  ADD CONSTRAINT "training_weekly_recaps_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES company_os.training_plans(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."trainings"
  ADD CONSTRAINT "trainings_materials_array" CHECK ((jsonb_typeof(materials) = 'array'::text));

ALTER TABLE "company_os"."trainings"
  ADD CONSTRAINT "trainings_plan_state_check" CHECK ((plan_state = ANY (ARRAY['none'::text, 'drafted'::text, 'checked'::text])));

ALTER TABLE "company_os"."trainings"
  ADD CONSTRAINT "trainings_recap_object" CHECK (((recap IS NULL) OR (jsonb_typeof(recap) = 'object'::text)));

ALTER TABLE "company_os"."trainings"
  ADD CONSTRAINT "trainings_recap_published_by_fkey" FOREIGN KEY (recap_published_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."trainings"
  ADD CONSTRAINT "trainings_recap_published_shape" CHECK (((recap_state = 'published'::text) = (recap_published_at IS NOT NULL)));

ALTER TABLE "company_os"."trainings"
  ADD CONSTRAINT "trainings_recap_state_check" CHECK ((recap_state = ANY (ARRAY['none'::text, 'drafted'::text, 'published'::text])));

CREATE INDEX training_assignments_due_idx ON company_os.training_assignments USING btree (due_at)
  WHERE (archived_at IS NULL);

CREATE INDEX training_assignments_training_idx ON company_os.training_assignments USING btree (training_id);

CREATE INDEX training_exercises_plan_idx ON company_os.training_exercises USING btree (plan_id)
  WHERE (archived_at IS NULL);

CREATE INDEX training_exercises_side_idx ON company_os.training_exercises USING btree (side)
  WHERE (archived_at IS NULL);

CREATE INDEX training_learner_notes_latest_idx ON company_os.training_learner_notes USING btree (plan_id, person_id, created_at DESC);

CREATE INDEX training_session_blocks_exercise_idx ON company_os.training_session_blocks USING btree (exercise_id);

CREATE INDEX training_submissions_person_idx ON company_os.training_submissions USING btree (person_id);

CREATE INDEX training_weekly_recaps_step_idx ON company_os.training_weekly_recaps USING btree (step)
  WHERE (step <> ALL (ARRAY['sent'::text, 'held'::text]));

CREATE INDEX trainings_recap_state_idx ON company_os.trainings USING btree (recap_state, ends_at)
  WHERE (recap_state <> 'published'::text);

CREATE TRIGGER training_assignments_updated_at
  BEFORE UPDATE ON company_os.training_assignments
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

CREATE TRIGGER training_exercises_updated_at
  BEFORE UPDATE ON company_os.training_exercises
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

CREATE TRIGGER training_session_blocks_updated_at
  BEFORE UPDATE ON company_os.training_session_blocks
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

CREATE TRIGGER training_submissions_updated_at
  BEFORE UPDATE ON company_os.training_submissions
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

CREATE TRIGGER training_weekly_recaps_updated_at
  BEFORE UPDATE ON company_os.training_weekly_recaps
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."meetings"."meeting_type" IS 'Canonical meeting taxonomy, coerced on every write by the `meetings_normalize_type` trigger so imports can never introduce a new type; Training since English Program PR 5. Valid values: [Sales, 1-1, Leadership Sync, Vendor Call, General, Performance, Team Ceremony, Training].';

COMMENT ON COLUMN "company_os"."meetings"."source" IS 'Where this record came from; `notes` rows carry the folded meeting_notes client-notes workflow, `review` rows are performance-review calls, `training` rows are taught training sessions written by the training entity through crm''s writer. Valid values: [lark, thoughtflow, manual, zoom, google, other, notes, coaching, review, training].';

COMMENT ON COLUMN "company_os"."training_assignments"."accepts" IS 'The kinds of submission it takes. Valid values: [written, upload, link, recording]';

COMMENT ON COLUMN "company_os"."training_assignments"."archived_at" IS 'When the organiser withdrew it; submissions already made stay.';

COMMENT ON COLUMN "company_os"."training_assignments"."created_at" IS 'When it was set.';

COMMENT ON COLUMN "company_os"."training_assignments"."created_by" IS 'The person (company_os.people) who set it.';

COMMENT ON COLUMN "company_os"."training_assignments"."due_at" IS 'When it is due.';

COMMENT ON COLUMN "company_os"."training_assignments"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_assignments"."prompt" IS 'What to do, in the organiser''s words.';

COMMENT ON COLUMN "company_os"."training_assignments"."training_id" IS 'The session (trainings) it was set in.';

COMMENT ON COLUMN "company_os"."training_assignments"."updated_at" IS 'When the row last changed.';

COMMENT ON COLUMN "company_os"."training_attendance"."source" IS 'Who set the status: member (their own word, the default), transcript (the session''s recording said who spoke), organiser (the teacher corrected it). An override by the member or the organiser is never overwritten by a later transcript (ADR 0016, amended for taught sessions). Valid values: [member, transcript, organiser]';

COMMENT ON COLUMN "company_os"."training_attendance"."status" IS 'The member''s word: pending until they answer, or, on a taught session, what the transcript said (absent when it did not hear them) until they or the organiser correct it. Valid values: [pending, attended, skipped, absent]';

COMMENT ON COLUMN "company_os"."training_exercises"."archived_at" IS 'When it was retired; a retired exercise cannot be chosen for a new session plan.';

COMMENT ON COLUMN "company_os"."training_exercises"."archived_by" IS 'The person (company_os.people) who retired it.';

COMMENT ON COLUMN "company_os"."training_exercises"."created_at" IS 'When it was added.';

COMMENT ON COLUMN "company_os"."training_exercises"."created_by" IS 'The person (company_os.people) who added it.';

COMMENT ON COLUMN "company_os"."training_exercises"."format" IS 'How it is run: drill, roleplay, pair, solo, live, writing; free text.';

COMMENT ON COLUMN "company_os"."training_exercises"."homework_able" IS 'True when it can be set as homework.';

COMMENT ON COLUMN "company_os"."training_exercises"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_exercises"."instructions" IS 'What the teacher says and watches for.';

COMMENT ON COLUMN "company_os"."training_exercises"."materials_url" IS 'A link to slides, a doc or a recording it uses; null when none.';

COMMENT ON COLUMN "company_os"."training_exercises"."minutes_max" IS 'The longest it takes, in minutes; at least minutes_min.';

COMMENT ON COLUMN "company_os"."training_exercises"."minutes_min" IS 'The shortest it takes, in minutes.';

COMMENT ON COLUMN "company_os"."training_exercises"."plan_id" IS 'The plan (training_plans) it belongs to; null for one shared across plans.';

COMMENT ON COLUMN "company_os"."training_exercises"."side" IS 'Which half of a session it serves: presentation (what learners must have ready) or reactive (what can only be practised live). Valid values: [presentation, reactive]';

COMMENT ON COLUMN "company_os"."training_exercises"."skills" IS 'The skills it works, free tags such as pronunciation or clarifying questions; empty when untagged.';

COMMENT ON COLUMN "company_os"."training_exercises"."title" IS 'What the exercise is called.';

COMMENT ON COLUMN "company_os"."training_exercises"."updated_at" IS 'When the row last changed.';

COMMENT ON COLUMN "company_os"."training_learner_notes"."created_at" IS 'When this version was written; the latest row per (plan, person) is the current note.';

COMMENT ON COLUMN "company_os"."training_learner_notes"."focus" IS 'What to work on now.';

COMMENT ON COLUMN "company_os"."training_learner_notes"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_learner_notes"."person_id" IS 'The learner (company_os.people).';

COMMENT ON COLUMN "company_os"."training_learner_notes"."plan_id" IS 'The plan (training_plans) the note is about.';

COMMENT ON COLUMN "company_os"."training_learner_notes"."strong" IS 'What the learner does well, in the teacher''s words.';

COMMENT ON COLUMN "company_os"."training_learner_notes"."weak" IS 'What holds them back.';

COMMENT ON COLUMN "company_os"."training_learner_notes"."written_by" IS 'The person (company_os.people) who wrote this version.';

COMMENT ON COLUMN "company_os"."training_session_blocks"."created_at" IS 'When the block was written.';

COMMENT ON COLUMN "company_os"."training_session_blocks"."exercise_id" IS 'The library exercise (training_exercises) it runs; null for a free block.';

COMMENT ON COLUMN "company_os"."training_session_blocks"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_session_blocks"."minutes" IS 'How long it gets.';

COMMENT ON COLUMN "company_os"."training_session_blocks"."position" IS 'Its place in the session, from 0; unique within the session.';

COMMENT ON COLUMN "company_os"."training_session_blocks"."side" IS 'Which half it serves. Valid values: [presentation, reactive]';

COMMENT ON COLUMN "company_os"."training_session_blocks"."text" IS 'A free block''s own line; null when the block is a library exercise.';

COMMENT ON COLUMN "company_os"."training_session_blocks"."training_id" IS 'The session (trainings) this block belongs to.';

COMMENT ON COLUMN "company_os"."training_session_blocks"."updated_at" IS 'When the row last changed.';

COMMENT ON COLUMN "company_os"."training_submissions"."assignment_id" IS 'The assignment (training_assignments).';

COMMENT ON COLUMN "company_os"."training_submissions"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_submissions"."kind" IS 'Which of the four it is; the matching column is set and the others null. Valid values: [written, upload, link, recording]';

COMMENT ON COLUMN "company_os"."training_submissions"."person_id" IS 'The learner (company_os.people) who submitted.';

COMMENT ON COLUMN "company_os"."training_submissions"."storage_path" IS 'The object''s path in the training-uploads bucket, when kind is upload or recording.';

COMMENT ON COLUMN "company_os"."training_submissions"."submitted_at" IS 'When it was first submitted.';

COMMENT ON COLUMN "company_os"."training_submissions"."text" IS 'The written answer, when kind is written.';

COMMENT ON COLUMN "company_os"."training_submissions"."updated_at" IS 'When the row last changed; a resubmission updates it.';

COMMENT ON COLUMN "company_os"."training_submissions"."url" IS 'The link, when kind is link.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."attempts" IS 'How many times sending has been tried; three failures raise an alarm.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."created_at" IS 'When the row was created.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."draft" IS 'What will be sent: {this_week, attendance, progress: [{person_id, md}], next_week}; null while drafting.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."edited_at" IS 'When the organiser last edited the draft or the note.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."edited_by" IS 'The person (company_os.people) who last edited it.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."error" IS 'The last send error; null when none.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."hold_reason" IS 'Why the organiser held it; set when step is held.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."instructor_note" IS 'The organiser''s own paragraph, added to the email; null when none.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."interaction_ids" IS 'The interactions rows the sends were logged as, one per recipient.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."plan_id" IS 'The plan (training_plans) the week is about.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."send_after" IS 'When the routine sends it if the organiser has not; null before drafting finishes.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."sent_at" IS 'When it was sent.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."sent_to" IS 'Who it went to, as sent: an array of {person_id, email}.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."step" IS 'Where the run is: drafting (Claude writes it), waiting (the organiser may edit until send_after), sending, sent, held (the organiser stopped it), failed (the send errored; retried by the next tick). Valid values: [drafting, waiting, sending, sent, held, failed]';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."updated_at" IS 'When the row last changed.';

COMMENT ON COLUMN "company_os"."training_weekly_recaps"."week_start" IS 'The Monday of the ISO week recapped; one row per plan per week.';

COMMENT ON COLUMN "company_os"."trainings"."materials" IS 'Links the organiser attached for the session, shown to its learners: an array of {label, url}. Empty when none.';

COMMENT ON COLUMN "company_os"."trainings"."plan_reasoning" IS 'Claude''s one line on why it chose these blocks, for the organiser; null when the organiser wrote the plan by hand.';

COMMENT ON COLUMN "company_os"."trainings"."plan_state" IS 'Where the session plan stands (English Program PR 3): none until the prep routine or the organiser writes blocks, drafted once Claude has, checked once the organiser has read it. Valid values: [none, drafted, checked]';

COMMENT ON COLUMN "company_os"."trainings"."recap" IS 'The recap Claude drafted from the transcript (English Program PR 7): {covered, learners: [{person_id, md}], homework_suggestion}, each learner''s line addressed to that learner and shown to them alone; null until drafted.';

COMMENT ON COLUMN "company_os"."trainings"."recap_published_at" IS 'When the organiser published the recap.';

COMMENT ON COLUMN "company_os"."trainings"."recap_published_by" IS 'The person (company_os.people) who published it.';

COMMENT ON COLUMN "company_os"."trainings"."recap_state" IS 'Where the recap stands: none, drafted (waiting for the organiser), published (the learners can see it). Valid values: [none, drafted, published]';

COMMENT ON TABLE "company_os"."meeting_associations" IS 'One row is: one polymorphic link stating what a meeting is about — (meeting_id, entity_type, entity_id) to a deal, company, project, inquiry, person or training. [transactional · Client delivery & work | tier 3 support | active]';

COMMENT ON TABLE "company_os"."training_assignments" IS 'One row is: one piece of homework set in one session, due by a time, taking the kinds of submission it names. [transactional · People operations | tier 3 support | active]';

COMMENT ON TABLE "company_os"."training_exercises" IS 'One row is: one exercise in a training programme''s library — a drill, a roleplay, a writing task — that a session plan draws on, tagged by the half it serves and the skills it works. [master · Reference & rules | tier 3 support | active]';

COMMENT ON TABLE "company_os"."training_learner_notes" IS 'One row is: one version of the teacher''s living note about one learner on one plan — strong points, weak points, what to work on now — written by the teacher and read by the learner. [transactional · People operations | tier 3 support | active]';

COMMENT ON TABLE "company_os"."training_session_blocks" IS 'One row is: one block of one session''s plan — an exercise from the library or a free line, with its minutes and its place in the order. [transactional · People operations | tier 3 support | active]';

COMMENT ON TABLE "company_os"."training_submissions" IS 'One row is: one learner''s answer to one assignment — written text, an uploaded file, a link, or a recording made in the browser. [transactional · People operations | tier 3 support | active]';

COMMENT ON TABLE "company_os"."training_weekly_recaps" IS 'One row is: one week''s recap of one training plan for the people who pay for it — drafted by a routine, edited by the organiser, sent by email on their say-so or at the deadline, or held. [transactional · People operations | tier 3 support | active]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_assignments" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_assignments" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_exercises" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_exercises" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_learner_notes" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_learner_notes" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_session_blocks" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_session_blocks" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_submissions" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_submissions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."training_weekly_recaps" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."training_weekly_recaps" TO "service_role";
