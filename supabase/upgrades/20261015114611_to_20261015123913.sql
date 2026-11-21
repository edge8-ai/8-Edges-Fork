-- HAZARD: makes "company_os"."social_daily_metrics"."brand_id" NOT NULL, which fails on a null
-- HAZARD: makes "company_os"."social_post_metrics"."brand_id" NOT NULL, which fails on a null
-- This upgrade can lose or refuse data. scripts/fork-upgrade.sh applies it only with --allow-data-loss; read it first.
--
-- fork-schema-upgrade: 20261015114611 -> 20261015123913
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261015114611 (then 02-rebrand.sql) to version 20261015123913.
-- Apply with scripts/fork-upgrade.sh, which runs it in one transaction and
-- records the new version; README Step 3b. Reference data is not here: a fresh
-- install inserts it once, and an upgraded database keeps its own rows.
--

ALTER TABLE "company_os"."social_daily_metrics"
  DROP CONSTRAINT "social_daily_metrics_channel_day_key";

ALTER TABLE "company_os"."social_daily_metrics"
  ALTER COLUMN "brand_id" SET NOT NULL;

ALTER TABLE "company_os"."social_post_metrics"
  ALTER COLUMN "brand_id" SET NOT NULL;
