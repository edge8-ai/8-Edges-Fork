-- fork-schema-upgrade: 20261117084129 -> 20261117093250
-- Written by hand, not by scripts/gen-fork-schema.mjs: the generator's delta
-- step needs two throwaway Docker databases, which the authoring machine could
-- not run. It is the generator's own fallback ("fix the delta by hand, prove
-- it"), and CI's fork job proves it: it replays the baseline plus every delta
-- and requires a pg_dump equal to a fresh install of 01-schema.sql version
-- 20261117093250. It takes a database built from version 20261117084129 (then
-- 02-rebrand.sql) to that version. Apply with scripts/fork-upgrade.sh, which
-- runs it in one transaction and records the new version; README Step 3b.
--
-- What changed upstream (CR.5 phase A, PR #2696): migrations
-- 20261117141713 (companies.time_zone and working_day_start, two checks),
-- 20261117141727 (six review_cycles columns for the due date and the member
-- email plan, five checks) and 20261117141739 (the new table
-- company_os.review_cycle_manager_links, its access rules and trigger, and a
-- backfill of one link per client manager of each open cycle). No existing
-- column, row or grant changes. The statements below are the three
-- migrations' own, in order; each is idempotent.

-- ===== 20261117141713_companies_time_zone_and_working_day_start.sql =====

-- CR.5.1 (2026-11-17): a client company's own clock. Spec: CR.5 "Client
-- reviews: Mai chooses when members are emailed" (Workboard card CR.5).
--
-- The person running a client review can schedule the member email for a
-- day, and a blank time means "the start of the client's working day, in the
-- client's time zone". Members staffed with a client also work that client's
-- hours, so the time zone is a fact about the client, not about reviews, and
-- it sits on the company row beside the other client facts.
--
-- Expand only. Two nullable columns and one check; no row is written and no
-- existing column, constraint, index or trigger changes. Every row keeps
-- null in both, which reads as "not set yet": the code that writes and reads
-- them ships after this is applied.
--
-- What it adds to company_os.companies:
-- * time_zone text: an IANA zone name such as America/New_York. The app
--   validates the name (Intl refuses an unknown one); the database only
--   refuses a blank string, because a check against pg_timezone_names would
--   need a function and the two lists can drift.
-- * working_day_start time: the local wall-clock time the client's working
--   day starts, such as 09:00. A start without a zone means nothing, so the
--   check refuses it.
--
-- Writes that pass through it: every insert and update of companies is held
-- to the one new check, which only a write naming the new columns can fail.
-- The table's one trigger (set_companies_updated_at, handle_updated_at) is
-- unchanged and reads no column by name.
--
-- Idempotent: add column if not exists, and the check is dropped before it is
-- added, so a replay is harmless.

alter table company_os.companies
  add column if not exists time_zone text,
  add column if not exists working_day_start time;

alter table company_os.companies drop constraint if exists companies_time_zone_not_blank;
alter table company_os.companies
  add constraint companies_time_zone_not_blank
  check (time_zone is null or length(btrim(time_zone)) > 0);

alter table company_os.companies drop constraint if exists companies_working_day_start_needs_zone;
alter table company_os.companies
  add constraint companies_working_day_start_needs_zone
  check (working_day_start is null or time_zone is not null);

-- Comments (docs/db/data-dictionary.md is the source).
comment on column company_os.companies.time_zone is 'The client''s time zone, an IANA name such as America/New_York, set by hand on the company page; null until set. Client-facing timing (a scheduled member email, a staffed member''s working day) reads it.';
comment on column company_os.companies.working_day_start is 'The local time the client''s working day starts, such as 09:00, in time_zone; null until set. A start needs a time zone.';

-- ===== 20261117141727_review_cycles_due_date_and_member_email_plan.sql =====

-- CR.5.2 (2026-11-17): a client review cycle's due date and its member email
-- plan. Spec: CR.5 "Client reviews: Mai chooses when members are emailed"
-- (Workboard card CR.5).
--
-- Opening a cycle will stop emailing the members. The person running it then
-- chooses, from the cycle overview, how the members are emailed: now, at a
-- scheduled moment, or "I'll email them myself", in which case the app sends
-- nothing and she marks her own email sent. A cycle may carry a due date; when
-- it does, members who have not sent their part get one reminder before it.
-- The plan is one per cycle and is read with the cycle on every overview, so
-- it lives on the cycle row, beside the skip-manager's link columns.
--
-- Expand only. Six nullable columns and five checks; no row is written and no
-- existing column, constraint, index or trigger changes. Every cycle,
-- including the one open today, keeps null in all six, which reads as "no due
-- date, plan not chosen yet". The code that writes and reads them ships after
-- this is applied.
--
-- What it adds to company_os.review_cycles:
-- * due_date date: the day the parts are due, a calendar day in the client's
--   time zone; null for no due date.
-- * member_email_mode text: now, scheduled or manual; null until chosen.
-- * member_email_scheduled_at timestamptz: the moment a scheduled email goes,
--   resolved when the plan is saved; set exactly when the mode is scheduled.
-- * member_email_sent_at timestamptz: when the app sent the member email; only
--   for now and scheduled, because in manual mode the app sends nothing.
-- * member_email_manual_marked_sent_at timestamptz: when the person running
--   the cycle marked her own email sent; only in manual mode.
-- * member_reminder_sent_at timestamptz: when the due-date reminder went; only
--   with a due date, and never in manual mode, which has no reminder.
--
-- The checks compare against a null mode with coalesce, because a check whose
-- expression is null passes: "sent_at is null or mode in (...)" would let a
-- sent time stand beside a null mode.
--
-- Writes that pass through it: every insert and update of review_cycles is
-- held to the five checks, which only a write naming the new columns can
-- fail. Today's writers (open-cycle.ts insert, skip-link.ts updates,
-- owner-actions.ts close) name none of them. The table's one trigger
-- (review_cycles_updated_at, handle_updated_at) is unchanged and reads no
-- column by name.
--
-- Idempotent: add column if not exists, and each check is dropped before it
-- is added, so a replay is harmless.

