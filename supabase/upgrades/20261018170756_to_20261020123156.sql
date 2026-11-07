-- fork-schema-upgrade: 20261018170756 -> 20261020123156
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261018170756 (then 02-rebrand.sql) to version 20261020123156.
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

CREATE TABLE "company_os"."quest_party" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "quest_id"       uuid                     NOT NULL,
  "person_id"      uuid                     NOT NULL,
  "standing"       text                     NOT NULL DEFAULT 'called'::text,
  "called_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "accepted_at"    timestamp with time zone,
  "turned_in_at"   timestamp with time zone,
  "late"           boolean                  NOT NULL DEFAULT false,
  "handed_back_at" timestamp with time zone,
  "missed_at"      timestamp with time zone,
  "turn_in_text"   text,
  "turn_in_url"    text,
  "note"           text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quest_party_handed_back_shape" CHECK (((standing <> 'handed_back'::text) OR ((handed_back_at IS
    NOT NULL) AND (length(TRIM(BOTH FROM COALESCE(note, ''::text))) > 0)))),
  CONSTRAINT "quest_party_id_quest_standing" UNIQUE (id, quest_id, standing),
  CONSTRAINT "quest_party_late_only_when_turned_in" CHECK (((NOT late) OR (standing = 'turned_in'::text))),
  CONSTRAINT "quest_party_missed_shape" CHECK (((standing <> 'missed'::text) OR (missed_at IS NOT NULL))),
  CONSTRAINT "quest_party_one_per_person" UNIQUE (quest_id, person_id),
  CONSTRAINT "quest_party_pkey" PRIMARY KEY (id),
  CONSTRAINT "quest_party_standing_check" CHECK ((standing = ANY (ARRAY['called'::text, 'accepted'::text, 'turned_in'::text, 'handed_back'::text, 'missed'::text]))),
  CONSTRAINT "quest_party_turned_in_shape" CHECK (((standing <> 'turned_in'::text) OR (turned_in_at IS NOT NULL)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."quest_party" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."quest_party"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."quest_reactions" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "quest_id"       uuid                     NOT NULL,
  "party_id"       uuid                     NOT NULL,
  "party_standing" text                     NOT NULL DEFAULT 'turned_in'::text,
  "line"           text                     NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quest_reactions_line_check" CHECK ((length(TRIM(BOTH FROM line)) > 0)),
  CONSTRAINT "quest_reactions_one_per_turn_in" UNIQUE (party_id),
  CONSTRAINT "quest_reactions_party_standing_check" CHECK ((party_standing = 'turned_in'::text)),
  CONSTRAINT "quest_reactions_pkey" PRIMARY KEY (id)
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."quest_reactions" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."quest_reactions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."quests" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "kind"         text                     NOT NULL,
  "title"        text                     NOT NULL,
  "ask"          text                     NOT NULL DEFAULT ''::text,
  "giver_id"     uuid                     NOT NULL,
  "closing_date" date,
  "learning"     boolean                  NOT NULL DEFAULT false,
  "state"        text                     NOT NULL DEFAULT 'open'::text,
  "closed_at"    timestamp with time zone,
  "withdrawn_at" timestamp with time zone,
  "host_id"      uuid,
  "training_id"  uuid,
  "lit_url"      text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quests_bounty_has_closing_date" CHECK (((kind <> 'bounty'::text) OR (closing_date IS NOT NULL))),
  CONSTRAINT "quests_closed_shape" CHECK (((state = 'closed'::text) = (closed_at IS NOT NULL))),
  CONSTRAINT "quests_host_only_on_raid" CHECK (((host_id IS NULL) OR (kind = 'raid'::text))),
  CONSTRAINT "quests_kind_check" CHECK ((kind = ANY (ARRAY['bounty'::text, 'raid'::text, 'beacon'::text]))),
  CONSTRAINT "quests_lit_url_only_on_beacon" CHECK (((lit_url IS NULL) OR (kind = 'beacon'::text))),
  CONSTRAINT "quests_pkey" PRIMARY KEY (id),
  CONSTRAINT "quests_state_check" CHECK ((state = ANY (ARRAY['open'::text, 'closed'::text, 'withdrawn'::text]))),
  CONSTRAINT "quests_title_check" CHECK ((length(TRIM(BOTH FROM title)) > 0)),
  CONSTRAINT "quests_training_only_on_raid" CHECK (((training_id IS NULL) OR (kind = 'raid'::text))),
  CONSTRAINT "quests_withdrawn_shape" CHECK (((state = 'withdrawn'::text) = (withdrawn_at IS NOT NULL)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."quests" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."quests"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."quest_party"
  ADD CONSTRAINT "quest_party_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."quest_reactions"
  ADD CONSTRAINT "quest_reactions_on_a_turn_in" FOREIGN KEY (party_id, quest_id, party_standing) REFERENCES company_os.quest_party(id, quest_id, standing) ON UPDATE RESTRICT
    ON DELETE RESTRICT;

ALTER TABLE "company_os"."quests"
  ADD CONSTRAINT "quests_giver_id_fkey" FOREIGN KEY (giver_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."quests"
  ADD CONSTRAINT "quests_host_id_fkey" FOREIGN KEY (host_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."quest_party"
  ADD CONSTRAINT "quest_party_quest_id_fkey" FOREIGN KEY (quest_id) REFERENCES company_os.quests(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."quest_reactions"
  ADD CONSTRAINT "quest_reactions_quest_id_fkey" FOREIGN KEY (quest_id) REFERENCES company_os.quests(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."quests"
  ADD CONSTRAINT "quests_training_id_fkey" FOREIGN KEY (training_id) REFERENCES company_os.trainings(id) ON DELETE RESTRICT;

CREATE INDEX quest_party_person_idx ON company_os.quest_party USING btree (person_id, standing);

CREATE INDEX quest_party_quest_standing_idx ON company_os.quest_party USING btree (quest_id, standing);

CREATE INDEX quest_reactions_quest_idx ON company_os.quest_reactions USING btree (quest_id);

CREATE INDEX quests_giver_idx ON company_os.quests USING btree (giver_id);

CREATE INDEX quests_host_idx ON company_os.quests USING btree (host_id)
  WHERE (host_id IS NOT NULL);

CREATE INDEX quests_state_closing_idx ON company_os.quests USING btree (state, closing_date);

CREATE INDEX quests_training_idx ON company_os.quests USING btree (training_id)
  WHERE (training_id IS NOT NULL);

CREATE TRIGGER quest_party_updated_at
  BEFORE UPDATE ON company_os.quest_party
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

CREATE TRIGGER quests_updated_at
  BEFORE UPDATE ON company_os.quests
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."quest_party"."accepted_at" IS 'When the person accepted; a Turn-in without an accept sets it too, because turning in counts as accepting.';

COMMENT ON COLUMN "company_os"."quest_party"."called_at" IS 'When the person was called, or joined.';

COMMENT ON COLUMN "company_os"."quest_party"."created_at" IS 'When the row was inserted.';

COMMENT ON COLUMN "company_os"."quest_party"."handed_back_at" IS 'When the person handed the quest back.';

COMMENT ON COLUMN "company_os"."quest_party"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."quest_party"."late" IS 'True when the Turn-in arrived after the closing date or after the quest closed; it counts in full.';

COMMENT ON COLUMN "company_os"."quest_party"."missed_at" IS 'When the quest closed with this person still out; kept as history when a late Turn-in lifts the Missed.';

COMMENT ON COLUMN "company_os"."quest_party"."note" IS 'The person''s note to the Giver when they handed the quest back; required on a hand-back.';

COMMENT ON COLUMN "company_os"."quest_party"."person_id" IS 'The person (company_os.people) on the quest; once per quest. Only staff are ever called.';

COMMENT ON COLUMN "company_os"."quest_party"."quest_id" IS 'The quest (quests).';

COMMENT ON COLUMN "company_os"."quest_party"."standing" IS 'Where this person is on this quest, written only by the quests entity''s code, never by a trigger. Valid values: [called, accepted, turned_in, handed_back, missed]';

COMMENT ON COLUMN "company_os"."quest_party"."turn_in_text" IS 'The Turn-in''s text, in the person''s words.';

COMMENT ON COLUMN "company_os"."quest_party"."turn_in_url" IS 'The Turn-in''s link, where the quest wants one (a Beacon always does).';

COMMENT ON COLUMN "company_os"."quest_party"."turned_in_at" IS 'When the person turned in.';

COMMENT ON COLUMN "company_os"."quest_party"."updated_at" IS 'When the row last changed.';

COMMENT ON COLUMN "company_os"."quest_reactions"."created_at" IS 'When the Giver reacted.';

COMMENT ON COLUMN "company_os"."quest_reactions"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."quest_reactions"."line" IS 'The Giver''s line, as the person who turned in reads it.';

COMMENT ON COLUMN "company_os"."quest_reactions"."party_id" IS 'The party row (quest_party) whose Turn-in the Giver reacted to; once per row.';

COMMENT ON COLUMN "company_os"."quest_reactions"."party_standing" IS 'Always turned_in: part of the foreign key onto quest_party (id, quest_id, standing), so a Reaction exists only on a Turn-in and that row cannot leave turned_in while it stands. Valid values: [turned_in]';

COMMENT ON COLUMN "company_os"."quest_reactions"."quest_id" IS 'The quest (quests); half of the foreign key onto the party row, so a Reaction is on a Turn-in of the same quest.';

COMMENT ON COLUMN "company_os"."quests"."ask" IS 'What the Giver asks for, in their words; empty when the title says it all.';

COMMENT ON COLUMN "company_os"."quests"."closed_at" IS 'When the quest closed; set exactly when state is closed.';

COMMENT ON COLUMN "company_os"."quests"."closing_date" IS 'The Saigon calendar date after which the quest stops expecting Turn-ins; a Turn-in after it is late and still counts. Always set on a Bounty; null for an open-ended Raid or Beacon.';

COMMENT ON COLUMN "company_os"."quests"."created_at" IS 'When the quest was posted.';

COMMENT ON COLUMN "company_os"."quests"."giver_id" IS 'The Giver (company_os.people) who posted the quest.';

COMMENT ON COLUMN "company_os"."quests"."host_id" IS 'A Raid''s Host (company_os.people), who teaches it; null on a cold campfire waiting for one, and on every Bounty and Beacon.';

COMMENT ON COLUMN "company_os"."quests"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."quests"."kind" IS 'Which kind of quest it is. Valid values: [bounty, raid, beacon]';

COMMENT ON COLUMN "company_os"."quests"."learning" IS 'True on a learning bounty: its Turn-ins become Discoveries in the Lore unless their author keeps them out.';

COMMENT ON COLUMN "company_os"."quests"."lit_url" IS 'A Beacon''s link to the public thing, once lit; null otherwise.';

COMMENT ON COLUMN "company_os"."quests"."state" IS 'Open until it closes (by its date or early by the Giver) or the Giver withdraws it; a withdrawn quest has no Missed. Valid values: [open, closed, withdrawn]';

COMMENT ON COLUMN "company_os"."quests"."title" IS 'What the quest is called, as its party sees it.';

COMMENT ON COLUMN "company_os"."quests"."training_id" IS 'A Raid''s session (trainings), created through Training''s door when the campfire is lit; null otherwise.';

COMMENT ON COLUMN "company_os"."quests"."updated_at" IS 'When the row last changed.';

COMMENT ON COLUMN "company_os"."quests"."withdrawn_at" IS 'When the Giver withdrew the quest; set exactly when state is withdrawn.';

COMMENT ON TABLE "company_os"."quest_party" IS 'One row is: one person on one quest, with their Standing and their Turn-in. A Missed is read only by the person, their managers, admins and a Giver who is a manager, one quest at a time (ADR 0020). [transactional · People operations | tier 3 support | active]';

COMMENT ON TABLE "company_os"."quest_reactions" IS 'One row is: the Giver''s Reaction to one Turn-in — a line that makes the hit a critical. At most one per Turn-in. [transactional · People operations | tier 3 support | active]';

COMMENT ON TABLE "company_os"."quests" IS 'One row is: one quest — a Bounty (an ask with a closing date), a Raid (a session to teach the team) or a Beacon (a learning carried outside Edge8) — posted by its Giver. [transactional · People operations | tier 3 support | active]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."quest_party" TO "postgres";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."quest_party" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."quest_reactions" TO "postgres";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."quest_reactions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."quests" TO "postgres";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."quests" TO "service_role";
