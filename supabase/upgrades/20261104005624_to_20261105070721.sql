-- fork-schema-upgrade: 20261104005624 -> 20261105070721
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261104005624 (then 02-rebrand.sql) to version 20261105070721.
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

ALTER TABLE "company_os"."reimbursement_claim_items"
  ADD COLUMN "paid_how" text;

ALTER TABLE "company_os"."reimbursement_claim_items"
  ADD CONSTRAINT "reimbursement_claim_items_paid_how_check" CHECK (((paid_how IS NULL) OR (paid_how = ANY (ARRAY['transfer'::text, 'card'::text, 'cash'::text]))));

COMMENT ON COLUMN "company_os"."reimbursement_claim_items"."paid_how" IS 'How the receipt was paid: transfer, card or cash, as its owner says. Null when nobody has said, which includes every item from before this column.';
