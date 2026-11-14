-- fork-schema-upgrade: 20261026083926 -> 20261026090859
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261026083926 (then 02-rebrand.sql) to version 20261026090859.
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

CREATE OR REPLACE FUNCTION company_os.tasks_children_follow_card()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
  AS $function$
begin
  -- A subtask has no children (one level), so only a card's change fans out.
  if new.parent_task_id is not null then
    return null;
  end if;

  if new.status in ('done', 'not_doing') then
    update company_os.tasks
       set status = new.status,
           completed_at = case when new.status = 'done' then coalesce(new.completed_at, now()) else null end
     where parent_task_id = new.id
       and status = 'open'
       and archived_at is null;
  elsif new.status = 'open' and old.status = 'not_doing' then
    update company_os.tasks
       set status = 'open',
           completed_at = null
     where parent_task_id = new.id
       and status = 'not_doing'
       and archived_at is null;
  end if;

  -- The children that now share the card's status sit in the card's column.
  -- After a close that is every child closed the same way; after leaving Not
  -- Doing it is every open child, the reopened ones and any added while the
  -- card was set aside. Only a status this function just moved children into
  -- is followed, so reopening a done card leaves its done children where they
  -- are. A child takes only a column on its own board: a card moved to another
  -- board lands there before move-to-board.ts moves its children, and nothing
  -- in the schema stops a task naming another board's column.
  if new.board_column_id is not null
     and (new.status in ('done', 'not_doing') or (new.status = 'open' and old.status = 'not_doing')) then
    update company_os.tasks
       set board_column_id = new.board_column_id
     where parent_task_id = new.id
       and board_id = new.board_id
       and status = new.status
       and archived_at is null
       and board_column_id is distinct from new.board_column_id;
  end if;

  return null;
end;
$function$;

COMMENT ON FUNCTION "company_os"."tasks_children_follow_card"() IS 'When a card''s status changes, its open children (blockers and subtasks) follow: done or not_doing closes them, leaving not_doing reopens the ones that went with it. The children on the card''s board that then share its status also take its column. The rule land-card.ts applies, stated where every writer passes (W.148).';
