-- fork-schema-upgrade: 20261027184628 -> 20261028084931
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261027184628 (then 02-rebrand.sql) to version 20261028084931.
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

REVOKE ALL ON TABLE "company_os"."coaching_member_notes" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "company_os"."coaching_member_notes" TO "service_role";

REVOKE ALL ON TABLE "company_os"."coaching_noticed" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "company_os"."coaching_noticed" TO "service_role";
