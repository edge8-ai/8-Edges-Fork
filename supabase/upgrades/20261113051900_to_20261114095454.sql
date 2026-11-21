-- fork-schema-upgrade: 20261113051900 -> 20261114095454
-- Written by hand, not by scripts/gen-fork-schema.mjs: the generator's delta
-- step needs two throwaway Docker databases, which the authoring machine could
-- not run. It is the generator's own fallback ("fix the delta by hand, prove
-- it"), and CI's fork job proves it: it replays the baseline plus every delta
-- and requires a pg_dump equal to a fresh install of 01-schema.sql version
-- 20261114095454. It takes a database built from version 20261113051900 (then
-- 02-rebrand.sql) to that version. Apply with scripts/fork-upgrade.sh, which
-- runs it in one transaction and records the new version; README Step 3b.
--
-- What changed upstream (S.23): people.display_name is written by a trigger as
-- "Given Family (Nickname)" from first_name, last_name and preferred_name, and
-- the column comment says so. No table, column, row or grant changes.
--

-- The extensions 00-prereqs.sql creates, for a database built before one joined it.
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION company_os.people_display_name_from(given text, family text, nickname text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE PARALLEL SAFE
  SET search_path TO 'pg_catalog'
  AS $$
  select case
    when nullif(btrim(given), '') is null or nullif(btrim(family), '') is null then null
    else btrim(given) || ' ' || btrim(family) ||
      case
        when nullif(btrim(nickname), '') is null
          or btrim(nickname) ~ '\s'
          or company_os.search_fold(btrim(nickname)) = company_os.search_fold(btrim(given))
        then ''
        else ' (' || btrim(nickname) || ')'
      end
  end
$$;

COMMENT ON FUNCTION company_os.people_display_name_from(given text, family text, nickname text) IS 'S.23: the shown-name template "Given Family (Nickname)". The bracket is dropped for a blank, multi-word or repeated nickname. Null when the given or family name is blank.';

CREATE OR REPLACE FUNCTION company_os.people_compose_display_name()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
  AS $$
declare
  composed text;
begin
  if tg_op = 'UPDATE' then
    if new.first_name is not distinct from old.first_name
       and new.last_name is not distinct from old.last_name
       and new.preferred_name is not distinct from old.preferred_name then
      return new;
    end if;
    if nullif(btrim(old.display_name), '') is not null
       and old.display_name is distinct from
           company_os.people_display_name_from(old.first_name, old.last_name, old.preferred_name) then
      return new;
    end if;
  end if;
  composed := company_os.people_display_name_from(new.first_name, new.last_name, new.preferred_name);
  if composed is not null then
    new.display_name := composed;
  end if;
  return new;
end
$$;

COMMENT ON FUNCTION company_os.people_compose_display_name() IS 'S.23: writes people.display_name from people_display_name_from() on insert, and on update only when a name part changed and the old display_name was not set by hand.';

DROP TRIGGER IF EXISTS people_compose_display_name ON company_os.people;
CREATE TRIGGER people_compose_display_name
  BEFORE INSERT OR UPDATE OF first_name, last_name, preferred_name ON company_os.people
  FOR EACH ROW EXECUTE FUNCTION company_os.people_compose_display_name();

COMMENT ON COLUMN company_os.people.display_name IS 'The name every screen shows: "Given Family (Nickname)", e.g. "Lan Trần (Kit)". Kept in step with first_name, last_name and preferred_name by the people_compose_display_name trigger (S.23). A value the parts cannot produce was set by hand and is left alone.';
