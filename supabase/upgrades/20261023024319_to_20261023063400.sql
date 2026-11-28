-- fork-schema-upgrade: 20261023024319 -> 20261023063400
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261023024319 (then 02-rebrand.sql) to version 20261023063400.
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

ALTER TABLE "company_os"."agreements"
  DROP CONSTRAINT "agreements_fee_only_for_clients";

ALTER TABLE "company_os"."agreements"
  ADD CONSTRAINT "agreements_fee_only_for_clients" CHECK (
CASE type
    WHEN 'client'::text THEN (((fee_amount_cents IS NOT NULL) AND (fee_currency IS NOT NULL) AND (fee_description IS
      NOT NULL)) OR ((fee_amount_cents IS NULL) AND (fee_currency IS NULL) AND (fee_description IS NULL)))
    ELSE ((fee_amount_cents IS NULL) AND (fee_currency IS NULL) AND (fee_description IS NULL))
END);
