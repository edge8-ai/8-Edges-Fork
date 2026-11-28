-- fork-schema-upgrade: 20261113045113 -> 20261113051900
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261113045113 (then 02-rebrand.sql) to version 20261113051900.
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

SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION company_os.client_review_release_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare
  client_manager_sent integer;
  member_awaits_correction integer;
begin
  if old.released_at is not null or new.released_at is null then
    return new;
  end if;
  perform 1
    from company_os.performance_reviews p
   where p.review_cycle_id = new.cycle_id
     and p.team_member_id = new.team_member_id
     and p.review_type = 'client'
     and p.rater_kind in ('self', 'client_manager')
     for update;
  select
      count(*) filter (where p.rater_kind = 'client_manager'
                         and p.status in ('submitted', 'finalized', 'acknowledged')),
      count(*) filter (where p.rater_kind = 'self'
                         and coalesce(p.metadata ? 'reopened_at', false)
                         and p.status not in ('submitted', 'finalized', 'acknowledged'))
    into client_manager_sent, member_awaits_correction
    from company_os.performance_reviews p
   where p.review_cycle_id = new.cycle_id
     and p.team_member_id = new.team_member_id
     and p.review_type = 'client'
     and p.rater_kind in ('self', 'client_manager');
  if client_manager_sent = 0 or member_awaits_correction > 0 then
    raise exception 'This review has a part that is not sent, so it cannot be released.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION company_os.client_review_reopen_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare
  released timestamptz;
begin
  if new.review_type is distinct from 'client'
     or coalesce(new.rater_kind, '') not in ('self', 'client_manager')
     or old.status not in ('submitted', 'finalized', 'acknowledged')
     or new.status in ('submitted', 'finalized', 'acknowledged') then
    return new;
  end if;
  select m.released_at into released
    from company_os.review_cycle_members m
   where m.cycle_id = new.review_cycle_id
     and m.team_member_id = new.team_member_id
     for update;
  if released is not null then
    raise exception 'This review is released, so its parts stay sent.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$function$;

CREATE TRIGGER client_review_reopen_guard
  BEFORE UPDATE OF status ON company_os.performance_reviews
  FOR EACH ROW
  EXECUTE FUNCTION company_os.client_review_reopen_guard();

CREATE TRIGGER client_review_release_guard
  BEFORE UPDATE OF released_at ON company_os.review_cycle_members
  FOR EACH ROW
  EXECUTE FUNCTION company_os.client_review_release_guard();

GRANT EXECUTE ON FUNCTION "company_os"."client_review_release_guard"() TO "postgres";

GRANT EXECUTE ON FUNCTION "company_os"."client_review_reopen_guard"() TO "postgres";
