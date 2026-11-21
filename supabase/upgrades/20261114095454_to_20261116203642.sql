-- fork-schema-upgrade: 20261114095454 -> 20261116203642
-- Written by hand, not by scripts/gen-fork-schema.mjs: the generator's delta
-- step needs two throwaway Docker databases, which the authoring machine could
-- not run under load. It is the generator's own fallback ("fix the delta by
-- hand, prove it"), and CI's fork job proves it: it replays the baseline plus
-- every delta and requires a pg_dump equal to a fresh install of 01-schema.sql
-- version 20261116203642. It takes a database built from version
-- 20261114095454 (then 02-rebrand.sql) to that version. Apply with
-- scripts/fork-upgrade.sh, which runs it in one transaction and records the
-- new version; README Step 3b.
--
-- What changed upstream (migration 20261115120000_eight_edges_installs): one
-- new table, company_os.eight_edges_installs, with its comments, checks,
-- primary key, two partial indexes, four foreign keys to people and companies,
-- row level security switched on and its grants. No existing table, column,
-- row or grant changes. The statements are the fresh install's own, copied
-- from 01-schema.sql version 20261116203642, plus the one REVOKE every
-- generated delta adds after a CREATE TABLE: an upgraded database already has
-- the schema's default privileges, which a fresh install applies only after
-- its tables exist.
--

CREATE TABLE "company_os"."eight_edges_installs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'downloaded'::"text" NOT NULL,
    "downloaded_on" "date" NOT NULL,
    "installed_on" "date",
    "source" "text" NOT NULL,
    "evidence_url" "text",
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "uuid",
    CONSTRAINT "eight_edges_installs_dates_in_order" CHECK ((("installed_on" IS NULL) OR ("installed_on" >= "downloaded_on"))),
    CONSTRAINT "eight_edges_installs_evidence_url_check" CHECK ((("evidence_url" IS NULL) OR ("evidence_url" ~* '^https?://'::"text"))),
    CONSTRAINT "eight_edges_installs_installed_has_date" CHECK ((("status" <> 'installed'::"text") OR ("installed_on" IS NOT NULL))),
    CONSTRAINT "eight_edges_installs_source_check" CHECK (("source" = ANY (ARRAY['website'::"text", 'github'::"text", 'workshop'::"text", 'event'::"text", 'referral'::"text", 'outreach'::"text", 'call'::"text", 'other'::"text"]))),
    CONSTRAINT "eight_edges_installs_status_check" CHECK (("status" = ANY (ARRAY['downloaded'::"text", 'installed'::"text", 'abandoned'::"text"])))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."eight_edges_installs" FROM "chatbot_reader", "chatbot_writer";

COMMENT ON TABLE "company_os"."eight_edges_installs" IS 'One row is: one company''s copy of the Eight Edges open source system, from the day they got the code to running on their own accounts. [transactional · Pipeline activity | tier 3 support | active]';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."id" IS 'Synthetic primary key.';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."company_id" IS 'The company that got the code (companies.id).';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."person_id" IS 'The founder or contact who got it (people.id).';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."status" IS 'Where it stands: downloaded (they have the code), installed (it runs on their own database and hosting for their own business; counts toward the installs key result), abandoned (dropped). Workshop practice sites are never recorded. Valid values: [downloaded, installed, abandoned]';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."downloaded_on" IS 'The day they got the code from us.';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."installed_on" IS 'The day it first ran on their own accounts; required when status is installed.';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."source" IS 'How they came to it. Valid values: [website, github, workshop, event, referral, outreach, call, other]';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."evidence_url" IS 'Their running site or repository: the evidence that an install is real.';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."notes" IS 'Free text from whoever recorded it.';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."recorded_by" IS 'The team member who recorded it (people.id).';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."created_at" IS 'Insert timestamp.';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."updated_at" IS 'Last change, set by the writer.';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."archived_at" IS 'When it was taken off the list (a duplicate or a mistake); null while live. Archived rather than deleted.';
COMMENT ON COLUMN "company_os"."eight_edges_installs"."archived_by" IS 'The person who archived it.';

ALTER TABLE ONLY "company_os"."eight_edges_installs"
    ADD CONSTRAINT "eight_edges_installs_pkey" PRIMARY KEY ("id");

CREATE INDEX "eight_edges_installs_company_idx" ON "company_os"."eight_edges_installs" USING "btree" ("company_id") WHERE ("archived_at" IS NULL);
CREATE INDEX "eight_edges_installs_list_idx" ON "company_os"."eight_edges_installs" USING "btree" ("downloaded_on" DESC, "created_at" DESC) WHERE ("archived_at" IS NULL);

ALTER TABLE ONLY "company_os"."eight_edges_installs"
    ADD CONSTRAINT "eight_edges_installs_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "company_os"."eight_edges_installs"
    ADD CONSTRAINT "eight_edges_installs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "company_os"."eight_edges_installs"
    ADD CONSTRAINT "eight_edges_installs_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "company_os"."eight_edges_installs"
    ADD CONSTRAINT "eight_edges_installs_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;

ALTER TABLE "company_os"."eight_edges_installs" ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."eight_edges_installs" TO "service_role";
GRANT SELECT ON TABLE "company_os"."eight_edges_installs" TO "supabase_read_only_user";
