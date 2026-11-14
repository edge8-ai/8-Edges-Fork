-- fork-schema-upgrade: 20261021101922 -> 20261023024319
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261021101922 (then 02-rebrand.sql) to version 20261023024319.
-- Apply with scripts/fork-upgrade.sh, which runs it in one transaction and
-- records the new version; README Step 3b. Reference data is not here: a fresh
-- install inserts it once, and an upgraded database keeps its own rows.
--

-- Hand-fixed after generation (2026-10-23): the diff engine emitted quest_hands.topic_key as a
-- later ADD COLUMN, which puts it after created_at; production has it after topic, so it is
-- declared inside CREATE TABLE here. Proved with fork-db.sh the way the generator proves its own.

-- The extensions 00-prereqs.sql creates, for a database built before one joined it.
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

CREATE TABLE "company_os"."quest_hands" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "person_id"  uuid                     NOT NULL,
  "topic"      text                     NOT NULL,
  "topic_key"  text GENERATED ALWAYS AS (regexp_replace(lower(btrim(topic)), '\s+'::text, ' '::text, 'g'::text)) STORED,
  "quest_id"   uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quest_hands_pkey" PRIMARY KEY (id),
  CONSTRAINT "quest_hands_topic_not_blank" CHECK ((btrim(topic) <> ''::text))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."quest_hands" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."quest_hands"
  ENABLE ROW LEVEL SECURITY;


ALTER TABLE "company_os"."quests"
  ADD COLUMN "origin_idea_id" uuid;

ALTER TABLE "company_os"."quests"
  ADD COLUMN "origin_quest_id" uuid;

ALTER TABLE "company_os"."quest_hands"
  ADD CONSTRAINT "quest_hands_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."quest_hands"
  ADD CONSTRAINT "quest_hands_quest_id_fkey" FOREIGN KEY (quest_id) REFERENCES company_os.quests(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."quests"
  ADD CONSTRAINT "quests_origin_idea_id_fkey" FOREIGN KEY (origin_idea_id) REFERENCES company_os.ideas(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."quests"
  ADD CONSTRAINT "quests_origin_quest_id_fkey" FOREIGN KEY (origin_quest_id) REFERENCES company_os.quests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX quest_hands_one_per_wanted_topic_idx ON company_os.quest_hands USING btree (person_id, topic_key)
  WHERE (quest_id IS NULL);

CREATE INDEX quest_hands_quest_idx ON company_os.quest_hands USING btree (quest_id)
  WHERE (quest_id IS NOT NULL);

CREATE INDEX quest_hands_wanted_topic_idx ON company_os.quest_hands USING btree (topic_key)
  WHERE (quest_id IS NULL);

CREATE INDEX quests_origin_idea_idx ON company_os.quests USING btree (origin_idea_id)
  WHERE (origin_idea_id IS NOT NULL);

CREATE INDEX quests_origin_quest_idx ON company_os.quests USING btree (origin_quest_id)
  WHERE (origin_quest_id IS NOT NULL);

COMMENT ON COLUMN "company_os"."quest_hands"."created_at" IS 'When the hand was raised.';

COMMENT ON COLUMN "company_os"."quest_hands"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."quest_hands"."person_id" IS 'Who raised the hand (company_os.people). Seen by nobody but the count; the page never names who wants a topic.';

COMMENT ON COLUMN "company_os"."quest_hands"."quest_id" IS 'The Raid this topic became once someone lit it; null while the topic is still wanted.';

COMMENT ON COLUMN "company_os"."quest_hands"."topic" IS 'The topic as the first hand typed it, trimmed and never blank; the words the cold fire shows.';

COMMENT ON COLUMN "company_os"."quest_hands"."topic_key" IS 'The topic normalised (lower case, trimmed, inner spaces collapsed), generated, so hands on the same topic meet under one key.';

COMMENT ON COLUMN "company_os"."quests"."origin_idea_id" IS 'The learning spark (ideas) a Raid or a Beacon grew from through Evolve; null when it did not.';

COMMENT ON COLUMN "company_os"."quests"."origin_quest_id" IS 'The held Raid a Beacon grew from through Evolve; null when it did not.';

COMMENT ON TABLE "company_os"."quest_hands" IS 'One row is: one raised hand — one person saying they want to learn one topic. Three hands on a topic make a cold fire on the Quests page; the row stays under the Raid once the fire is lit, and a hand taken back is a row deleted.';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."quest_hands" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."quest_hands" TO "service_role";
