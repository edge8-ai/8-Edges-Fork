-- fork-schema-upgrade: 20261020133540 -> 20261021041122
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261020133540 (then 02-rebrand.sql) to version 20261021041122.
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

CREATE TABLE "company_os"."ladder_display" (
  "person_id"        uuid                     NOT NULL,
  "wear_learn_share" boolean                  NOT NULL DEFAULT false,
  "wear_builder"     boolean                  NOT NULL DEFAULT false,
  "banner"           text                     NOT NULL DEFAULT 'meadow'::text,
  "title_badge"      text,
  "shown_stats"      text[]                   NOT NULL DEFAULT '{}'::text[],
  "display_case"     text[]                   NOT NULL DEFAULT '{}'::text[],
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ladder_display_banner_check" CHECK ((banner = ANY (ARRAY['meadow'::text, 'dragon'::text, 'hydra'::text, 'lighthouse'::text, 'photo'::text]))),
  CONSTRAINT "ladder_display_case_holds_five" CHECK ((cardinality(display_case) <= 5)),
  CONSTRAINT "ladder_display_pkey" PRIMARY KEY (person_id)
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."ladder_display" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."ladder_display"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."ladder_positions" (
  "person_id"     uuid                     NOT NULL,
  "ladder"        text                     NOT NULL,
  "points"        numeric(12,1)            NOT NULL DEFAULT 0,
  "tier"          text                     NOT NULL,
  "division"      smallint,
  "stars"         smallint,
  "immortal_band" smallint,
  "counts"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "computed_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ladder_positions_band_shape" CHECK (((immortal_band IS NOT NULL) = ((ladder = 'builder'::text) AND (tier = 'immortal'::text)))),
  CONSTRAINT "ladder_positions_division_check" CHECK (((division >= 1) AND (division <= 4))),
  CONSTRAINT "ladder_positions_division_shape" CHECK (((division IS NOT NULL) = ((ladder = 'learn_share'::text) AND (tier <> 'sovereign'::text)))),
  CONSTRAINT "ladder_positions_immortal_band_check" CHECK (((immortal_band >= 1) AND (immortal_band <= 3))),
  CONSTRAINT "ladder_positions_ladder_check" CHECK ((ladder = ANY (ARRAY['learn_share'::text, 'builder'::text]))),
  CONSTRAINT "ladder_positions_pkey" PRIMARY KEY (person_id, ladder),
  CONSTRAINT "ladder_positions_points_check" CHECK ((points >= (0)::numeric)),
  CONSTRAINT "ladder_positions_stars_check" CHECK (((stars >= 1) AND (stars <= 5))),
  CONSTRAINT "ladder_positions_stars_shape" CHECK (((stars IS NOT NULL) = ((ladder = 'builder'::text) AND (tier <> 'immortal'::text)))),
  CONSTRAINT "ladder_positions_tier_of_ladder"
    CHECK
    ((((ladder = 'learn_share'::text) AND (tier = ANY (ARRAY['iron'::text, 'bronze'::text, 'silver'::text, 'gold'::text, 'platinum'::text, 'emerald'::text, 'diamond'::text,
    'master'::text,
    'grandmaster'::text,
    'challenger'::text,
    'sovereign'::text]))) OR
    ((ladder = 'builder'::text) AND (tier = ANY (ARRAY['herald'::text, 'guardian'::text, 'crusader'::text, 'archon'::text, 'legend'::text, 'ancient'::text, 'divine'::text,
    'immortal'::text])))))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."ladder_positions" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."ladder_positions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."ladder_unlocks" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "person_id"     uuid                     NOT NULL,
  "kind"          text                     NOT NULL,
  "ladder"        text                     NOT NULL,
  "key"           text                     NOT NULL,
  "unlocked_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "witness_table" text,
  "witness_id"    uuid,
  "source"        text                     NOT NULL,
  "shown_at"      timestamp with time zone,
  CONSTRAINT "ladder_unlocks_key_check" CHECK ((length(TRIM(BOTH FROM key)) > 0)),
  CONSTRAINT "ladder_unlocks_kind_check" CHECK ((kind = ANY (ARRAY['tier'::text, 'badge'::text]))),
  CONSTRAINT "ladder_unlocks_ladder_check" CHECK ((ladder = ANY (ARRAY['learn_share'::text, 'builder'::text, 'both'::text]))),
  CONSTRAINT "ladder_unlocks_once" UNIQUE (person_id, kind, key),
  CONSTRAINT "ladder_unlocks_pkey" PRIMARY KEY (id),
  CONSTRAINT "ladder_unlocks_source_check" CHECK ((source = ANY (ARRAY['event'::text, 'replay'::text, 'launch'::text]))),
  CONSTRAINT "ladder_unlocks_tier_has_no_witness" CHECK (((kind <> 'tier'::text) OR ((witness_table IS NULL) AND (witness_id IS NULL)))),
  CONSTRAINT "ladder_unlocks_tier_on_one_ladder" CHECK (((kind <> 'tier'::text) OR (ladder <> 'both'::text))),
  CONSTRAINT "ladder_unlocks_witness_shape" CHECK (((witness_table IS NULL) = (witness_id IS NULL)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."ladder_unlocks" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."ladder_unlocks"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."ladder_display"
  ADD CONSTRAINT "ladder_display_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."ladder_positions"
  ADD CONSTRAINT "ladder_positions_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."ladder_unlocks"
  ADD CONSTRAINT "ladder_unlocks_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

CREATE INDEX ladder_unlocks_person_idx ON company_os.ladder_unlocks USING btree (person_id, kind, ladder);

CREATE TRIGGER ladder_display_updated_at
  BEFORE UPDATE ON company_os.ladder_display
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."ladder_display"."banner" IS 'The scene at the top of their profile: a place from the Quests world, or their own photo. Valid values: [meadow, dragon, hydra, lighthouse, photo]';

COMMENT ON COLUMN "company_os"."ladder_display"."display_case" IS 'Up to five found badge ids, in order; the first three are the postcard''s stickers.';

COMMENT ON COLUMN "company_os"."ladder_display"."person_id" IS 'The person (company_os.people) whose choices these are; one row each.';

COMMENT ON COLUMN "company_os"."ladder_display"."shown_stats" IS 'The stats they switched on for teammates (hits, sparks, fires, beacons, cards, humanTokens); empty until they choose.';

COMMENT ON COLUMN "company_os"."ladder_display"."title_badge" IS 'The id of the found badge whose name they wear as a title under their name; null for no title.';

COMMENT ON COLUMN "company_os"."ladder_display"."updated_at" IS 'When the row last changed.';

COMMENT ON COLUMN "company_os"."ladder_display"."wear_builder" IS 'True when the person wears their Builder medal on their profile plaque and postcard; off until they choose.';

COMMENT ON COLUMN "company_os"."ladder_display"."wear_learn_share" IS 'True when the person wears their Learn & Share tier as a border round their face; off until they choose.';

COMMENT ON COLUMN "company_os"."ladder_positions"."computed_at" IS 'When this row was last recomputed.';

COMMENT ON COLUMN "company_os"."ladder_positions"."counts" IS 'The act counts behind the points: on Learn & Share hits (Turn-ins by head), sparks, fires (Raids hosted that someone came to) and beacons; on Builder cards (leaf cards shipped) and humanTokens.';

COMMENT ON COLUMN "company_os"."ladder_positions"."division" IS 'On Learn & Share, the Division within the tier, 4 (its start) up to 1 (three quarters of the way to the next); null at Sovereign and on Builder.';

COMMENT ON COLUMN "company_os"."ladder_positions"."immortal_band" IS 'On Builder at Immortal, which of the three medals the points reach (1 at 60,000, 2 at 120,000, 3 at 250,000); null everywhere else. From outside, all three are simply Immortal.';

COMMENT ON COLUMN "company_os"."ladder_positions"."ladder" IS 'Which ladder. Valid values: [learn_share, builder]';

COMMENT ON COLUMN "company_os"."ladder_positions"."person_id" IS 'The person (company_os.people) whose place this is.';

COMMENT ON COLUMN "company_os"."ladder_positions"."points" IS 'The person''s Points on this ladder, to one decimal place (a 0.05 card is 0.5 points); thresholds compare the exact value, pages show it rounded down. Recomputed from source rows, never incremented.';

COMMENT ON COLUMN "company_os"."ladder_positions"."stars" IS 'On Builder, the Stars within the medal, 1 (its start) up to 5; null at Immortal and on Learn & Share.';

COMMENT ON COLUMN "company_os"."ladder_positions"."tier" IS 'The Tier the points reach on this ladder. The Tier the person holds is their highest tier unlock in ladder_unlocks, which never goes down. Valid values: [iron, bronze, silver, gold, platinum, emerald, diamond, master, grandmaster, challenger, sovereign, herald, guardian, crusader, archon, legend, ancient, divine, immortal]';

COMMENT ON COLUMN "company_os"."ladder_unlocks"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."ladder_unlocks"."key" IS 'The tier (iron … sovereign, herald … immortal) or the badge id from the catalogue; once per person and kind.';

COMMENT ON COLUMN "company_os"."ladder_unlocks"."kind" IS 'A Tier reached, or a Badge found. Valid values: [tier, badge]';

COMMENT ON COLUMN "company_os"."ladder_unlocks"."ladder" IS 'Which ladder the tier is on, or which ladder''s acts a badge reads; both for a badge that reads either. Valid values: [learn_share, builder, both]';

COMMENT ON COLUMN "company_os"."ladder_unlocks"."person_id" IS 'The person (company_os.people) who reached the tier or found the badge.';

COMMENT ON COLUMN "company_os"."ladder_unlocks"."shown_at" IS 'When the person saw the rank-up or the badge drop; null while it waits. The only column ever updated.';

COMMENT ON COLUMN "company_os"."ladder_unlocks"."source" IS 'Which recompute wrote it: an event subscriber, the nightly replay, or the launch backfill, which marks everything it credits as shown. Valid values: [event, replay, launch]';

COMMENT ON COLUMN "company_os"."ladder_unlocks"."unlocked_at" IS 'When the recompute that found it ran.';

COMMENT ON COLUMN "company_os"."ladder_unlocks"."witness_id" IS 'For a badge, the id of the witness row; null for a tier.';

COMMENT ON COLUMN "company_os"."ladder_unlocks"."witness_table" IS 'For a badge, the table of the row that proves it (quest_party, ideas, tasks, training_attendance); null for a tier.';

COMMENT ON TABLE "company_os"."ladder_display" IS 'One row is: one person''s own choices about what teammates may see of their ladders and badges — which tiers they wear, their banner, their title, the stats they switched on and their display case. Everything starts hidden; only the person edits it. [master · People operations | tier 3 support | active]';

COMMENT ON TABLE "company_os"."ladder_positions" IS 'One row is: one person''s place on one ladder — their Points, the Tier the points reach, their Division or Stars, and the act counts behind them. A cache rebuilt from source rows; read by the person alone through the ladders door (ADR 0021). [transactional · People operations | tier 3 support | active]';

COMMENT ON TABLE "company_os"."ladder_unlocks" IS 'One row is: one Tier reached or one Badge found by one person, written once and never taken away. The highest tier unlock on a ladder is the tier the person holds, so a corrected source row lowers points but never a tier (ADR 0021, "only up"). Updated only to mark it shown; never deleted. [transactional · People operations | tier 3 support | active]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."ladder_display" TO "postgres";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."ladder_display" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."ladder_positions" TO "postgres";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."ladder_positions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."ladder_unlocks" TO "postgres";

GRANT UPDATE ("shown_at") ON TABLE "company_os"."ladder_unlocks" TO "service_role";

GRANT INSERT, SELECT ON TABLE "company_os"."ladder_unlocks" TO "service_role";
