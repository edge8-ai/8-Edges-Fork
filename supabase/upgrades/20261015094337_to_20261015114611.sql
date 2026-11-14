-- fork-schema-upgrade: 20261015094337 -> 20261015114611
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261015094337 (then 02-rebrand.sql) to version 20261015114611.
-- Apply with scripts/fork-upgrade.sh, which runs it in one transaction and
-- records the new version; README Step 3b. Reference data is not here: a fresh
-- install inserts it once, and an upgraded database keeps its own rows.
--

ALTER TABLE "company_os"."social_daily_metrics"
  ADD COLUMN "brand_id" uuid;

ALTER TABLE "company_os"."social_post_metrics"
  ADD COLUMN "brand_id" uuid;

ALTER TABLE "company_os"."social_daily_metrics"
  ADD CONSTRAINT "social_daily_metrics_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES company_os.brands(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."social_post_metrics"
  ADD CONSTRAINT "social_post_metrics_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES company_os.brands(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX social_daily_metrics_brand_channel_day_key ON company_os.social_daily_metrics USING btree (brand_id, channel, day);

CREATE INDEX social_post_metrics_brand_id_idx ON company_os.social_post_metrics USING btree (brand_id);

COMMENT ON COLUMN "company_os"."social_daily_metrics"."brand_id" IS 'FK to brands; the brand whose page the figures are for. Unique with channel and day.';

COMMENT ON COLUMN "company_os"."social_post_metrics"."brand_id" IS 'FK to brands; the brand whose page the post is on.';