alter table company_os.review_cycles
  add column if not exists due_date date,
  add column if not exists member_email_mode text,
  add column if not exists member_email_scheduled_at timestamptz,
  add column if not exists member_email_sent_at timestamptz,
  add column if not exists member_email_manual_marked_sent_at timestamptz,
  add column if not exists member_reminder_sent_at timestamptz;

alter table company_os.review_cycles drop constraint if exists review_cycles_member_email_mode_known;
alter table company_os.review_cycles
  add constraint review_cycles_member_email_mode_known
  check (member_email_mode is null or member_email_mode in ('now', 'scheduled', 'manual'));

alter table company_os.review_cycles drop constraint if exists review_cycles_member_email_scheduled_whole;
alter table company_os.review_cycles
  add constraint review_cycles_member_email_scheduled_whole
  check (coalesce(member_email_mode = 'scheduled', false) = (member_email_scheduled_at is not null));

alter table company_os.review_cycles drop constraint if exists review_cycles_member_email_sent_by_app;
alter table company_os.review_cycles
  add constraint review_cycles_member_email_sent_by_app
  check (member_email_sent_at is null or coalesce(member_email_mode in ('now', 'scheduled'), false));

alter table company_os.review_cycles drop constraint if exists review_cycles_member_email_marked_when_manual;
alter table company_os.review_cycles
  add constraint review_cycles_member_email_marked_when_manual
  check (member_email_manual_marked_sent_at is null or coalesce(member_email_mode = 'manual', false));

alter table company_os.review_cycles drop constraint if exists review_cycles_member_reminder_needs_due_date;
alter table company_os.review_cycles
  add constraint review_cycles_member_reminder_needs_due_date
  check (member_reminder_sent_at is null or (due_date is not null and coalesce(member_email_mode in ('now', 'scheduled'), false)));

-- Comments (docs/db/data-dictionary.md is the source).
comment on column company_os.review_cycles.due_date is 'The day the cycle''s parts are due, a calendar day in the client''s time zone; null for no due date. Only a cycle with a due date sends the reminder.';
comment on column company_os.review_cycles.member_email_mode is 'How the members are emailed about the cycle, chosen by the person running it; null until chosen. now and scheduled are sent by the app; manual means she emails them herself and the app sends nothing. Valid values: [now, scheduled, manual]';
comment on column company_os.review_cycles.member_email_scheduled_at is 'The moment a scheduled member email goes, resolved from the chosen day and time (or the client''s working-day start) when the plan is saved. Set exactly when the mode is scheduled.';
comment on column company_os.review_cycles.member_email_sent_at is 'When the app sent the member email; null until sent. Only for the now and scheduled modes; the scheduler sends a plan only while this is null.';
comment on column company_os.review_cycles.member_email_manual_marked_sent_at is 'When the person running the cycle marked her own member email sent; only in manual mode, null until marked.';
comment on column company_os.review_cycles.member_reminder_sent_at is 'When the due-date reminder went to the members who had not sent their part; null until sent. Needs a due date, and never set in manual mode, which has no reminder.';

-- ===== 20261117141739_review_cycle_manager_links.sql =====

