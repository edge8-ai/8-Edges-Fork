-- fork-schema-upgrade: 20261015063527 -> 20261015094337
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261015063527 (then 02-rebrand.sql) to version 20261015094337.
-- Apply with scripts/fork-upgrade.sh, which runs it in one transaction and
-- records the new version; README Step 3b. Reference data is not here: a fresh
-- install inserts it once, and an upgraded database keeps its own rows.
--

CREATE TABLE "company_os"."social_daily_metrics" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "channel"            text                     NOT NULL,
  "day"                date                     NOT NULL,
  "impressions"        integer                  NOT NULL DEFAULT 0,
  "unique_impressions" integer                  NOT NULL DEFAULT 0,
  "clicks"             integer                  NOT NULL DEFAULT 0,
  "reactions"          integer                  NOT NULL DEFAULT 0,
  "comments"           integer                  NOT NULL DEFAULT 0,
  "reposts"            integer                  NOT NULL DEFAULT 0,
  "synced_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "synced_by"          uuid,
  CONSTRAINT "social_daily_metrics_channel_check" CHECK ((channel = ANY (ARRAY['linkedin'::text, 'facebook'::text]))),
  CONSTRAINT "social_daily_metrics_channel_day_key" UNIQUE (channel, day),
  CONSTRAINT "social_daily_metrics_pkey" PRIMARY KEY (id)
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."social_daily_metrics" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."social_daily_metrics"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."social_post_metrics" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "channel"            text                     NOT NULL,
  "external_id"        text                     NOT NULL,
  "url"                text,
  "kind"               text                     NOT NULL DEFAULT 'post'::text,
  "body"               text                     NOT NULL DEFAULT ''::text,
  "posted_on"          date,
  "impressions"        integer                  NOT NULL DEFAULT 0,
  "unique_impressions" integer,
  "clicks"             integer                  NOT NULL DEFAULT 0,
  "reactions"          integer                  NOT NULL DEFAULT 0,
  "comments"           integer                  NOT NULL DEFAULT 0,
  "reposts"            integer                  NOT NULL DEFAULT 0,
  "as_of"              date                     NOT NULL,
  "content_id"         uuid,
  "synced_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "synced_by"          uuid,
  CONSTRAINT "social_post_metrics_channel_check" CHECK ((channel = ANY (ARRAY['linkedin'::text, 'facebook'::text]))),
  CONSTRAINT "social_post_metrics_channel_external_id_key" UNIQUE (channel, external_id),
  CONSTRAINT "social_post_metrics_kind_check" CHECK ((kind = ANY (ARRAY['post'::text, 'job'::text]))),
  CONSTRAINT "social_post_metrics_pkey" PRIMARY KEY (id)
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."social_post_metrics" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."social_post_metrics"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."social_daily_metrics"
  ADD CONSTRAINT "social_daily_metrics_synced_by_fkey" FOREIGN KEY (synced_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."social_post_metrics"
  ADD CONSTRAINT "social_post_metrics_content_id_fkey" FOREIGN KEY (content_id) REFERENCES company_os.marketing_content(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."social_post_metrics"
  ADD CONSTRAINT "social_post_metrics_synced_by_fkey" FOREIGN KEY (synced_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

CREATE INDEX social_daily_metrics_day_idx ON company_os.social_daily_metrics USING btree (day DESC);

CREATE INDEX social_post_metrics_content_id_idx ON company_os.social_post_metrics USING btree (content_id);

CREATE INDEX social_post_metrics_posted_on_idx ON company_os.social_post_metrics USING btree (posted_on DESC);

COMMENT ON COLUMN "company_os"."social_daily_metrics"."channel" IS 'The platform the figures come from. Valid values: [linkedin, facebook]';

COMMENT ON COLUMN "company_os"."social_daily_metrics"."clicks" IS 'Clicks on the page''s posts that day, organic and sponsored together.';

COMMENT ON COLUMN "company_os"."social_daily_metrics"."comments" IS 'Comments on the page''s posts that day.';

COMMENT ON COLUMN "company_os"."social_daily_metrics"."day" IS 'The day the figures cover, in UTC as the platform reports it. Unique per channel; a re-import overwrites it.';

COMMENT ON COLUMN "company_os"."social_daily_metrics"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."social_daily_metrics"."impressions" IS 'Times the page''s posts were shown that day, organic and sponsored together.';

COMMENT ON COLUMN "company_os"."social_daily_metrics"."reactions" IS 'Reactions (likes and the rest) on the page''s posts that day.';

COMMENT ON COLUMN "company_os"."social_daily_metrics"."reposts" IS 'Reposts or shares of the page''s posts that day.';

COMMENT ON COLUMN "company_os"."social_daily_metrics"."synced_at" IS 'When this row was last written by an import.';

COMMENT ON COLUMN "company_os"."social_daily_metrics"."synced_by" IS 'FK to people; the person whose import last wrote this row.';

COMMENT ON COLUMN "company_os"."social_daily_metrics"."unique_impressions" IS 'Distinct members who saw the page''s posts that day (LinkedIn reports organic only).';

COMMENT ON COLUMN "company_os"."social_post_metrics"."as_of" IS 'The last day the export these figures came from covers. An import replaces the figures only from an export at least this recent.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."body" IS 'The post text as the export gives it, used to match the post to marketing_content.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."channel" IS 'The platform the post is on. Valid values: [linkedin, facebook]';

COMMENT ON COLUMN "company_os"."social_post_metrics"."clicks" IS 'Clicks on the post as of as_of.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."comments" IS 'Comments on the post as of as_of.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."content_id" IS 'FK to marketing_content; our planned post this one is. Null until matched, and always null for job posts.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."external_id" IS 'The platform''s id for the post (the LinkedIn activity number, the Facebook post id). Unique per channel.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."impressions" IS 'Times the post was shown (LinkedIn impressions, Facebook views) as of as_of.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."kind" IS 'Whether this is our content or a job post the platform publishes from a listing; job posts are never matched to marketing_content. Valid values: [post, job]';

COMMENT ON COLUMN "company_os"."social_post_metrics"."posted_on" IS 'The day the post was published, as the platform reports it.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."reactions" IS 'Reactions on the post as of as_of.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."reposts" IS 'Reposts or shares of the post as of as_of.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."synced_at" IS 'When this row was last written by an import.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."synced_by" IS 'FK to people; the person whose import last wrote this row.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."unique_impressions" IS 'Distinct people the post reached (Facebook reach) as of as_of. Null when the export does not report it.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."url" IS 'The post''s link on the platform, as the export gives it.';

COMMENT ON TABLE "company_os"."social_daily_metrics" IS 'One channel''s page-level social analytics for one day (LinkedIn or Facebook), mirrored from the platform''s export.';

COMMENT ON TABLE "company_os"."social_post_metrics" IS 'One post on LinkedIn or Facebook with its latest analytics, mirrored from the platform''s export.';

GRANT SELECT ON TABLE "company_os"."social_daily_metrics" TO "chatbot_reader";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."social_daily_metrics" TO "chatbot_writer";

REVOKE ALL ON TABLE "company_os"."social_daily_metrics" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."social_daily_metrics" TO "postgres";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."social_daily_metrics" TO "service_role";

GRANT SELECT ON TABLE "company_os"."social_post_metrics" TO "chatbot_reader";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."social_post_metrics" TO "chatbot_writer";

REVOKE ALL ON TABLE "company_os"."social_post_metrics" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."social_post_metrics" TO "postgres";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."social_post_metrics" TO "service_role";
