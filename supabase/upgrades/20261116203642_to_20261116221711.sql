-- fork-schema-upgrade: 20261116203642 -> 20261116221711
-- Written by hand, not by scripts/gen-fork-schema.mjs: the generator's delta
-- step needs two throwaway Docker databases, which the authoring machine could
-- not run. It is the generator's own fallback ("fix the delta by hand, prove
-- it"), and CI's fork job proves it: it replays the baseline plus every delta
-- and requires a pg_dump equal to a fresh install of 01-schema.sql version
-- 20261116221711. It takes a database built from version 20261116203642 (then
-- 02-rebrand.sql) to that version. Apply with scripts/fork-upgrade.sh, which
-- runs it in one transaction and records the new version; README Step 3b.
--
-- What changed upstream (migration 20261117083917_card_sprint_sets_due_date):
-- one trigger function on company_os.tasks and the BEFORE UPDATE trigger that
-- calls it. When an open card moves into a sprint and the same write left its
-- due date alone, an empty date or one before the sprint's first day becomes
-- the sprint's last day, and the earlier date is kept once in
-- metadata.first_due_date. No table, column, row or grant changes. The
-- statements below are the migration's own.

create or replace function company_os.tasks_sprint_sets_due_date()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  first_day date;
  last_day date;
begin
  -- The WHEN clause has already established that the card is moving to a
  -- sprint. Only an open card whose date this write left alone is a candidate.
  if new.status is distinct from 'open' or new.due_date is distinct from old.due_date then
    return new;
  end if;

  select s.starts_on, s.ends_on
    into first_day, last_day
    from company_os.sprints s
   where s.id = new.sprint_id;

  -- No end date, no deadline to give.
  if last_day is null then
    return new;
  end if;

  -- Empty, or before the sprint's first day. A sprint with no first day can
  -- only rescue an empty date, hence the coalesce: a comparison with a null
  -- first day is null, and the card keeps its date.
  if new.due_date is null or coalesce(new.due_date < first_day, false) then
    if not (coalesce(new.metadata, '{}'::jsonb) ? 'first_due_date') then
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
        || jsonb_build_object('first_due_date', old.due_date);
    end if;
    new.due_date := last_day;
  end if;

  return new;
end;
$$;

comment on function company_os.tasks_sprint_sets_due_date() is
  'When an open card or subtask moves to a sprint and the write left its due date alone, a due date that is empty or before the sprint''s first day becomes the sprint''s last day, and the date it replaced is kept once in metadata.first_due_date (JSON null when there was none). A sprint with no end date, a done card and an insert change nothing (W.207.2, ADR 0030).';

drop trigger if exists tasks_sprint_sets_due_date on company_os.tasks;

create trigger tasks_sprint_sets_due_date
  before update on company_os.tasks
  for each row
  when (new.sprint_id is distinct from old.sprint_id and new.sprint_id is not null)
  execute function company_os.tasks_sprint_sets_due_date();
