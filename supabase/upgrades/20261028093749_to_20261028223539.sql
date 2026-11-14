-- fork-schema-upgrade: 20261028093749 -> 20261028223539
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261028093749 (then 02-rebrand.sql) to version 20261028223539.
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

ALTER TABLE "company_os"."reimbursement_payments"
  DROP CONSTRAINT "reimbursement_payments_paid_shape";

ALTER TABLE "company_os"."reimbursement_payments"
  ADD CONSTRAINT "reimbursement_payments_paid_shape" CHECK ((((status = 'paid'::text) AND (paid_at IS NOT NULL) AND (paid_vnd IS
    NOT NULL)) OR ((status = 'to_pay'::text) AND (paid_at IS NULL))));
