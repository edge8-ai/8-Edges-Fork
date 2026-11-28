-- fork-schema-upgrade: 20261118090500 -> 20261123052029
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261118090500 (then 02-rebrand.sql) to version 20261123052029.
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

ALTER TABLE "company_os"."marketing_content"
  ADD COLUMN "live_check_error" text;

ALTER TABLE "company_os"."marketing_content"
  ADD COLUMN "pre_publish" jsonb;

ALTER TABLE "company_os"."training_plans"
  ADD COLUMN "company_id" uuid;

ALTER TABLE "company_os"."marketing_content"
  ADD CONSTRAINT "marketing_content_pre_publish_object" CHECK (((pre_publish IS NULL) OR (jsonb_typeof(pre_publish) = 'object'::text)));

ALTER TABLE "company_os"."training_plans"
  ADD CONSTRAINT "training_plans_company_id_fkey" FOREIGN KEY (company_id) REFERENCES company_os.companies(id) ON DELETE SET NULL;

CREATE INDEX training_plans_company_id_idx ON company_os.training_plans USING btree (company_id);

COMMENT ON COLUMN "company_os"."marketing_content"."live_check_error" IS 'Why the blog post''s last publish is not live on its site, as the calendar shows it (answered 404 at 15:32); null once the live URL answers 200 or for a post never published. Written by publishBlogAsset and the blog-live-check routine.';

COMMENT ON COLUMN "company_os"."marketing_content"."posted_url" IS 'The live URL after publishing: recorded by hand for social posts, stamped with the blog URL by the publish flow once that URL answers 200. A published blog without one is not live yet.';

COMMENT ON COLUMN "company_os"."marketing_content"."pre_publish" IS 'The post''s status, publish_date and published_at from before a publish whose live URL has not yet answered 200, so the blog-live-check routine can put them back if it never does; null otherwise.';

COMMENT ON COLUMN "company_os"."training_plans"."company_id" IS 'The client the plan is run for, set by its organiser: the plan, its published lesson summaries and its sent weekly recaps show in that company''s portal. Null for a plan run for no client, which shows in no portal.';