-- CR.5.6 (2026-11-17): one link per client manager per review cycle. Spec:
-- CR.5 "Client reviews: Mai chooses when members are emailed, one link per
-- client manager" (Workboard card CR.5).
--
-- Today a client manager gets one link per member they rate: the secret is
-- the access_token on that member's client_manager part in
-- performance_reviews. A manager who rates five members is sent five links.
-- From CR.5.6 the person running the cycle sends each manager one link, which
-- opens a page listing all their members, modelled on the skip-manager's one
-- link (review_cycles.skip_manager_token and its copied and cancelled times).
-- A manager has one link for many members, so the secret cannot live on a
-- member or part row: it gets a table of its own.
--
-- Expand, plus a small backfill. A new table, its indexes, access rules and
-- house trigger, and one row per client manager of each cycle open now.
-- No existing table, column, constraint, index, trigger or row changes. The
-- per-part tokens keep working exactly as today: nothing reads the new table
-- until the CR.5.6 code ships, and that code, not this migration, rotates a
-- manager's part tokens when their link is cancelled or reissued.
--
-- What it adds:
-- * company_os.review_cycle_manager_links: one row per (cycle, client
--   manager). access_token is the link's secret, unique across the table;
--   copied_at and cancelled_at follow the skip-manager's link (cancel keeps
--   the token and sets cancelled_at; reissue replaces the token and clears
--   both).
-- * Access: row level security on and no policy, so only the service role
--   reads it, as for review_cycles and performance_reviews. It holds a
--   credential, so it is closed to the assistants' SQL roles too: the
--   schema's default privileges grant them every new table, and the literal
--   revoke below takes it back (check:credential-tables reads it).
-- * The house updated_at trigger (company_os.handle_updated_at, which only
--   sets NEW.updated_at).
-- * Backfill: one row per distinct client manager of the members still in a
--   cycle that is open now (closed_at null, withdrawn_at null), counting only
--   members who have a client_manager part. Each row gets a fresh token, 32
--   random bytes in URL-safe base64 without padding, the same shape as the
--   app's newLinkToken (entities/org/lib/client-reviews/open-cycle.ts). On
--   17 Nov 2026 that is one cycle and two managers. on conflict do nothing,
--   so a replay adds nothing and never replaces a token already issued.
--
-- Writes that pass through it: none that happen today. No trigger or rule is
-- attached to an existing table, and the new table's foreign keys only check
-- that its own rows name a real cycle and a real person.
--
-- Idempotent: create table if not exists, create index if not exists, drop
-- trigger if exists, grants and revokes that can be repeated, and a backfill
-- that skips rows already present.

create table if not exists company_os.review_cycle_manager_links (
  id                        uuid primary key default gen_random_uuid(),
  cycle_id                  uuid not null references company_os.review_cycles (id),
  client_manager_person_id  uuid not null references company_os.people (id),
  access_token              text not null,
  copied_at                 timestamptz,
  cancelled_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint review_cycle_manager_links_one_per_manager unique (cycle_id, client_manager_person_id),
  constraint review_cycle_manager_links_token_uniq unique (access_token),
  constraint review_cycle_manager_links_token_long check (length(access_token) >= 32)
);

create index if not exists review_cycle_manager_links_manager_idx
  on company_os.review_cycle_manager_links (client_manager_person_id);

-- Access: service role only, closed to the assistants.
alter table company_os.review_cycle_manager_links enable row level security;
grant select, insert, update, delete on company_os.review_cycle_manager_links to service_role;
revoke all on company_os.review_cycle_manager_links from public, anon, authenticated;
revoke all on company_os.review_cycle_manager_links from chatbot_reader, chatbot_writer, team_chatbot_reader;

-- House updated_at trigger.
drop trigger if exists review_cycle_manager_links_updated_at on company_os.review_cycle_manager_links;
create trigger review_cycle_manager_links_updated_at
  before update on company_os.review_cycle_manager_links
  for each row execute function company_os.handle_updated_at();

-- Backfill the cycles open now. The token expression is volatile, so it runs
-- once per row of the outer select: every manager gets their own secret.
insert into company_os.review_cycle_manager_links (cycle_id, client_manager_person_id, access_token)
select managers.cycle_id,
       managers.client_manager_person_id,
       translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_')
from (
  select distinct m.cycle_id, m.client_manager_person_id
  from company_os.review_cycle_members m
  join company_os.review_cycles c on c.id = m.cycle_id
  where c.closed_at is null
    and m.withdrawn_at is null
    and m.client_manager_person_id is not null
    and exists (
      select 1 from company_os.performance_reviews pr
      where pr.review_cycle_id = m.cycle_id
        and pr.team_member_id = m.team_member_id
        and pr.rater_kind = 'client_manager'
    )
) managers
on conflict (cycle_id, client_manager_person_id) do nothing;

-- Comments (docs/db/data-dictionary.md is the source).
comment on table company_os.review_cycle_manager_links is 'One row is: one client manager''s personal link for one review cycle, which opens a page listing every member they rate in that cycle and each member''s form. [transactional · People operations | tier 3 support | waiting]';
comment on column company_os.review_cycle_manager_links.id is 'Primary key.';
comment on column company_os.review_cycle_manager_links.cycle_id is 'The cycle (review_cycles.id).';
comment on column company_os.review_cycle_manager_links.client_manager_person_id is 'The client manager the link belongs to, a person at the client (people.id). One row per manager per cycle.';
comment on column company_os.review_cycle_manager_links.access_token is 'The secret in the manager''s personal link, 32 random bytes in URL-safe base64. Unique; replaced when the link is reissued. Never shown to anyone but the person running the cycle.';
comment on column company_os.review_cycle_manager_links.copied_at is 'When the person running the cycle last copied the link to send it herself; null until copied, and cleared when the link is reissued.';
comment on column company_os.review_cycle_manager_links.cancelled_at is 'When the link was cancelled without a replacement; null while it works, and cleared when a new link is issued.';
comment on column company_os.review_cycle_manager_links.created_at is 'When the row was created.';
comment on column company_os.review_cycle_manager_links.updated_at is 'When the row last changed (the house trigger).';

