-- fork-schema-upgrade: 20261105094515 -> 20261106011457
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261105094515 (then 02-rebrand.sql) to version 20261106011457.
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

ALTER TABLE "company_os"."reimbursement_advance_events"
  DROP CONSTRAINT "reimbursement_advance_events_move_check";

ALTER TABLE "company_os"."reimbursement_advance_events"
  ADD CONSTRAINT "reimbursement_advance_events_move_check"
    CHECK
    ((move = ANY (ARRAY['create'::text, 'submit'::text, 'withdraw'::text, 'cancel'::text, 'approve'::text, 'send_back'::text, 'reject'::text, 'pay_out'::text, 'close'::text,
    'return_unspent'::text, 'confirm_return'::text, 'reinstate'::text])));
