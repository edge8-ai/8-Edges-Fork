-- fork-schema-upgrade: 20261012103903 -> 20261015063527
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261012103903 (then 02-rebrand.sql) to version 20261015063527.
-- Apply with scripts/fork-upgrade.sh, which runs it in one transaction and
-- records the new version; README Step 3b. Reference data is not here: a fresh
-- install inserts it once, and an upgraded database keeps its own rows.
--

ALTER TABLE "company_os"."marketing_campaigns"
  ADD COLUMN "key_result_id" uuid;

ALTER TABLE "company_os"."marketing_campaigns"
  ADD CONSTRAINT "marketing_campaigns_key_result_id_fkey" FOREIGN KEY (key_result_id) REFERENCES company_os.key_results(id) ON DELETE SET NULL;

CREATE INDEX marketing_campaigns_key_result_id_idx ON company_os.marketing_campaigns USING btree (key_result_id);

COMMENT ON COLUMN "company_os"."marketing_campaigns"."key_result_id" IS 'FK to key_results; the company KPI this campaign''s goal moves. Null when the campaign names none.';
