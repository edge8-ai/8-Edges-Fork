-- fork-schema-upgrade: 20261028223539 -> 20261029003440
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261028223539 (then 02-rebrand.sql) to version 20261029003440.
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

CREATE TABLE "company_os"."replenishment_jobs" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "run_id"        uuid                     NOT NULL,
  "position"      integer                  NOT NULL,
  "item"          text                     NOT NULL,
  "description"   text                     NOT NULL DEFAULT ''::text,
  "rule_label"    text                     NOT NULL,
  "band_label"    text                     NOT NULL,
  "pick_total"    numeric                  NOT NULL,
  "reserve_total" numeric                  NOT NULL,
  "move_text"     text                     NOT NULL,
  "collect"       jsonb                    NOT NULL,
  "destinations"  text[]                   NOT NULL DEFAULT '{}'::text[],
  "done_at"       timestamp with time zone,
  "bin_used"      text,
  "done_by"       uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "replenishment_jobs_collect_check" CHECK ((jsonb_typeof(collect) = 'array'::text)),
  CONSTRAINT "replenishment_jobs_done_shape" CHECK ((((done_at IS NULL) AND (bin_used IS NULL) AND (done_by IS NULL)) OR ((done_at IS NOT NULL) AND (bin_used IS
    NOT NULL) AND (done_by IS NOT NULL)))),
  CONSTRAINT "replenishment_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "replenishment_jobs_position_check" CHECK (("position" >= 1)),
  CONSTRAINT "replenishment_jobs_reserve_total_check" CHECK ((reserve_total > (0)::numeric)),
  CONSTRAINT "replenishment_jobs_run_id_position_key" UNIQUE (run_id, "position")
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."replenishment_jobs" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."replenishment_jobs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."replenishment_profiles" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"        text                     NOT NULL,
  "warehouse"   text                     NOT NULL,
  "document"    jsonb                    NOT NULL,
  "version"     integer                  NOT NULL DEFAULT 1,
  "saved_by"    uuid,
  "saved_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "replenishment_profiles_document_check" CHECK ((jsonb_typeof(document) = 'object'::text)),
  CONSTRAINT "replenishment_profiles_name_check" CHECK ((length(TRIM(BOTH FROM name)) > 0)),
  CONSTRAINT "replenishment_profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "replenishment_profiles_version_check" CHECK ((version >= 1)),
  CONSTRAINT "replenishment_profiles_warehouse_check" CHECK ((length(TRIM(BOTH FROM warehouse)) > 0))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."replenishment_profiles" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."replenishment_profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."replenishment_runs" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id"       uuid                     NOT NULL,
  "profile_version"  integer                  NOT NULL,
  "profile_snapshot" jsonb                    NOT NULL,
  "file_name"        text                     NOT NULL,
  "storage_path"     text                     NOT NULL,
  "data_rows"        integer                  NOT NULL,
  "truncated"        boolean                  NOT NULL,
  "left_out"         jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "status"           text                     NOT NULL DEFAULT 'draft'::text,
  "uploaded_by"      uuid,
  "uploaded_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "sent_by"          uuid,
  "sent_at"          timestamp with time zone,
  "closed_by"        uuid,
  "closed_at"        timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "replenishment_runs_data_rows_check" CHECK ((data_rows >= 0)),
  CONSTRAINT "replenishment_runs_left_out_check" CHECK ((jsonb_typeof(left_out) = 'array'::text)),
  CONSTRAINT "replenishment_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "replenishment_runs_profile_snapshot_check" CHECK ((jsonb_typeof(profile_snapshot) = 'object'::text)),
  CONSTRAINT "replenishment_runs_profile_version_check" CHECK ((profile_version >= 1)),
  CONSTRAINT "replenishment_runs_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'closed'::text]))),
  CONSTRAINT "replenishment_runs_status_shape" CHECK ((((status <> 'sent'::text) OR (sent_at IS NOT NULL)) AND ((status <> 'closed'::text) OR (closed_at IS NOT NULL))))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."replenishment_runs" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."replenishment_runs"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."replenishment_jobs"
  ADD CONSTRAINT "replenishment_jobs_done_by_fkey" FOREIGN KEY (done_by) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."replenishment_profiles"
  ADD CONSTRAINT "replenishment_profiles_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."replenishment_profiles"
  ADD CONSTRAINT "replenishment_profiles_saved_by_fkey" FOREIGN KEY (saved_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."replenishment_runs"
  ADD CONSTRAINT "replenishment_runs_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."replenishment_jobs"
  ADD CONSTRAINT "replenishment_jobs_run_id_fkey" FOREIGN KEY (run_id) REFERENCES company_os.replenishment_runs(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."replenishment_runs"
  ADD CONSTRAINT "replenishment_runs_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES company_os.replenishment_profiles(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."replenishment_runs"
  ADD CONSTRAINT "replenishment_runs_sent_by_fkey" FOREIGN KEY (sent_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."replenishment_runs"
  ADD CONSTRAINT "replenishment_runs_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

CREATE INDEX replenishment_runs_profile_uploaded_idx ON company_os.replenishment_runs USING btree (profile_id, uploaded_at DESC);

CREATE TRIGGER replenishment_jobs_updated_at
  BEFORE UPDATE ON company_os.replenishment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

CREATE TRIGGER replenishment_profiles_updated_at
  BEFORE UPDATE ON company_os.replenishment_profiles
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

CREATE TRIGGER replenishment_runs_updated_at
  BEFORE UPDATE ON company_os.replenishment_runs
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."replenishment_jobs"."band_label" IS 'The label of the band that decided the job.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."bin_used" IS 'The BIN the operator scanned or typed when finishing it, trimmed and never checked against a pattern. Reopening clears it.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."collect" IS 'Where to collect from, in walking order: each reserve location with its quantity.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."created_at" IS 'When the job was written.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."description" IS 'The item''s description as the export spelled it.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."destinations" IS 'The pick locations suggested to put it in, first choice first; empty when the item has no pick location yet.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."done_at" IS 'When the job was finished; null while it is open. Reopening clears it.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."done_by" IS 'The person (company_os.people) who finished it. Reopening clears it.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."item" IS 'The item code as the export spelled it.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."move_text" IS 'What to move, as the operator reads it ("12", or "8 or 12" when the operator chooses at the shelf).';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."pick_total" IS 'The quantity on the pick face when the export was taken.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."position" IS 'The job''s number in the run, from 1, in walking order.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."reserve_total" IS 'The quantity in reserve when the export was taken.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."rule_label" IS 'The label of the profile rule that decided the job.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."run_id" IS 'The run (replenishment_runs) the job belongs to.';

COMMENT ON COLUMN "company_os"."replenishment_jobs"."updated_at" IS 'When the row last changed; maintained by a trigger.';

COMMENT ON COLUMN "company_os"."replenishment_profiles"."archived_at" IS 'When it was archived; null while it is in use.';

COMMENT ON COLUMN "company_os"."replenishment_profiles"."archived_by" IS 'The person (company_os.people) who archived it.';

COMMENT ON COLUMN "company_os"."replenishment_profiles"."created_at" IS 'When the profile was first imported or created.';

COMMENT ON COLUMN "company_os"."replenishment_profiles"."document" IS 'The profile itself, the shape the Replenishment entity''s schema defines; validated at every write and read.';

COMMENT ON COLUMN "company_os"."replenishment_profiles"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."replenishment_profiles"."name" IS 'The profile''s name as its manager wrote it.';

COMMENT ON COLUMN "company_os"."replenishment_profiles"."saved_at" IS 'When it was last imported or saved.';

COMMENT ON COLUMN "company_os"."replenishment_profiles"."saved_by" IS 'The person (company_os.people) who last imported or saved it.';

COMMENT ON COLUMN "company_os"."replenishment_profiles"."updated_at" IS 'When the row last changed; maintained by a trigger.';

COMMENT ON COLUMN "company_os"."replenishment_profiles"."version" IS 'Starts at 1 and goes up by one on every save, so a run can say which version it was made from.';

COMMENT ON COLUMN "company_os"."replenishment_profiles"."warehouse" IS 'The warehouse or site the profile describes, as its manager names it.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."closed_at" IS 'When the run was closed; null while it is open.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."closed_by" IS 'The person (company_os.people) who closed the run.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."created_at" IS 'When the row was written.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."data_rows" IS 'How many non-blank data rows the export had, counted before any row was filtered.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."file_name" IS 'The uploaded export''s file name as it was on the uploader''s machine.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."left_out" IS 'The items held in reserve that the profile could not read, each with its item code, description and reason.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."profile_id" IS 'The profile (replenishment_profiles) the run was made from.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."profile_snapshot" IS 'A copy of the profile''s document at upload, so the run never changes when the profile is edited.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."profile_version" IS 'The profile''s version at upload.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."sent_at" IS 'When the run was sent to the scanners; null while it is a draft.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."sent_by" IS 'The person (company_os.people) who sent the run to the scanners.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."status" IS 'Where the run stands. Valid values: [draft, sent, closed]';

COMMENT ON COLUMN "company_os"."replenishment_runs"."storage_path" IS 'Where the uploaded export is kept in the private replenishment-exports bucket.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."truncated" IS 'True when the export had few enough rows to have been cut off by the system that wrote it.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."updated_at" IS 'When the row last changed; maintained by a trigger.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."uploaded_at" IS 'When the export was uploaded and the run written.';

COMMENT ON COLUMN "company_os"."replenishment_runs"."uploaded_by" IS 'The person (company_os.people) who uploaded the export.';

COMMENT ON TABLE "company_os"."replenishment_jobs" IS 'One row is: one replenishment job — one item to move from reserve to its pick face in one run, in walking order, with who finished it and with which BIN. [transactional · Client delivery & work | tier 3 support | waiting]';

COMMENT ON TABLE "company_os"."replenishment_profiles" IS 'One row is: one replenishment profile — one warehouse''s rules for restocking its pick faces from reserve (zones, exclusions, item rules, bands, moves and the operator''s words), held as a document so no warehouse''s thresholds or BIN names live in code. [master · Reference & rules | tier 3 support | waiting]';

COMMENT ON TABLE "company_os"."replenishment_runs" IS 'One row is: one replenishment run — one uploaded stock export turned into restocking jobs by one profile, from draft through sent to the scanners and closed. [transactional · Client delivery & work | tier 3 support | waiting]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."replenishment_jobs" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."replenishment_jobs" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."replenishment_profiles" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."replenishment_profiles" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."replenishment_runs" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."replenishment_runs" TO "service_role";
