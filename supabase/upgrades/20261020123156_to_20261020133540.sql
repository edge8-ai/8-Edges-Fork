-- HAZARD: adds "company_os"."quest_party"."head_id" as NOT NULL with no default, which fails on a table with rows
-- This upgrade can lose or refuse data. scripts/fork-upgrade.sh applies it only with --allow-data-loss; read it first.
--
-- fork-schema-upgrade: 20261020123156 -> 20261020133540
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261020123156 (then 02-rebrand.sql) to version 20261020133540.
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

ALTER TABLE "company_os"."quest_party"
  DROP CONSTRAINT "quest_party_handed_back_shape";

ALTER TABLE "company_os"."quest_party"
  DROP CONSTRAINT "quest_party_one_per_person";

CREATE TABLE "company_os"."quest_heads" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "quest_id"   uuid                     NOT NULL,
  "position"   smallint                 NOT NULL,
  "ask"        text                     NOT NULL,
  "closes_at"  timestamp with time zone NOT NULL,
  "closed_at"  timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quest_heads_ask_check" CHECK ((length(TRIM(BOTH FROM ask)) > 0)),
  CONSTRAINT "quest_heads_id_quest" UNIQUE (id, quest_id),
  CONSTRAINT "quest_heads_one_per_position" UNIQUE (quest_id, "position"),
  CONSTRAINT "quest_heads_pkey" PRIMARY KEY (id),
  CONSTRAINT "quest_heads_position_check" CHECK (("position" >= 1))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."quest_heads" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."quest_heads"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."quest_party"
  ADD COLUMN "head_id" uuid NOT NULL;

ALTER TABLE "company_os"."quest_party"
  ADD COLUMN "reminded_at" timestamp WITH time zone;

ALTER TABLE "company_os"."quests"
  ADD COLUMN "required" boolean NOT NULL DEFAULT false;

ALTER TABLE "company_os"."quest_heads"
  ADD CONSTRAINT "quest_heads_quest_id_fkey" FOREIGN KEY (quest_id) REFERENCES company_os.quests(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."quest_party"
  ADD CONSTRAINT "quest_party_handed_back_shape" CHECK (((standing <> 'handed_back'::text) OR (handed_back_at IS NOT NULL)));

ALTER TABLE "company_os"."quest_party"
  ADD CONSTRAINT "quest_party_head_fkey" FOREIGN KEY (head_id, quest_id) REFERENCES company_os.quest_heads(id, quest_id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE "company_os"."quest_party"
  ADD CONSTRAINT "quest_party_one_per_person_per_head" UNIQUE (head_id, person_id);

CREATE INDEX quest_heads_open_closes_idx ON company_os.quest_heads USING btree (closes_at)
  WHERE (closed_at IS NULL);

CREATE TRIGGER quest_heads_updated_at
  BEFORE UPDATE ON company_os.quest_heads
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."quest_heads"."ask" IS 'What this head asks for, in the Giver''s words.';

COMMENT ON COLUMN "company_os"."quest_heads"."closed_at" IS 'When the head closed, by its due time or early by the Giver; null while open.';

COMMENT ON COLUMN "company_os"."quest_heads"."closes_at" IS 'The head''s due time (a date and a time of day, shown in Saigon): after it the head stops expecting Turn-ins, and a Turn-in is late and still counts.';

COMMENT ON COLUMN "company_os"."quest_heads"."created_at" IS 'When the head was written, with its quest.';

COMMENT ON COLUMN "company_os"."quest_heads"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."quest_heads"."position" IS 'The head''s place in the order the Giver wrote them, from 1; once per quest.';

COMMENT ON COLUMN "company_os"."quest_heads"."quest_id" IS 'The Bounty (quests) this head belongs to.';

COMMENT ON COLUMN "company_os"."quest_heads"."updated_at" IS 'When the row last changed.';

COMMENT ON COLUMN "company_os"."quest_party"."head_id" IS 'The head (quest_heads) of the same quest this row answers; once per person per head.';

COMMENT ON COLUMN "company_os"."quest_party"."late" IS 'True when the Turn-in arrived after the head''s due time or after the head closed; it counts in full.';

COMMENT ON COLUMN "company_os"."quest_party"."missed_at" IS 'When the head closed with this person still out (on an optional Bounty, only after they accepted); kept as history when a late Turn-in lifts the Missed.';

COMMENT ON COLUMN "company_os"."quest_party"."note" IS 'The person''s note to the Giver when they handed the head back; may be empty when they declined an optional Bounty.';

COMMENT ON COLUMN "company_os"."quest_party"."person_id" IS 'The person (company_os.people) on the quest; once per head. Only staff are ever called.';

COMMENT ON COLUMN "company_os"."quest_party"."reminded_at" IS 'When the person was reminded, two hours before the head''s due time, while still out; written once per person per head by the reminder routine, so a reminder never doubles. Null until then.';

COMMENT ON COLUMN "company_os"."quests"."closing_date" IS 'The Saigon calendar date of the latest head''s due time, kept so readers of the first expand find a value; each head''s own due time is quest_heads.closes_at. Always set on a Bounty; null for an open-ended Raid or Beacon. To be dropped by a later contract migration.';

COMMENT ON COLUMN "company_os"."quests"."required" IS 'True when the Giver was a manager or an admin when they summoned it: being called is the commitment, there is no Accept move and no hand-back, and everyone still out at a head''s due time is Missed. False on an optional Bounty, where a person opts in by accepting and only an accepted person still out is Missed.';

COMMENT ON TABLE "company_os"."quest_heads" IS 'One row is: one head of a Bounty — one ask with its own due time. A Bounty has one or more; two or more make a Hydra. A Standing and a Turn-in are per head. [transactional · People operations | tier 3 support | active]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."quest_heads" TO "postgres";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."quest_heads" TO "service_role";
