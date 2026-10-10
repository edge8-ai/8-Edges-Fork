--
-- PostgreSQL database dump
--
-- fork-overlay baseline. This file is the ONLY database source the fork gets:
-- the upstream repo's supabase/migrations/ directory is excluded from the sync,
-- so a column added by a migration and never written back here simply does not
-- exist in a fork deployment, while the app code synced beside it still asks
-- PostgREST for it.
--
-- Upstream maintenance: when a migration lands, re-dump (or hand-apply it) here
-- and move the line below to that migration's filename. The upstream guard
-- .github/scripts/fork-overlay-schema.test.mjs fails the build until it names
-- the newest file in supabase/migrations/, and separately checks that every
-- column the synced loaders SELECT exists in this dump.
--
-- migrations-through: 20261010160001_drop_duplicate_meetings_source_index.sql
--
-- 20261010120000 (TH.1.8) is hand-applied at the end of this file:
-- company_os.kudos, because team is portable, and the inbox kind
-- kudos.received on both kind checks. The revoke from the chat agents' roles is
-- left out, as those roles are Edge8's own.
--
-- 20261010050000 (the chat write role loses chain-owned columns) is
-- hand-applied at the end of this file, skipped where the role does not exist.
--
-- 20261009235500 (Z.7) is hand-applied at the end of this file:
-- company_os.notification_queue, because it is a kernel table and the kernel
-- ships to the fork. The revoke from the chat agents' roles is left out, as
-- those roles are Edge8's own.
--
-- 20261009220000 (Z.11) is hand-applied at the end of this file:
-- company_os.inquiry_triage and company_os.find_or_create_company_by_host,
-- because crm is portable. The revoke from the chat agents' roles is left
-- out, as those roles are Edge8's own.
--
-- 20261009230000 (Z.13) is hand-applied at the end of this file:
-- company_os.meeting_followups, the chain's columns and once-index on
-- company_os.meeting_action_items, the one-card-per-action-item index on
-- company_os.tasks, and the meeting-actions routine's switch set to shadow,
-- because crm and boards are portable and a fork's chain must start in shadow
-- too. The revoke from the chat agents' roles is left out, as those roles are
-- Edge8's own.
--
-- 20261009210000 (Z.10) is hand-applied at the end of this file:
-- company_os.proposal_drafts, because crm is portable and ships in the
-- minimal deployment, and the Revenue approver role holding
-- crm.proposal-approve. The revoke from the chat agents' roles is left out,
-- as those roles are Edge8's own.
--
-- 20261009190000 (Z.12) is hand-applied at the end of this file:
-- company_os.client_status_reports, because client-programs is portable and
-- ships in the minimal deployment, and the access rows for
-- client-programs.status and client-programs.status-release (Admin's pairs
-- and the Client status approver role). The revoke from the chat agents'
-- roles is left out, as those roles are Edge8's own.
--
-- 20261008230000 (AE.3) is data only: grants, role pairs and one role row,
-- no schema change, so nothing is applied here for it.
--
-- 20261008210000 (reimbursements: ai_flags may say not_a_red_invoice) is
-- hand-applied at the end of this file.
--
-- 20261008190000 (ID.2.13: inbox kind idea.shipped) is hand-applied at the end
-- of this file.
--
-- 20261008150000 (chatbot_writer loses writes on legal_entities) is left out on
-- purpose: the chat agents' roles are Edge8's own and the fork has none.
--
-- 20261008120000 (legal entity registration details and their permissions) is
-- hand-applied at the end of this file.
--
-- 20261008090000 (reimbursements retention markers and guards, audit 'read') is
-- hand-applied at the end of this file.
--
-- 20261008010000 (reimbursements: inbox kinds claim.decided and claim.paid, and
-- access rows part 2) is hand-applied at the end of this file.
--
-- 20261007230000 (ID.2.5) is hand-applied at the end of this file:
-- company_os.idea_reactions and idea_builds are added, because ideas is
-- portable, and notifications.kind gains idea.reacted, idea.built and
-- idea.picked_up. The revoke from the chat agents' roles is left out.
--
-- 20261007200000 (reimbursements access rows, part 1) is hand-applied at the end
-- of this file: the empty Employer role and reimbursements.mine for team members
-- and contractors.
--
-- 20261007120000 (RB schema) is hand-applied: the seven reimbursement_* tables,
-- their four guard triggers and approvals.approver_permission are added at the
-- end of this file, because reimbursements is portable. The reimbursement-receipts
-- bucket is in 00-prereqs.sql. The revoke from the chat agents' roles is left out.
--
-- 20261006170000 (AC.4) is hand-applied: the default holders of every declared
-- permission are inserted at the end of this file, after the access tables, so a
-- fresh install's roles hold what each kind of person reaches upstream. A row for
-- a permission an entity the fork lacks would declare grants nothing.
--
-- 20261006150000 (AC.2) is hand-applied: company_os.access_roles,
-- access_role_permissions and access_role_assignments are added at the end of
-- this file with the ten seeded roles, because they are kernel tables and ship
-- in every deployment (ADR 0013). The revoke from the chat agents' roles is left
-- out, as those roles are Edge8's own.
--
-- 20261005140000 (W.154) is hand-applied: company_os.task_attachments is added
-- at the end of this file, because boards is portable and ships in the minimal
-- deployment, which is where a card's deliverables live. The card-attachments
-- bucket is in 00-prereqs.sql. The revoke from the chat agents' roles is left
-- out, as those roles are Edge8's own.
--
-- 20260929090000 (capability_pulse_responses, capability_pulse_sessions) is
-- hand-applied at the end of this file beside the payroll tables.
--
-- 20261003160000 (edge8_ddl_guard, company_os.ddl_log, ddl_proof_abort) is left out on purpose:
-- it refuses schema changes that no declared migration carries, which is a
-- rule for the upstream production database and its apply script, not for a
-- fork an operator sets up by hand with psql. A fork that wants it can apply the
-- upstream file deliberately.
--
-- 20261003140000 is hand-applied: company_os.survey_assignments is added at the
-- end of this file beside the payroll tables. 20261003140100 seeds one survey and
-- its assignments; it is data, not schema, so nothing of it belongs here.
--
-- 20260928160000 (R.24) is hand-applied: company_os.deals_derive_usd() and its
-- deals_derive_usd trigger sit beside the other deals functions and triggers.
--
-- 20260928180000 (O.1) is hand-applied: company_os.payroll_runs_sensitive and
-- payroll_lines_sensitive are added at the end of this file, because finance is
-- portable, and team_members.permissions gains `payroll`.
--
-- 20260919110000 adds company_os.library_documents and the `library` Storage
-- bucket. Neither is in this dump on purpose: the library is an internal
-- entity, excluded from the mirror wholesale, so a fork has no loader that
-- selects from that table and nothing to create it for.
--
--
-- 20260925100000 (S.7) is hand-applied: company_os.capacity_roles and
-- company_os.capacity_commitments are added, because org is portable and the
-- fork ships the capacity screen that reads them, and the dropped
-- company_os.availability_blocks is removed.
--
-- 20260925120000 (S.3) is hand-applied: company_os.notifications,
-- notification_reads and notification_prefs are added, because the
-- notifications entity is portable and the fork ships the inbox that reads
-- them. Their keys are written inline, since the inbox's upserts resolve their
-- conflicts on them.
--
-- 20260925130000 (S.5) is hand-applied: company_os.approvals is added, because
-- it is a kernel table and the kernel ships to the fork. Its backfill inserts
-- nothing a fresh fork would have. Foreign keys are at the end of this file.
--
-- 20260928130000 (Z.6) is hand-applied: company_os.ai_calls is added beside
-- routine_runs, because it is a kernel table, the kernel's model gateway
-- writes it on every call, and the kernel ships to the fork. The revoke from
-- the chat agents' roles is left out, as those roles are Edge8's own.
--

\restrict cqXJ73dt0Qr7HbA24BUFRRY9ENvzwozpbfMEdaDocYuX3QVAAp8Ordaa34J7kWf

-- Dumped from database version 15.8
-- Dumped by pg_dump version 18.6 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: company_os; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA "company_os";  -- created by 00-prereqs.sql


--
-- Name: htt; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA "htt";  -- created by 00-prereqs.sql


--
-- Name: assign_equipment("uuid", "uuid", "date", "text", "text", "text"); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."assign_equipment"("p_equipment_id" "uuid", "p_person_id" "uuid", "p_assigned_at" "date" DEFAULT CURRENT_DATE, "p_condition_out" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text", "p_actor" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'company_os', 'extensions', 'pg_catalog'
    AS $$
declare
  v_open_id uuid;
  v_open_person uuid;
  v_open_start date;
  v_new_id uuid;
begin
  select id, person_id, assigned_at
    into v_open_id, v_open_person, v_open_start
    from company_os.equipment_assignments
   where equipment_id = p_equipment_id and returned_at is null
   for update;

  if v_open_person = p_person_id then
    return v_open_id;
  end if;

  if v_open_id is not null then
    update company_os.equipment_assignments
       set returned_at = greatest(p_assigned_at, v_open_start)
     where id = v_open_id;
  end if;

  insert into company_os.equipment_assignments
    (equipment_id, person_id, assigned_at, condition_out, note, created_by)
  values
    (p_equipment_id, p_person_id, p_assigned_at, p_condition_out, p_note, p_actor)
  returning id into v_new_id;

  update company_os.equipment
     set current_holder_id = p_person_id,
         status = 'in_use',
         updated_at = now()
   where id = p_equipment_id;

  return v_new_id;
end;
$$;


--
-- Name: campaign_recipient_stats("uuid"); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."campaign_recipient_stats"("p_campaign_id" "uuid") RETURNS TABLE("status" "text", "n" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'company_os', 'public', 'extensions'
    AS $$
  select r.status, count(*) as n
  from company_os.email_campaign_recipients r
  where r.campaign_id = p_campaign_id
  group by r.status;
$$;


--
-- Name: claim_campaign_batch("uuid", integer, interval); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."claim_campaign_batch"("p_campaign_id" "uuid", "p_limit" integer, "p_reclaim_after" interval DEFAULT '00:30:00'::interval) RETURNS TABLE("id" "uuid", "person_id" "uuid", "email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'company_os', 'public', 'extensions'
    AS $$
begin
  update company_os.email_campaign_recipients r
  set status = 'pending', claimed_at = null
  where r.campaign_id = p_campaign_id
    and r.status = 'claimed'
    and r.claimed_at < now() - p_reclaim_after;

  return query
  update company_os.email_campaign_recipients r
  set status = 'claimed', claimed_at = now()
  where r.id in (
    select r2.id
    from company_os.email_campaign_recipients r2
    where r2.campaign_id = p_campaign_id
      and r2.status = 'pending'
      and (r2.send_after is null or r2.send_after <= now())
    order by r2.send_after nulls first, r2.created_at, r2.id
    limit p_limit
    for update skip locked
  )
  returning r.id, r.person_id, r.email;
end;
$$;


--
-- Name: claim_tick("text", "text", "text", "text", integer); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."claim_tick"("p_routine" "text", "p_tick" "text", "p_mode" "text", "p_host" "text", "p_step_s" integer) RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  insert into company_os.routine_runs (routine_id, tick_key, mode, host, status, started_at, step_deadline_at)
  values (p_routine, p_tick, p_mode, p_host, 'running', now(), now() + make_interval(secs => p_step_s))
  on conflict (routine_id, tick_key, mode) where tick_key is not null and status in ('running', 'waiting', 'ok', 'skipped')
  do nothing
  returning id;
$$;


--
-- Name: email_delivery_stats(timestamp with time zone, "uuid"); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."email_delivery_stats"("p_since" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_campaign_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("event_type" "text", "unique_emails" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'company_os', 'public', 'extensions'
    AS $$
  select e.event_type, count(distinct e.resend_email_id) as unique_emails
  from company_os.email_events e
  where (p_since is null or e.occurred_at >= p_since)
    and (p_campaign_id is null or e.campaign_id = p_campaign_id)
  group by e.event_type;
$$;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: deals_stage_decides(); Type: FUNCTION; Schema: company_os; Owner: -
-- A deal's stage decides its status (ADR-0011, 20260927230000).
--

CREATE FUNCTION company_os.deals_stage_decides()
returns trigger
language plpgsql
set search_path = company_os, pg_temp
as $$
declare
  st record;
  entering boolean;
begin
  select is_won, is_lost into st from company_os.pipeline_stages where id = new.stage_id;
  new.status := case when st.is_won then 'won' when st.is_lost then 'lost' else 'open' end;

  if new.status = 'open' then
    new.closed_at := null;
  else
    entering := tg_op = 'INSERT' or old.status is distinct from new.status;
    if entering then
      -- A close stamped by the writer in the same statement is kept (an import
      -- of a deal won last month); otherwise the close is now. A move from Won
      -- to Lost is a new close even though the old stamp is still on the row.
      if tg_op = 'UPDATE' and new.closed_at is not distinct from old.closed_at then
        new.closed_at := now();
      else
        new.closed_at := coalesce(new.closed_at, now());
      end if;
    elsif new.closed_at is null then
      new.closed_at := coalesce(old.closed_at, now());
    end if;
  end if;

  if new.status <> 'lost' then
    new.lost_reason := null;
  end if;

  -- The mover and note describe the stage change in this statement and nothing
  -- else: on any write that does not change the stage they are cleared, so a
  -- value never rests on the row to be read as the next move's (A.32.7). A
  -- stage change keeps what its writer set, which the AFTER trigger logs and
  -- then clears.
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    new.stage_moved_by := null;
    new.stage_move_note := null;
  end if;
  return new;
end $$;


--
-- Name: deals_derive_usd(); Type: FUNCTION; Schema: company_os; Owner: -
-- A deal derives its USD value from fx_rates (R.24, 20260928160000).
--

CREATE FUNCTION company_os.deals_derive_usd()
returns trigger
language plpgsql
set search_path = company_os, pg_temp
as $$
declare
  code text;
  cached record;
begin
  if tg_op = 'UPDATE'
     and new.amount_cents is not distinct from old.amount_cents
     and new.currency is not distinct from old.currency
     and old.amount_usd_cents is not null then
    return new;
  end if;

  -- amount_cents is not null (a deal with no value yet holds 0), so there is
  -- no missing-amount case to handle.
  code := lower(trim(coalesce(new.currency, 'usd')));
  if code = 'usd' then
    new.amount_usd_cents := new.amount_cents;
    new.fx_rate := 1;
    new.fx_rate_fetched_at := now();
    return new;
  end if;

  select rate_to_usd, updated_at into cached from company_os.fx_rates where currency = code;
  if cached.rate_to_usd is null then
    new.amount_usd_cents := null;
    new.fx_rate := null;
    new.fx_rate_fetched_at := null;
  else
    new.amount_usd_cents := round(new.amount_cents * cached.rate_to_usd);
    new.fx_rate := cached.rate_to_usd;
    new.fx_rate_fetched_at := cached.updated_at;
  end if;
  return new;
end;
$$;


--
-- Name: deals_log_stage_move(); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION company_os.deals_log_stage_move()
returns trigger
language plpgsql
security definer
set search_path = company_os, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into company_os.deal_stage_log (deal_id, from_stage_id, to_stage_id, kind, moved_by, note)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.stage_id end,
      new.stage_id,
      case when tg_op = 'INSERT' then 'create' else 'move' end,
      new.stage_moved_by,
      new.stage_move_note
    );
    if new.stage_moved_by is not null or new.stage_move_note is not null then
      update company_os.deals set stage_moved_by = null, stage_move_note = null where id = new.id;
    end if;
  end if;
  return null;
end $$;


--
-- Name: sprints_set_week(); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."sprints_set_week"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
begin
  new.week := case when new.starts_on is null then null else to_char(new.starts_on, 'IYYY-"W"IW') end;
  return new;
end;
$$;


--
-- Name: tasks_children_follow_card(); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."tasks_children_follow_card"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
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

  return null;
end;
$$;


--
-- Name: meetings_normalize_type_tg(); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."meetings_normalize_type_tg"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  canon text := company_os.normalize_meeting_type(new.meeting_type);
begin
  if new.meeting_type is not null and canon is distinct from new.meeting_type
     and coalesce(new.metadata->>'source_meeting_type','') = '' then
    new.metadata := coalesce(new.metadata,'{}'::jsonb)
      || jsonb_build_object('source_meeting_type', new.meeting_type);
  end if;
  new.meeting_type := canon;
  return new;
end
$$;


--
-- Name: new_ticket_code(integer); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."new_ticket_code"("len" integer DEFAULT 12) RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'company_os', 'extensions', 'pg_catalog'
    AS $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea := gen_random_bytes(len);
  code text := '';
  i integer;
begin
  for i in 0 .. len - 1 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;


--
-- Name: normalize_meeting_type("text"); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."normalize_meeting_type"("raw" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when raw is null then null
    when raw in ('Sales','1-1','Leadership Sync','Vendor Call','General','Performance','Team Ceremony') then raw
    when raw ilike any (array['%stand-up%','%standup%','%sprint%','%grooming%','%project planning%','%retro%','%ceremony%','%kickoff%','%kick-off%']) then 'Team Ceremony'
    when raw ilike '%vendor%' then 'Vendor Call'
    when raw ilike '%leadership%' or raw ilike '%exec %' or raw ilike '%leadership sync%' then 'Leadership Sync'
    when raw ilike '%performance review%' or raw ilike '%perf review%' or raw ilike '%performance%' then 'Performance'
    when raw ilike '%1-1%' or raw ilike '%1:1%' or raw ilike '%one-on-one%' or raw ilike '%one on one%' or raw ilike '% <> %' then '1-1'
    when raw ilike '%sales%' or raw ilike '%discovery%' or raw ilike '%capabilities audit%' or raw ilike '%demo%' or raw ilike '%proposal%' then 'Sales'
    else 'General'
  end
$$;


--
-- Name: offboard_team_member("uuid", "text", "date", "text"); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."offboard_team_member"("p_team_member_id" "uuid", "p_status" "text", "p_end_date" "date" DEFAULT CURRENT_DATE, "p_actor" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'company_os', 'extensions', 'pg_catalog'
    AS $$
declare
  v_person_id uuid;
  v_prev_status text;
  v_auth_user_id uuid;
  v_ended_assignments int;
  v_open_equipment int;
begin
  if p_status not in ('terminated', 'alumni') then
    raise exception 'offboard status must be terminated or alumni, got %', p_status;
  end if;

  select t.person_id, t.status
    into v_person_id, v_prev_status
    from company_os.team_members t
   where t.id = p_team_member_id
   for update;

  if v_person_id is null then
    raise exception 'team member % not found', p_team_member_id;
  end if;

  update company_os.team_members
     set status = p_status,
         end_date = p_end_date
   where id = p_team_member_id;

  update company_os.people
     set is_team_member = false
   where id = v_person_id
  returning auth_user_id into v_auth_user_id;

  with ended as (
    update company_os.staff_assignments
       set status = 'ended',
           end_date = coalesce(end_date, p_end_date)
     where team_member_id = p_team_member_id
       and status = 'active'
    returning 1
  )
  select count(*) into v_ended_assignments from ended;

  select count(*) into v_open_equipment
    from company_os.equipment_assignments ea
   where ea.person_id = v_person_id
     and ea.returned_at is null;

  return jsonb_build_object(
    'person_id', v_person_id,
    'auth_user_id', v_auth_user_id,
    'previous_status', v_prev_status,
    'ended_assignments', v_ended_assignments,
    'open_equipment', v_open_equipment
  );
end;
$$;


--
-- Name: register_for_event("uuid", "uuid", "uuid", "text", "text", integer, boolean, "uuid"); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."register_for_event"("p_event_id" "uuid", "p_person_id" "uuid", "p_product_id" "uuid" DEFAULT NULL::"uuid", "p_attendee_name" "text" DEFAULT NULL::"text", "p_attendee_email" "text" DEFAULT NULL::"text", "p_guest_count" integer DEFAULT 0, "p_hold_for_payment" boolean DEFAULT false, "p_order_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'company_os', 'extensions', 'pg_catalog'
    AS $$
declare
  ev record;
  existing record;
  guests integer := greatest(coalesce(p_guest_count, 0), 0);
  held_statuses constant text[] := array['pending_payment','registered','attended','confirmed'];
  tier_cap integer;
  tier_held integer;
  event_held integer;
  new_status text;
  new_position integer;
  code text;
  reg_id uuid;
begin
  select * into ev from company_os.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  if ev.status <> 'open' then
    raise exception 'event_not_open' using errcode = 'P0001';
  end if;

  select id, status, waitlist_position, ticket_code into existing
  from company_os.event_registrations
  where event_id = p_event_id
    and person_id = p_person_id
    and attendee_email is not distinct from p_attendee_email::citext
    and status = any (held_statuses || array['waitlisted'])
  limit 1;
  if found then
    return jsonb_build_object(
      'registration_id', existing.id,
      'status', existing.status,
      'waitlist_position', existing.waitlist_position,
      'ticket_code', existing.ticket_code,
      'already_registered', true
    );
  end if;

  if p_product_id is not null then
    select capacity into tier_cap
    from company_os.products
    where id = p_product_id
      and (event_id = p_event_id or event_id is null);
    if not found then
      raise exception 'product_not_for_event' using errcode = 'P0001';
    end if;
    if tier_cap is not null then
      select coalesce(sum(1 + guest_count), 0) into tier_held
      from company_os.event_registrations
      where product_id = p_product_id and status = any (held_statuses);
      if tier_held + 1 + guests > tier_cap then
        raise exception 'tier_full' using errcode = 'P0001';
      end if;
    end if;
  end if;

  new_status := case when p_hold_for_payment then 'pending_payment' else 'registered' end;
  if ev.capacity is not null then
    select coalesce(sum(1 + guest_count), 0) into event_held
    from company_os.event_registrations
    where event_id = p_event_id and status = any (held_statuses);
    if event_held + 1 + guests > ev.capacity then
      new_status := 'waitlisted';
      select coalesce(max(waitlist_position), 0) + 1 into new_position
      from company_os.event_registrations
      where event_id = p_event_id and status = 'waitlisted';
    end if;
  end if;

  code := company_os.new_ticket_code();
  insert into company_os.event_registrations
    (event_id, product_id, order_id, person_id, attendee_name, attendee_email,
     status, guest_count, waitlist_position, ticket_code)
  values
    (p_event_id, p_product_id, p_order_id, p_person_id, p_attendee_name,
     p_attendee_email::citext, new_status, guests, new_position, code)
  returning id into reg_id;

  return jsonb_build_object(
    'registration_id', reg_id,
    'status', new_status,
    'waitlist_position', new_position,
    'ticket_code', code,
    'already_registered', false
  );
end;
$$;


--
-- Name: return_equipment("uuid", "date", "text", "text"); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."return_equipment"("p_equipment_id" "uuid", "p_returned_at" "date" DEFAULT CURRENT_DATE, "p_condition_in" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'company_os', 'extensions', 'pg_catalog'
    AS $$
declare
  v_open_id uuid;
  v_open_start date;
begin
  select id, assigned_at
    into v_open_id, v_open_start
    from company_os.equipment_assignments
   where equipment_id = p_equipment_id and returned_at is null
   for update;

  if v_open_id is null then
    raise exception 'Nothing to return: this item has no open assignment.';
  end if;

  update company_os.equipment_assignments
     set returned_at = greatest(p_returned_at, v_open_start),
         condition_in = coalesce(p_condition_in, condition_in),
         note = coalesce(p_note, note)
   where id = v_open_id;

  update company_os.equipment
     set current_holder_id = null,
         status = 'in_stock',
         condition = coalesce(p_condition_in, condition),
         updated_at = now()
   where id = p_equipment_id;

  return v_open_id;
end;
$$;


--
-- Name: set_amount_usd_cents(); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."set_amount_usd_cents"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'company_os', 'public'
    AS $$
declare
  r numeric;
begin
  if new.amount_cents is null then
    new.amount_usd_cents := null;
    return new;
  end if;
  select rate_to_usd into r
    from company_os.fx_rates
    where currency = lower(coalesce(new.currency, 'usd'));
  new.amount_usd_cents := round(new.amount_cents * coalesce(r, 1));
  return new;
end;
$$;


--
-- Name: append_task_position("uuid", "uuid"); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."append_task_position"("p_board_id" "uuid", "p_column_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_top integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_column_id::text));
  select coalesce(max(t.position), 0) into v_top
  from company_os.tasks t
  where t.board_id = p_board_id
    and t.board_column_id = p_column_id
    and t.archived_at is null;
  return v_top + 1;
end;
$$;


--
-- Name: set_deal_positions_in_stage("uuid", "uuid"[]); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."set_deal_positions_in_stage"("p_stage_id" "uuid", "p_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  with listed as (
    select t.id, (t.ord - 1)::int as pos
    from unnest(p_ids) with ordinality as t(id, ord)
  ),
  rest as (
    select d.id,
           (coalesce(array_length(p_ids, 1), 0) + row_number() over (order by d.position, d.updated_at, d.id) - 1)::int as pos
    from company_os.deals d
    where d.stage_id = p_stage_id
      and d.status = 'open'
      and d.archived_at is null
      and not (d.id = any (p_ids))
  ),
  all_pos as (select * from listed union all select * from rest)
  update company_os.deals d
  set position = a.pos
  from all_pos a
  where d.id = a.id;
$$;

--
-- Name: merge_company_metadata("uuid", "jsonb"); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."merge_company_metadata"("p_company_id" "uuid", "p_patch" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  -- `||` with an array or a scalar would turn metadata into an array; only an
  -- object is a set of keys.
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'merge_company_metadata: patch must be a JSON object, got %', jsonb_typeof(p_patch);
  end if;
  update company_os.companies
     set metadata = coalesce(metadata, '{}'::jsonb) || p_patch
   where id = p_company_id;
  return found;
end;
$$;


--
-- Name: assign_company_metadata_id("text", "text", "uuid"); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."assign_company_metadata_id"("p_key" "text", "p_value" "text", "p_company_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  -- Two assignments of the same value to different companies would each strip
  -- the other holders before either appended, and both would append. Taking
  -- turns per (key, value) keeps the value in one place.
  perform pg_advisory_xact_lock(hashtext('company_metadata_id:' || p_key || ':' || p_value));

  if p_company_id is not null then
    perform 1 from company_os.companies where id = p_company_id for update;
    if not found then
      return false;
    end if;
  end if;

  update company_os.companies c
     set metadata = jsonb_set(
           c.metadata,
           array[p_key],
           coalesce(
             (select jsonb_agg(e.value order by e.ord)
                from jsonb_array_elements(c.metadata -> p_key) with ordinality as e(value, ord)
               where e.value <> to_jsonb(p_value)),
             '[]'::jsonb))
   where c.metadata -> p_key @> jsonb_build_array(p_value)
     and c.id is distinct from p_company_id;

  if p_company_id is not null then
    update company_os.companies c
       set metadata = jsonb_set(
             c.metadata,
             array[p_key],
             (case when jsonb_typeof(c.metadata -> p_key) = 'array' then c.metadata -> p_key else '[]'::jsonb end)
               || jsonb_build_array(p_value))
     where c.id = p_company_id
       and not coalesce(c.metadata -> p_key @> jsonb_build_array(p_value), false);
  end if;

  return true;
end;
$$;


--
-- Name: set_deal_positions("uuid"[], integer); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."set_deal_positions"("p_ids" "uuid"[], "p_start" integer DEFAULT 0) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  update company_os.deals d
  set position = p_start + (t.ord - 1)
  from unnest(p_ids) with ordinality as t(id, ord)
  where d.id = t.id;
$$;


--
-- Name: workshop_attendees_total(integer); Type: FUNCTION; Schema: company_os; Owner: -
--

CREATE FUNCTION "company_os"."workshop_attendees_total"("p_year" integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'company_os', 'extensions', 'pg_catalog'
    AS $$
  select coalesce(sum(
    coalesce(
      e.attendee_count_override,
      (select count(*) + coalesce(sum(r.guest_count), 0)
         from company_os.event_registrations r
        where r.event_id = e.id
          and r.status in ('confirmed','registered','attended'))
    )
  ), 0)::integer
  from company_os.events e
  where e.archived_at is null
    and e.status not in ('cancelled','draft')
    and (p_year is null
      or (e.starts_at >= make_date(p_year, 1, 1)
          and e.starts_at < make_date(p_year + 1, 1, 1)));
$$;


--
-- Name: resolve_contributor("text"); Type: FUNCTION; Schema: htt; Owner: -
--

CREATE FUNCTION "htt"."resolve_contributor"("p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'extensions', 'pg_catalog'
    AS $$
  select coalesce(
    (select pge.person_id
       from company_os.person_git_emails pge
      where pge.git_email = p_email::citext
      limit 1),
    (select p.id
       from company_os.people p
      where lower(p.email) = lower(p_email)
      order by p.created_at
      limit 1)
  );
$$;


--
-- Name: resolve_team_member("text"); Type: FUNCTION; Schema: htt; Owner: -
--

CREATE FUNCTION "htt"."resolve_team_member"("p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select htt.resolve_contributor(p_email);
$$;


--
-- Name: resolve_team_member_by_login("text"); Type: FUNCTION; Schema: htt; Owner: -
--

CREATE FUNCTION "htt"."resolve_team_member_by_login"("p_github_login" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'extensions', 'pg_catalog'
    AS $$
  select p.id
  from company_os.people p
  where p.github_login = p_github_login::citext
  order by p.created_at
  limit 1;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: htt; Owner: -
--

CREATE FUNCTION "htt"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: access_codes; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."access_codes" (
    "scope" "text" NOT NULL,
    "code" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "text",
    CONSTRAINT "access_codes_code_check" CHECK (("length"("btrim"("code")) > 0))
);


--
-- Name: TABLE "access_codes"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."access_codes" IS 'One shared access code per gated content scope (the private library, a client''s scope documents). Plain text so a super admin can read it back; service-role only, hidden from the assistant roles. Read and written only through kernel/identity/access-codes.ts.';


--
-- Name: COLUMN "access_codes"."scope"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."access_codes"."scope" IS 'The access-gate scope the code unlocks, the same string signGate and verifyGate take (e.g. private-library). Primary key: one current code per scope.';


--
-- Name: COLUMN "access_codes"."code"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."access_codes"."code" IS 'The shared code a visitor types, in plain text so a super admin can read it back to send to a client. Never log it or copy it into audit_log.';


--
-- Name: COLUMN "access_codes"."updated_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."access_codes"."updated_at" IS 'When the code was last set.';


--
-- Name: COLUMN "access_codes"."updated_by"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."access_codes"."updated_by" IS 'Email of the super admin who last set the code.';


--
-- Name: admins; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text",
    "can_view_sensitive" boolean DEFAULT false NOT NULL,
    "person_id" "uuid"
);


--
-- Name: COLUMN "admins"."can_view_sensitive"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."admins"."can_view_sensitive" IS 'True => this admin may view/edit wages and PII (compensation, people_sensitive, ID docs). Default false: being an admin is not enough. Env var SENSITIVE_VIEWERS is the break-glass fallback (covers env-only admins like the owner).';


--
-- Name: COLUMN "admins"."person_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."admins"."person_id" IS 'The employee (company_os.people) this admin is. Set when added from the active-employee picker in Settings -> Admins. Null for env-allowlist / owner admins with no people row.';


--
-- Name: affiliate_commissions; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."affiliate_commissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "source_event" "text" DEFAULT 'order_paid'::"text" NOT NULL,
    "source_ref" "text",
    "gross_cents" bigint NOT NULL,
    "rate" numeric(4,2),
    "commission_cents" bigint,
    "payout_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "redemption_choice" "text",
    "chosen_at" timestamp with time zone,
    "gross_usd_cents" bigint,
    "net_usd_cents" bigint,
    "commission_usd_cents" bigint,
    "fx_rate" numeric,
    CONSTRAINT "affiliate_commissions_redemption_choice_check" CHECK (("redemption_choice" = ANY (ARRAY['work_credit'::"text", 'cash'::"text"]))),
    CONSTRAINT "affiliate_commissions_source_event_check" CHECK (("source_event" = ANY (ARRAY['order_paid'::"text", 'invoice_paid'::"text", 'manual_adjustment'::"text"])))
);


--
-- Name: COLUMN "affiliate_commissions"."rate"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."affiliate_commissions"."rate" IS 'Realized rate once redeemed (0.20 work credit / 0.10 cash). Null while pending.';


--
-- Name: COLUMN "affiliate_commissions"."commission_cents"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."affiliate_commissions"."commission_cents" IS 'Realized commission = round(gross_cents * rate). Null while pending.';


--
-- Name: COLUMN "affiliate_commissions"."redemption_choice"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."affiliate_commissions"."redemption_choice" IS 'How the affiliate takes this commission: work_credit (20%) or cash (10%). Null = pending choice.';


--
-- Name: affiliate_payouts; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."affiliate_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "method" "text",
    "reference" "text",
    "paid_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: affiliates; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."affiliates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "extensions"."citext" NOT NULL,
    "person_id" "uuid",
    "program_type" "text" DEFAULT 'commission'::"text" NOT NULL,
    "rate" numeric(4,2) DEFAULT 0.10 NOT NULL,
    "stripe_coupon_id" "text",
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_id" "uuid",
    "code_discount" "text",
    "code_commission" "text",
    "referred_by" "text",
    CONSTRAINT "affiliates_party_present_chk" CHECK ((("company_id" IS NOT NULL) OR ("person_id" IS NOT NULL))),
    CONSTRAINT "affiliates_program_type_check" CHECK (("program_type" = ANY (ARRAY['discount'::"text", 'commission'::"text"])))
);


--
-- Name: COLUMN "affiliates"."company_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."affiliates"."company_id" IS 'The affiliate company when this is a company affiliate. person_id (kept) is the acting/portal contact. At least one of company_id/person_id is set.';


--
-- Name: ai_programs; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."ai_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_programs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'complete'::"text", 'archived'::"text"])))
);


--
-- Name: TABLE "ai_programs"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."ai_programs" IS 'Portal AI Programs: company-scoped client AI program records (draft/active/complete).';


--
-- Name: application_stage_log; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."application_stage_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "from_stage_id" "uuid",
    "to_stage_id" "uuid",
    "moved_by" "uuid",
    "note" "text",
    "moved_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: application_stages; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."application_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_requisition_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "stage_kind" "text" DEFAULT 'interview'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_terminal" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "application_stages_stage_kind_check" CHECK (("stage_kind" = ANY (ARRAY['applied'::"text", 'screen'::"text", 'interview'::"text", 'assessment'::"text", 'reference'::"text", 'offer'::"text", 'hired'::"text", 'rejected'::"text"])))
);


--
-- Name: applications; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "candidate_id" "uuid",
    "job_requisition_id" "uuid" NOT NULL,
    "current_stage_id" "uuid",
    "source" "text" DEFAULT 'direct'::"text" NOT NULL,
    "source_detail" "text",
    "referrer_person_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "rejection_reason" "text",
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "rating" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resume_assessment" "text",
    "person_id" "uuid",
    "resume_document_id" "uuid",
    "cover_letter" "text",
    "answers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "ai_summary" "jsonb",
    "ai_rating" numeric(3,1),
    "ai_screen_status" "text",
    "ai_screen_error" "text",
    "ai_screened_at" timestamp with time zone,
    "ai_model" "text",
    "archived_at" timestamp with time zone,
    "hr_assessment" "text",
    "chain_step" "text",
    "chain_started_at" timestamp with time zone,
    "chain_error" "text",
    "chain_proposal" "jsonb",
    "ai_screen_flags" "jsonb",
    CONSTRAINT "applications_rating_check" CHECK ((("rating" IS NULL) OR (("rating" >= 1) AND ("rating" <= 5)))),
    CONSTRAINT "applications_source_check" CHECK (("source" = ANY (ARRAY['direct'::"text", 'referral'::"text", 'job_board'::"text", 'linkedin'::"text", 'agency'::"text", 'sourced'::"text", 'career_site'::"text", 'event'::"text", 'recruiter'::"text", 'other'::"text"]))),
    CONSTRAINT "applications_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'on_hold'::"text", 'passive'::"text", 'withdrawn'::"text", 'rejected'::"text", 'hired'::"text", 'future_consideration'::"text"])))
);


--
-- Name: COLUMN "applications"."archived_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."applications"."archived_at" IS 'Soft-archive timestamp. NULL = active. Set by the admin ATS Delete action; reversible via Restore.';


--
-- Name: COLUMN "applications"."hr_assessment"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."applications"."hr_assessment" IS 'Recruiter-owned free-text assessment for this application. Overrides/augments the read-only AI screen; edited freely.';


--
-- Name: approvals; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_type" "text" NOT NULL,
    "subject_id" "text" NOT NULL,
    "requested_by" "uuid",
    "approver_person_id" "uuid",
    "state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approvals_subject_type_check" CHECK (("btrim"("subject_type") <> ''::"text")),
    CONSTRAINT "approvals_subject_id_check" CHECK (("btrim"("subject_id") <> ''::"text")),
    CONSTRAINT "approvals_state_check" CHECK (("state" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


--
-- Name: assistant_conversations; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."assistant_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "surface" "text" NOT NULL,
    "owner_auth_user_id" "uuid" NOT NULL,
    "owner_person_id" "uuid",
    "title" "text" DEFAULT 'New chat'::"text" NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "display_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "assistant_conversations_surface_check" CHECK (("surface" = ANY (ARRAY['admin'::"text", 'team'::"text"])))
);


--
-- Name: audit_log; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_person_id" "uuid",
    "actor_label" "text",
    "table_name" "text" NOT NULL,
    "record_id" "uuid",
    "operation" "text" NOT NULL,
    "old_data" "jsonb",
    "new_data" "jsonb",
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_log_operation_check" CHECK (("operation" = ANY (ARRAY['insert'::"text", 'update'::"text", 'delete'::"text", 'archive'::"text", 'restore'::"text", 'bulk_update'::"text", 'bulk_archive'::"text", 'bulk_delete'::"text"])))
);


--
-- Name: board_columns; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."board_columns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_done" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "wip_limit" integer,
    "is_not_doing" boolean DEFAULT false NOT NULL,
    CONSTRAINT "board_columns_done_or_not_doing" CHECK ((NOT ("is_done" AND "is_not_doing"))),
    CONSTRAINT "board_columns_wip_limit_positive" CHECK ((("wip_limit" IS NULL) OR ("wip_limit" > 0)))
);


--
-- Name: board_members; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."board_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: boards; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."boards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "client_company_id" "uuid",
    "owner_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_program_id" "uuid"
);


--
-- Name: book_chapters; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."book_chapters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "book_id" "uuid" NOT NULL,
    "sort_order" integer NOT NULL,
    "part" "text",
    "title" "text" NOT NULL,
    "body_md" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "order_id" "uuid",
    "kind" "text" DEFAULT 'other'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "party_size" integer,
    "amount_cents" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "amount_usd_cents" bigint,
    CONSTRAINT "bookings_kind_check" CHECK (("kind" = ANY (ARRAY['stay'::"text", 'car'::"text", 'private_session'::"text", 'other'::"text"]))),
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'cancelled'::"text", 'completed'::"text", 'refunded'::"text"])))
);


--
-- Name: books; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."books" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "format" "text" DEFAULT 'nonfiction'::"text" NOT NULL,
    "audience" "text",
    "description" "text",
    "reader_path" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "books_format_check" CHECK (("format" = ANY (ARRAY['nonfiction'::"text", 'fable'::"text"]))),
    CONSTRAINT "books_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published_web'::"text", 'published_amazon'::"text"])))
);


--
-- Name: brand_profiles; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."brand_profiles" (
    "brand_id" "uuid" NOT NULL,
    "positioning" "text",
    "audience" "text",
    "voice_md" "text",
    "offer" "text",
    "primary_cta" "text",
    "content_rules_md" "text",
    "updated_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "author_md" "text",
    "rules_md" "text",
    "channels_md" "text",
    "process_md" "text",
    "blog_styles_md" "text",
    "editing_lens_md" "text",
    "seo_lens_md" "text",
    "image_style_md" "text",
    "preferred_blog_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "preferred_image_styles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "preferred_social_styles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "auto_publish" boolean DEFAULT false NOT NULL
);


--
-- Name: brands; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "primary_domain" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: call_scorecards; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."call_scorecards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "call_transcript_id" "uuid" NOT NULL,
    "talk_ratio" numeric,
    "question_count" integer,
    "score_talk_ratio" smallint,
    "score_pain_quantified" smallint,
    "score_product_fit" smallint,
    "score_objection_surfaced" smallint,
    "score_next_step" smallint,
    "coaching_md" "text",
    "scored_by" "text" DEFAULT 'agent'::"text" NOT NULL,
    "scored_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "call_scorecards_score_next_step_check" CHECK ((("score_next_step" >= 1) AND ("score_next_step" <= 5))),
    CONSTRAINT "call_scorecards_score_objection_surfaced_check" CHECK ((("score_objection_surfaced" >= 1) AND ("score_objection_surfaced" <= 5))),
    CONSTRAINT "call_scorecards_score_pain_quantified_check" CHECK ((("score_pain_quantified" >= 1) AND ("score_pain_quantified" <= 5))),
    CONSTRAINT "call_scorecards_score_product_fit_check" CHECK ((("score_product_fit" >= 1) AND ("score_product_fit" <= 5))),
    CONSTRAINT "call_scorecards_score_talk_ratio_check" CHECK ((("score_talk_ratio" >= 1) AND ("score_talk_ratio" <= 5))),
    CONSTRAINT "call_scorecards_talk_ratio_check" CHECK ((("talk_ratio" >= (0)::numeric) AND ("talk_ratio" <= (1)::numeric)))
);


--
-- Name: call_transcripts; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."call_transcripts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "minute_token" "text",
    "meeting_id" "uuid",
    "title" "text" NOT NULL,
    "started_at" timestamp with time zone,
    "duration_seconds" integer,
    "source" "text" DEFAULT 'lark_minutes'::"text" NOT NULL,
    "call_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "transcript" "text" NOT NULL,
    "search" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", ((COALESCE("title", ''::"text") || ' '::"text") || "transcript"))) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "call_transcripts_call_type_check" CHECK (("call_type" = ANY (ARRAY['sales'::"text", 'client'::"text", 'internal'::"text", 'other'::"text"])))
);


--
-- Name: candidate_profile; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."candidate_profile" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "headline" "text",
    "current_title" "text",
    "portfolio_url" "text",
    "do_not_hire" boolean DEFAULT false NOT NULL,
    "pool_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "english_proficiency" "text",
    "salary_expectation_cents" bigint,
    "salary_expectation_currency" "text",
    "notice_period" "text"
);


--
-- Name: candidate_sensitive; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."candidate_sensitive" (
    "person_id" "uuid" NOT NULL,
    "salary_expectation_cents" bigint,
    "salary_expectation_currency" "text",
    "ai_salary_expectation" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "candidate_sensitive"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."candidate_sensitive" IS 'Restricted candidate salary. Service-role + super-admin-audited UI only (canViewSensitive). Explicitly hidden from chatbot_reader. Never join into ATS list/detail reads.';


--
-- Name: candidates; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "headline" "text",
    "current_company_id" "uuid",
    "current_title" "text",
    "resume_document_id" "uuid",
    "linkedin_url" "text",
    "portfolio_url" "text",
    "desired_salary_cents" bigint,
    "currency" "text",
    "availability" "text",
    "pool_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "owner_recruiter_id" "uuid",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "candidates_pool_status_check" CHECK (("pool_status" = ANY (ARRAY['active'::"text", 'passive'::"text", 'placed'::"text", 'do_not_pursue'::"text", 'archived'::"text"])))
);


--
-- Name: capacity_commitments; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."capacity_commitments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role_id" "uuid" NOT NULL,
    "company_id" "uuid",
    "hours_per_week" numeric(6,2) NOT NULL,
    "starts_on" "date" NOT NULL,
    "ends_on" "date",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "note" "text",
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "capacity_commitments_check" CHECK ((("ends_on" IS NULL) OR ("ends_on" >= "starts_on"))),
    CONSTRAINT "capacity_commitments_hours_per_week_check" CHECK (("hours_per_week" > (0)::numeric)),
    CONSTRAINT "capacity_commitments_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'deal'::"text", 'requisition'::"text", 'work_request'::"text"])))
);


--
-- Name: TABLE "capacity_commitments"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."capacity_commitments" IS 'One row is: one block of weekly hours of one capacity role already promised to a client or to internal work, over a date range. [transactional · Client delivery & work | tier 3 support | active]';


--
-- Name: COLUMN "capacity_commitments"."id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_commitments"."id" IS 'Primary key.';


--
-- Name: COLUMN "capacity_commitments"."role_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_commitments"."role_id" IS 'The capacity role whose hours are committed, referencing capacity_roles.id; deleted with the role.';


--
-- Name: COLUMN "capacity_commitments"."company_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_commitments"."company_id" IS 'The client the hours are for, referencing companies.id; null means internal work.';


--
-- Name: COLUMN "capacity_commitments"."hours_per_week"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_commitments"."hours_per_week" IS 'Hours per week of the role this commitment takes. Greater than zero.';


--
-- Name: COLUMN "capacity_commitments"."starts_on"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_commitments"."starts_on" IS 'The first date the commitment covers.';


--
-- Name: COLUMN "capacity_commitments"."ends_on"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_commitments"."ends_on" IS 'The last date the commitment covers; null means open-ended. Never before starts_on.';


--
-- Name: COLUMN "capacity_commitments"."source"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_commitments"."source" IS 'What prompted the commitment. Valid values: [manual, deal, requisition, work_request]';


--
-- Name: COLUMN "capacity_commitments"."note"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_commitments"."note" IS 'Free-text context, e.g. the deal or the scope it covers.';


--
-- Name: COLUMN "capacity_commitments"."archived_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_commitments"."archived_at" IS 'When the commitment was archived. A non-null value drops it from the forecast; rows are never hard-deleted.';


--
-- Name: COLUMN "capacity_commitments"."created_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_commitments"."created_at" IS 'Row creation time.';


--
-- Name: COLUMN "capacity_commitments"."updated_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_commitments"."updated_at" IS 'When the row last changed; maintained by a trigger.';


--
-- Name: capacity_roles; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."capacity_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "position_id" "uuid",
    "hours_per_week" numeric(6,2) NOT NULL,
    "effective_from" "date" DEFAULT CURRENT_DATE NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "capacity_roles_hours_per_week_check" CHECK (("hours_per_week" >= (0)::numeric)),
    CONSTRAINT "capacity_roles_name_check" CHECK (("length"("btrim"("name")) > 0))
);


--
-- Name: TABLE "capacity_roles"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."capacity_roles" IS 'One row is: one role the company sells hours of, with the hours per week it can give — a role, never a person. [master · People & org structure | tier 3 support | active]';


--
-- Name: COLUMN "capacity_roles"."id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_roles"."id" IS 'Primary key.';


--
-- Name: COLUMN "capacity_roles"."name"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_roles"."name" IS 'The role''s name as the capacity screen shows it, e.g. "Senior engineer". Unique and never blank.';


--
-- Name: COLUMN "capacity_roles"."position_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_roles"."position_id" IS 'The org-chart position this role corresponds to, referencing positions.id; optional, and cleared if the position is deleted.';


--
-- Name: COLUMN "capacity_roles"."hours_per_week"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_roles"."hours_per_week" IS 'Hours of work this role can give in a normal week, the supply the forecast compares commitments against. Zero or more.';


--
-- Name: COLUMN "capacity_roles"."effective_from"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_roles"."effective_from" IS 'The first date the supply counts from; before it the role supplies nothing.';


--
-- Name: COLUMN "capacity_roles"."archived_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_roles"."archived_at" IS 'When the role was archived. A non-null value hides it from the forecast and the pickers; rows are never hard-deleted.';


--
-- Name: COLUMN "capacity_roles"."created_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_roles"."created_at" IS 'Row creation time.';


--
-- Name: COLUMN "capacity_roles"."updated_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."capacity_roles"."updated_at" IS 'When the row last changed; maintained by a trigger.';


--
-- Name: client_backlog_items; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."client_backlog_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "group_key" "text" NOT NULL,
    "ref" "text",
    "title" "text" NOT NULL,
    "who" "text",
    "today_state" "text",
    "build_desc" "text",
    "needs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "token_low" integer,
    "token_high" integer,
    "edge8_priority" "text" DEFAULT 'later'::"text" NOT NULL,
    "client_priority" "text",
    "client_note" "text",
    "source" "text" DEFAULT 'edge8'::"text" NOT NULL,
    "status" "text" DEFAULT 'accepted'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_sort_order" integer,
    "ai_program_id" "uuid",
    CONSTRAINT "client_backlog_items_client_priority_check" CHECK ((("client_priority" IS NULL) OR ("client_priority" = ANY (ARRAY['now'::"text", 'next'::"text", 'later'::"text", 'park'::"text"])))),
    CONSTRAINT "client_backlog_items_edge8_priority_check" CHECK (("edge8_priority" = ANY (ARRAY['now'::"text", 'next'::"text", 'later'::"text", 'park'::"text"]))),
    CONSTRAINT "client_backlog_items_source_check" CHECK (("source" = ANY (ARRAY['edge8'::"text", 'client'::"text"]))),
    CONSTRAINT "client_backlog_items_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'accepted'::"text", 'active'::"text", 'shipped'::"text", 'parked'::"text"])))
);


--
-- Name: client_roadmap_groups; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."client_roadmap_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "step_label" "text",
    "title" "text" NOT NULL,
    "intro" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_program_id" "uuid"
);


--
-- Name: client_roadmap_overview; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."client_roadmap_overview" (
    "company_id" "uuid" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "text",
    "ai_program_id" "uuid"
);


--
-- Name: coaching_checkins; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coaching_profile_id" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "message_markdown" "text",
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "moved_md" "text",
    "stuck_md" "text",
    "talk_md" "text",
    "coach_note_md" "text"
);


--
-- Name: coaching_commitment_history; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_commitment_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "commitment_id" "uuid" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title_before" "text",
    "title_after" "text",
    "status_before" "text",
    "status_after" "text"
);


--
-- Name: coaching_commitments; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_commitments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coaching_profile_id" "uuid" NOT NULL,
    "one_on_one_id" "uuid",
    "title" "text" NOT NULL,
    "owner" "text" DEFAULT 'member'::"text" NOT NULL,
    "due_on" "date",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "status_note" "text",
    "status_updated_by" "uuid",
    "status_updated_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "ask_now_sent_at" timestamp with time zone,
    "card_done_at" timestamp with time zone,
    "plan_md" "text",
    CONSTRAINT "coaching_commitments_owner_check" CHECK (("owner" = ANY (ARRAY['coach'::"text", 'member'::"text"]))),
    CONSTRAINT "coaching_commitments_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'on_track'::"text", 'needs_attention'::"text", 'completed'::"text", 'dropped'::"text", 'blocked'::"text"])))
);


--
-- Name: coaching_context; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_context" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "markdown" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coaching_context_kind_check" CHECK (("kind" = ANY (ARRAY['foundation'::"text", 'company'::"text", 'okrs'::"text"])))
);


--
-- Name: coaching_goal_comments; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_goal_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "goal_id" "uuid" NOT NULL,
    "author_team_member_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coaching_goal_comments_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 2000)))
);


--
-- Name: coaching_member_notes; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_member_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coaching_profile_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone
);


--
-- Name: coaching_ocean_profiles; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_ocean_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coaching_profile_id" "uuid" NOT NULL,
    "openness_rating" "text",
    "openness_evidence" "text",
    "conscientiousness_rating" "text",
    "conscientiousness_evidence" "text",
    "extraversion_rating" "text",
    "extraversion_evidence" "text",
    "agreeableness_rating" "text",
    "agreeableness_evidence" "text",
    "neuroticism_rating" "text",
    "neuroticism_evidence" "text",
    "snapshot_markdown" "text",
    "guidance_markdown" "text",
    "published" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: coaching_one_on_ones; Type: TABLE; Schema: company_os; Owner: -
--

--
-- Name: coaching_noticed; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_noticed" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coaching_profile_id" "uuid" NOT NULL,
    "written_by" "uuid" NOT NULL,
    "value_id" "uuid",
    "body" "text" NOT NULL,
    "subject" "text",
    "noticed_on" "date" DEFAULT ((("now"() AT TIME ZONE 'Asia/Ho_Chi_Minh'::"text"))::"date") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone
);


CREATE TABLE "company_os"."coaching_one_on_ones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coaching_profile_id" "uuid" NOT NULL,
    "held_on" "date" NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "prep_markdown" "text",
    "prep_shared_markdown" "text",
    "prep_generated_at" timestamp with time zone,
    "summary_markdown" "text",
    "shared_summary_markdown" "text",
    "shared_published_at" timestamp with time zone,
    "ai_model" "text",
    "ai_error" "text",
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mode_coach_pct" integer,
    "mode_mentor_pct" integer,
    "mode_direct_pct" integer,
    "minutes_token" "text",
    "transcript_source" "text",
    "starts_at" time without time zone,
    "prep_member_edits" "jsonb",
    "coach_voltage_md" "text",
    "held_source" "text",
    "meeting_id" "uuid",
    "skip_reason" "text",
    "transcript_sha256" "text",
    "moved_from" "date",
    "move_reason" "text",
    "lark_hold_id" "text",
    "lark_hold_synced_at" timestamp with time zone,
    "lark_hold_error" "text",
    "marked_held_on" "date",
    "format" "text",
    "led_by" "uuid",
    "kind" "text" DEFAULT 'one_on_one'::"text" NOT NULL,
    CONSTRAINT "coaching_one_on_ones_format_check" CHECK ((("format" IS NULL) OR ("format" = ANY (ARRAY['video'::"text", 'call'::"text", 'in_person'::"text", 'chat'::"text"])))),
    CONSTRAINT "coaching_one_on_ones_kind_check" CHECK (("kind" = ANY (ARRAY['one_on_one'::"text", 'goals_check'::"text"]))),
    CONSTRAINT "coaching_one_on_ones_held_source_check" CHECK ((("held_source" IS NULL) OR ("held_source" = ANY (ARRAY['meeting'::"text", 'written'::"text"])))),
    CONSTRAINT "coaching_one_on_ones_mode_split" CHECK (((("mode_coach_pct" IS NULL) = ("mode_mentor_pct" IS NULL)) AND (("mode_mentor_pct" IS NULL) = ("mode_direct_pct" IS NULL)) AND (("mode_coach_pct" IS NULL) OR ((("mode_coach_pct" >= 0) AND ("mode_coach_pct" <= 100)) AND (("mode_mentor_pct" >= 0) AND ("mode_mentor_pct" <= 100)) AND (("mode_direct_pct" >= 0) AND ("mode_direct_pct" <= 100)) AND ((("mode_coach_pct" + "mode_mentor_pct") + "mode_direct_pct") = 100))))),
    CONSTRAINT "coaching_one_on_ones_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'held'::"text", 'skipped'::"text"]))),
    CONSTRAINT "coaching_one_on_ones_transcript_source_check" CHECK (("transcript_source" = ANY (ARRAY['minutes_auto'::"text", 'minutes_link'::"text", 'manual'::"text"])))
);


--
-- Name: coaching_priorities; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_priorities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coaching_profile_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "detail_markdown" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "objective_id" "uuid",
    "key_result_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "link_url" "text",
    "link_title" "text",
    CONSTRAINT "coaching_priorities_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'retired'::"text"])))
);


--
-- Name: coaching_profiles; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_member_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "okrs_markdown" "text",
    "private_profile_markdown" "text",
    "cadence_days" integer DEFAULT 14 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "retention_root" "text",
    "one_on_ones_paused_at" timestamp with time zone,
    "recap_language" "text",
    "preferred_time" time without time zone,
    "proposed_one_on_one_on" "date",
    "proposed_by" "text",
    CONSTRAINT "coaching_profiles_cadence_days_check" CHECK ((("cadence_days" >= 7) AND ("cadence_days" <= 90))),
    CONSTRAINT "coaching_profiles_proposed_by_check" CHECK ((("proposed_by" IS NULL) OR ("proposed_by" = ANY (ARRAY['member'::"text", 'coach'::"text"])))),
    CONSTRAINT "coaching_profiles_recap_language_check" CHECK ((("recap_language" IS NULL) OR ("recap_language" = ANY (ARRAY['vi'::"text", 'en'::"text"])))),
    CONSTRAINT "coaching_profiles_retention_root_check" CHECK (("retention_root" = ANY (ARRAY['belonging'::"text", 'links'::"text", 'sacrifice'::"text", 'watching'::"text"])))
    "how_best_hours_md" "text",
    "how_feedback_md" "text",
    "how_quiet_md" "text",
    "how_curious_md" "text",
);


--
-- Name: coaching_talking_points; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_talking_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coaching_profile_id" "uuid" NOT NULL,
    "author_team_member_id" "uuid",
    "body" "text" NOT NULL,
    "addressed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: coaching_trends; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."coaching_trends" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coaching_profile_id" "uuid" NOT NULL,
    "period" "text" NOT NULL,
    "report_markdown" "text",
    "ai_model" "text",
    "ai_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "one_on_one_id" "uuid",
    CONSTRAINT "coaching_trends_period_check" CHECK (("period" ~ '^\d{4}-\d{2}$'::"text"))
);


--
-- Name: companies; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "industry" "text",
    "size_band" "text",
    "country" "text",
    "owner_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "priority" "text",
    "billing_address" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "lifecycle_stage" "text" DEFAULT 'none'::"text" NOT NULL,
    "industry_normalized" "text",
    "website_url" "extensions"."citext",
    "client_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_ai_program" boolean DEFAULT false NOT NULL,
    "client_start_date" "date",
    "client_end_date" "date",
    CONSTRAINT "companies_client_term_check" CHECK ((("client_start_date" IS NULL) OR ("client_end_date" IS NULL) OR ("client_end_date" >= "client_start_date"))),
    CONSTRAINT "companies_industry_normalized_check" CHECK ((("industry_normalized" IS NULL) OR ("industry_normalized" = ANY (ARRAY['Technology & Software'::"text", 'Food & Beverage'::"text", 'Hospitality & Travel'::"text", 'Financial Services'::"text", 'Professional Services'::"text", 'Real Estate & Construction'::"text", 'Retail & Consumer Goods'::"text", 'Manufacturing'::"text", 'Healthcare & Wellness'::"text", 'Legal'::"text", 'Marketing & Media'::"text", 'Education'::"text", 'Logistics & Supply Chain'::"text", 'Energy'::"text", 'Other'::"text"])))),
    CONSTRAINT "companies_priority_check" CHECK ((("priority" IS NULL) OR ("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))),
    CONSTRAINT "companies_size_band_check" CHECK ((("size_band" IS NULL) OR ("size_band" = ANY (ARRAY['0-50'::"text", '51-250'::"text", '251-5000'::"text", '5000+'::"text"]))))
);


--
-- Name: company_github_orgs; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."company_github_orgs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "org_login" "extensions"."citext" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: company_information; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."company_information" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text",
    "body" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "source" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone
);


--
-- Name: company_profile; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."company_profile" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "content" "text",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: compensation_sensitive; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."compensation_sensitive" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_member_id" "uuid" NOT NULL,
    "comp_type" "text" DEFAULT 'base_salary'::"text" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "pay_period" "text" DEFAULT 'annual'::"text" NOT NULL,
    "effective_from" "date" NOT NULL,
    "effective_to" "date",
    "is_current" boolean DEFAULT true NOT NULL,
    "change_reason" "text",
    "approved_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "salary_vnd" bigint,
    "salary_usd_cents" bigint,
    CONSTRAINT "compensation_sensitive_comp_type_check" CHECK (("comp_type" = ANY (ARRAY['base_salary'::"text", 'hourly'::"text", 'bonus'::"text", 'commission'::"text", 'equity'::"text", 'stipend'::"text", 'allowance'::"text", 'overtime'::"text", 'billable'::"text"]))),
    CONSTRAINT "compensation_sensitive_pay_period_check" CHECK (("pay_period" = ANY (ARRAY['annual'::"text", 'monthly'::"text", 'semi_monthly'::"text", 'biweekly'::"text", 'weekly'::"text", 'hourly'::"text", 'one_time'::"text"])))
);


--
-- Name: COLUMN "compensation_sensitive"."salary_vnd"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."compensation_sensitive"."salary_vnd" IS 'Monthly salary in whole VND (native). Paired with salary_usd_cents at a fixed 25,500 VND/USD. comp_type = salary. Dave/Mai only.';


--
-- Name: COLUMN "compensation_sensitive"."salary_usd_cents"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."compensation_sensitive"."salary_usd_cents" IS 'Monthly salary in USD cents, converted from salary_vnd at a fixed 25,500 VND/USD (not live fx). Dave/Mai only.';


--
-- Name: contractor_payments; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."contractor_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "period_month" "date" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "total_regular_hours" numeric(8,2) DEFAULT 0 NOT NULL,
    "total_overtime_hours" numeric(8,2) DEFAULT 0 NOT NULL,
    "amount_cents" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "summary" "text",
    "decided_by" "text",
    "decided_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contractor_payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'rejected'::"text", 'info_requested'::"text"])))
);


--
-- Name: contractor_work_events; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."contractor_work_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "actor_type" "text" NOT NULL,
    "actor" "text",
    "type" "text" NOT NULL,
    "body" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contractor_work_events_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['admin'::"text", 'contractor'::"text", 'system'::"text", 'client'::"text"]))),
    CONSTRAINT "contractor_work_events_type_check" CHECK (("type" = ANY (ARRAY['created'::"text", 'estimate_submitted'::"text", 'approved'::"text", 'rejected'::"text", 'info_requested'::"text", 'estimate_resubmitted'::"text", 'scope_added'::"text", 'work_submitted'::"text", 'accepted'::"text", 'message'::"text", 'cancelled'::"text"])))
);


--
-- Name: contractor_work_requests; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."contractor_work_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "brief" "text" NOT NULL,
    "access_token" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "estimated_hours" numeric(6,2),
    "plan_text" "text",
    "estimate_submitted_at" timestamp with time zone,
    "decided_at" timestamp with time zone,
    "actual_hours" numeric(6,2),
    "actual_overtime_hours" numeric(6,2) DEFAULT 0 NOT NULL,
    "work_summary" "text",
    "work_link" "text",
    "work_submitted_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "payment_id" "uuid",
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_company_id" "uuid",
    "requested_by_person_id" "uuid",
    "origin" "text" DEFAULT 'admin'::"text" NOT NULL,
    "billing_status" "text",
    "billing_error" "text",
    "billed_invoice_id" "uuid",
    "billed_amount_cents" bigint,
    "billed_rate_cents" bigint,
    "billed_at" timestamp with time zone,
    CONSTRAINT "contractor_work_requests_billing_status_check" CHECK (("billing_status" = ANY (ARRAY['invoiced'::"text", 'failed'::"text", 'manual_required'::"text"]))),
    CONSTRAINT "contractor_work_requests_origin_check" CHECK (("origin" = ANY (ARRAY['admin'::"text", 'portal'::"text"]))),
    CONSTRAINT "contractor_work_requests_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'awaiting_estimate'::"text", 'estimate_submitted'::"text", 'changes_requested'::"text", 'scope_added'::"text", 'approved'::"text", 'rejected'::"text", 'work_submitted'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


--
-- Name: core_values; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."core_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sort_order" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: departments; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_department_id" "uuid",
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "head_team_member_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: leave_policies; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."leave_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auto_approve" boolean DEFAULT false NOT NULL,
    "year_basis" "text" DEFAULT 'calendar'::"text" NOT NULL,
    "accrual_cadence" "text" DEFAULT 'none'::"text" NOT NULL,
    "tiers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "hours_per_day" numeric DEFAULT 8 NOT NULL,
    "min_increment_hours" numeric DEFAULT 4 NOT NULL,
    "carry_cap_hours" numeric,
    "bank_leave_types" "text"[] DEFAULT '{vacation}'::"text"[] NOT NULL,
    "honour_imported_balance" boolean DEFAULT false NOT NULL,
    "policy_text" "text",
    "counts_from" "text" DEFAULT 'probation_end'::"text" NOT NULL,
    CONSTRAINT "leave_policies_accrual_cadence_check" CHECK (("accrual_cadence" = ANY (ARRAY['none'::"text", 'monthly'::"text", 'semi_monthly'::"text"]))),
    CONSTRAINT "leave_policies_counts_from_check" CHECK (("counts_from" = ANY (ARRAY['probation_end'::"text", 'start_date'::"text"]))),
    CONSTRAINT "leave_policies_year_basis_check" CHECK (("year_basis" = ANY (ARRAY['calendar'::"text", 'anniversary'::"text"])))
);


--
-- Name: people; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "extensions"."citext" NOT NULL,
    "full_name" "text",
    "first_name" "text",
    "last_name" "text",
    "preferred_name" "text",
    "phone" "text",
    "avatar_url" "text",
    "lark_dm_opt_out" boolean DEFAULT false NOT NULL,
    "country" "text",
    "timezone" "text",
    "is_team_member" boolean DEFAULT false NOT NULL,
    "do_not_contact" boolean DEFAULT false NOT NULL,
    "owner_id" "uuid",
    "source" "text",
    "auth_user_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gender" "text",
    "persona" "text",
    "linkedin_url" "text",
    "city" "text",
    "state_province" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "emergency_contact_name" "text",
    "emergency_contact_phone" "text",
    "lark_email" "extensions"."citext",
    "graduated_from" "text",
    "display_name" "text",
    "marketing_consent" "text" DEFAULT 'never_asked'::"text" NOT NULL,
    "marketing_consent_at" timestamp with time zone,
    "marketing_consent_source" "text",
    "github_login" "extensions"."citext",
    "daily_focus_hours" numeric(4,2) DEFAULT 6 NOT NULL,
    CONSTRAINT "people_marketing_consent_check" CHECK (("marketing_consent" = ANY (ARRAY['subscribed'::"text", 'unsubscribed'::"text", 'never_asked'::"text"]))),
    CONSTRAINT "people_persona_check" CHECK ((("persona" IS NULL) OR ("persona" = ANY (ARRAY['vendor'::"text", 'prospect'::"text", 'client'::"text", 'job_seeker'::"text", 'employee'::"text", 'student'::"text"]))))
);


--
-- Name: COLUMN "people"."display_name"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."people"."display_name" IS 'Given name followed by family name, e.g. "Quan Le". Prefers the name the person goes by. Person pickers display and sort on this.';


--
-- Name: positions; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "department_id" "uuid",
    "slug" "text",
    "title" "text" NOT NULL,
    "level" "text",
    "employment_type" "text" DEFAULT 'full_time'::"text" NOT NULL,
    "is_people_manager" boolean DEFAULT false NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "positions_employment_type_check" CHECK (("employment_type" = ANY (ARRAY['full_time'::"text", 'part_time'::"text", 'contract'::"text", 'intern'::"text", 'temp'::"text", 'advisor'::"text"])))
);


--
-- Name: team_members; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "department_id" "uuid",
    "position_id" "uuid",
    "manager_id" "uuid",
    "employee_number" "text",
    "employment_type" "text" DEFAULT 'full_time'::"text" NOT NULL,
    "work_location" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "termination_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "leave_policy_id" "uuid",
    "employment_stage" "text",
    "probation_ends_on" "date",
    "contract_start_date" "date",
    "career_track" "text",
    "career_level" "text",
    "work_schedule" "text",
    "permissions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "team_members_permissions_check" CHECK (("permissions" <@ ARRAY['revenue'::"text", 'payroll'::"text"])),
    CONSTRAINT "team_members_career_level_check" CHECK ((("career_level" IS NULL) OR ("career_level" = ANY (ARRAY['junior'::"text", 'collaborator'::"text", 'senior'::"text", 'principal'::"text"])))),
    CONSTRAINT "team_members_career_track_check" CHECK ((("career_track" IS NULL) OR ("career_track" = ANY (ARRAY['ic'::"text", 'manager'::"text"])))),
    CONSTRAINT "team_members_employment_stage_check" CHECK ((("employment_stage" IS NULL) OR ("employment_stage" = ANY (ARRAY['pre_boarding'::"text", 'probation'::"text", 'full_time'::"text", 'declined_offer'::"text", 'rescinded'::"text", 'failed_probation'::"text"])))),
    CONSTRAINT "team_members_employment_type_check" CHECK (("employment_type" = ANY (ARRAY['full_time'::"text", 'part_time'::"text", 'contract'::"text", 'intern'::"text", 'temp'::"text", 'advisor'::"text"]))),
    CONSTRAINT "team_members_status_check" CHECK (("status" = ANY (ARRAY['candidate'::"text", 'pre_start'::"text", 'active'::"text", 'on_leave'::"text", 'notice'::"text", 'terminated'::"text", 'alumni'::"text"]))),
    CONSTRAINT "team_members_termination_reason_check" CHECK ((("termination_reason" IS NULL) OR ("termination_reason" = ANY (ARRAY['voluntary'::"text", 'involuntary'::"text", 'end_of_contract'::"text", 'redundancy'::"text", 'retirement'::"text", 'other'::"text"]))))
);


--
-- Name: COLUMN "team_members"."employment_stage"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."team_members"."employment_stage" IS 'Orthogonal to status. ''probation'' while under review; null once confirmed.';


--
-- Name: COLUMN "team_members"."probation_ends_on"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."team_members"."probation_ends_on" IS 'Probation end (start + ~2 months). Drives the probation-review workflow.';


--
-- Name: COLUMN "team_members"."career_track"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."team_members"."career_track" IS 'ic or manager. Same four levels on both tracks; reviews draw the AI-craft expectation line from track + level.';


--
-- Name: COLUMN "team_members"."career_level"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."team_members"."career_level" IS 'junior | collaborator | senior | principal. Expected AI-craft rating: 2 / 3 / 4 / 4-5.';


--
-- Name: team_directory; Type: VIEW; Schema: company_os; Owner: -
--

CREATE VIEW "company_os"."team_directory" AS
 SELECT "t"."id",
    "t"."person_id",
    "p"."full_name",
    "p"."email",
    "p"."auth_user_id",
    "t"."status",
    "t"."employee_number",
    "t"."employment_type",
    "t"."start_date",
    "t"."end_date",
    "d"."name" AS "department_name",
    "pos"."title" AS "position_title",
    "lp"."name" AS "leave_policy_name",
    "mgr_p"."full_name" AS "manager_name",
    "d"."name" AS "team",
    "t"."work_location" AS "location",
    "lp"."name" AS "leave_policy",
    "t"."work_schedule",
    "p"."display_name",
    "p"."preferred_name"
   FROM (((((("company_os"."team_members" "t"
     JOIN "company_os"."people" "p" ON (("p"."id" = "t"."person_id")))
     LEFT JOIN "company_os"."departments" "d" ON (("d"."id" = "t"."department_id")))
     LEFT JOIN "company_os"."positions" "pos" ON (("pos"."id" = "t"."position_id")))
     LEFT JOIN "company_os"."leave_policies" "lp" ON (("lp"."id" = "t"."leave_policy_id")))
     LEFT JOIN "company_os"."team_members" "mgr" ON (("mgr"."id" = "t"."manager_id")))
     LEFT JOIN "company_os"."people" "mgr_p" ON (("mgr_p"."id" = "mgr"."person_id")));


--
-- Name: current_team_members; Type: VIEW; Schema: company_os; Owner: -
--

CREATE VIEW "company_os"."current_team_members" AS
 SELECT "team_directory"."id",
    "team_directory"."person_id",
    "team_directory"."full_name",
    "team_directory"."email",
    "team_directory"."auth_user_id",
    "team_directory"."status",
    "team_directory"."employee_number",
    "team_directory"."employment_type",
    "team_directory"."start_date",
    "team_directory"."end_date",
    "team_directory"."department_name",
    "team_directory"."position_title",
    "team_directory"."leave_policy_name",
    "team_directory"."manager_name",
    "team_directory"."team",
    "team_directory"."location",
    "team_directory"."leave_policy",
    "team_directory"."work_schedule"
   FROM "company_os"."team_directory"
  WHERE ("team_directory"."status" = ANY (ARRAY['active'::"text", 'on_leave'::"text", 'notice'::"text"]));


--
-- Name: deals; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "stage_id" "uuid",
    "title" "text" NOT NULL,
    "person_id" "uuid",
    "company_id" "uuid",
    "amount_cents" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "probability" integer,
    "owner_id" "uuid",
    "affiliate_id" "uuid",
    "source" "text",
    "expected_close_date" "date",
    "closed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service_line_id" "uuid",
    "next_step" "text",
    "next_step_date" "date",
    "handoff_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "handoff_rejected_reason" "text",
    "handoff_note" "text",
    "handoff_decided_at" timestamp with time zone,
    "lost_reason" "text",
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "amount_usd_cents" bigint,
    "fx_rate" numeric,
    "fx_rate_fetched_at" timestamp with time zone,
    "proposal_url" "text",
    "contract_url" "text",
    "referrer_id" "uuid",
    "position" integer DEFAULT 0 NOT NULL,
    "referrer_company_id" "uuid",
    "campaign_id" "uuid",
    "stage_moved_by" "text",
    "stage_move_note" "text",
    CONSTRAINT "deals_check" CHECK ((("person_id" IS NOT NULL) OR ("company_id" IS NOT NULL))),
    CONSTRAINT "deals_handoff_rejected_reason_check" CHECK (("handoff_rejected_reason" = ANY (ARRAY['not_qualified'::"text", 'bad_fit'::"text", 'duplicate'::"text", 'bad_timing'::"text", 'other'::"text"]))),
    CONSTRAINT "deals_handoff_status_check" CHECK (("handoff_status" = ANY (ARRAY['none'::"text", 'pending'::"text", 'accepted'::"text", 'rejected'::"text"]))),
    CONSTRAINT "deals_lost_reason_check" CHECK (("lost_reason" = ANY (ARRAY['price'::"text", 'competitor'::"text", 'no_decision'::"text", 'bad_fit'::"text", 'bad_timing'::"text", 'ghosted'::"text", 'other'::"text"]))),
    CONSTRAINT "deals_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'won'::"text", 'lost'::"text"])))
);


--
-- Name: COLUMN "deals"."proposal_url"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."deals"."proposal_url" IS 'Link to the deal proposal document (free-form URL).';


--
-- Name: COLUMN "deals"."contract_url"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."deals"."contract_url" IS 'Link to the deal contract document (free-form URL).';


--
-- Name: COLUMN "deals"."referrer_company_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."deals"."referrer_company_id" IS 'Company that directly referred this deal (mirrors person referrer_id). Attributes referred deals to a company affiliate.';


--
-- Name: documents; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "byte_size" bigint,
    "uploaded_by" "uuid",
    "entity_type" "text",
    "entity_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: email_campaign_recipients; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."email_campaign_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "skip_reason" "text",
    "resend_email_id" "text",
    "error" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "claimed_at" timestamp with time zone,
    "send_after" timestamp with time zone,
    CONSTRAINT "email_campaign_recipients_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'claimed'::"text", 'sent'::"text", 'skipped'::"text", 'failed'::"text"])))
);


--
-- Name: email_campaigns; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."email_audiences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone
);


CREATE TABLE "company_os"."email_series" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "audience_id" "uuid" NOT NULL,
    "brand_id" "uuid",
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "from_email" "text",
    "reply_to" "text",
    "time_zone" "text" DEFAULT 'Australia/Perth'::"text" NOT NULL,
    "draft_weekday" smallint DEFAULT 1 NOT NULL,
    "draft_hour" smallint DEFAULT 8 NOT NULL,
    "send_weekday" smallint DEFAULT 3 NOT NULL,
    "send_hour" smallint DEFAULT 8 NOT NULL,
    "batch_size" integer DEFAULT 150 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "body_template" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "email_series_batch_size_check" CHECK ((("batch_size" >= 1) AND ("batch_size" <= 1000))),
    CONSTRAINT "email_series_draft_hour_check" CHECK ((("draft_hour" >= 0) AND ("draft_hour" <= 23))),
    CONSTRAINT "email_series_draft_weekday_check" CHECK ((("draft_weekday" >= 0) AND ("draft_weekday" <= 6))),
    CONSTRAINT "email_series_send_hour_check" CHECK ((("send_hour" >= 0) AND ("send_hour" <= 23))),
    CONSTRAINT "email_series_send_weekday_check" CHECK ((("send_weekday" >= 0) AND ("send_weekday" <= 6)))
);


CREATE TABLE "company_os"."email_agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "brand_id" "uuid",
    "audience_id" "uuid" NOT NULL,
    "from_email" "text",
    "reply_to" "text",
    "sources" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cadence_days" integer DEFAULT 14 NOT NULL,
    "send_hour" smallint DEFAULT 8 NOT NULL,
    "review_mode" "text" DEFAULT 'sample'::"text" NOT NULL,
    "sample_size" integer DEFAULT 5 NOT NULL,
    "max_words" integer DEFAULT 150 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "email_agents_cadence_days_check" CHECK ((("cadence_days" >= 1) AND ("cadence_days" <= 365))),
    CONSTRAINT "email_agents_max_words_check" CHECK ((("max_words" >= 20) AND ("max_words" <= 2000))),
    CONSTRAINT "email_agents_review_mode_check" CHECK (("review_mode" = ANY (ARRAY['hold_all'::"text", 'sample'::"text"]))),
    CONSTRAINT "email_agents_sample_size_check" CHECK ((("sample_size" >= 1) AND ("sample_size" <= 100))),
    CONSTRAINT "email_agents_send_hour_check" CHECK ((("send_hour" >= 0) AND ("send_hour" <= 23)))
);


CREATE TABLE "company_os"."email_agent_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "body_md" "text" NOT NULL,
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_agent_skills_version_check" CHECK (("version" >= 1))
);


CREATE TABLE "company_os"."email_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "skill_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "routine_run_id" "uuid",
    "status" "text" DEFAULT 'drafted'::"text" NOT NULL,
    "hold_reason" "text",
    "skip_reason" "text",
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "body_md" "text" DEFAULT ''::"text" NOT NULL,
    "facts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "edited_at" timestamp with time zone,
    "approved_by" "text",
    "approved_at" timestamp with time zone,
    "send_after" timestamp with time zone,
    "claimed_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "resend_email_id" "text",
    "error" "text",
    "interaction_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_messages_status_check" CHECK (("status" = ANY (ARRAY['drafted'::"text", 'held'::"text", 'approved'::"text", 'sending'::"text", 'sent'::"text", 'skipped'::"text", 'cancelled'::"text"])))
);


CREATE TABLE "company_os"."email_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "preheader" "text",
    "body_md" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "segment" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "from_email" "text",
    "reply_to" "text",
    "batch_size" integer DEFAULT 150 NOT NULL,
    "scheduled_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "approved_by" "text",
    "sent_at" timestamp with time zone,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "brand_id" "uuid",
    "blocks" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "agent_step" "text",
    "agent_error" "text",
    "agent_started_at" timestamp with time zone,
    "agent_notes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "summary_posted_at" timestamp with time zone,
    "audience_id" "uuid",
    "series_id" "uuid",
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    CONSTRAINT "email_campaigns_batch_size_check" CHECK ((("batch_size" >= 1) AND ("batch_size" <= 1000))),
    CONSTRAINT "email_campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'sending'::"text", 'sent'::"text", 'cancelled'::"text", 'missed'::"text"])))
);


--
-- Name: email_events; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."email_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resend_email_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "recipient" "text" NOT NULL,
    "person_id" "uuid",
    "campaign_id" "uuid",
    "subject" "text",
    "occurred_at" timestamp with time zone NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "svix_id" "text",
    "message_id" "uuid",
    CONSTRAINT "email_events_type_check" CHECK (("event_type" = ANY (ARRAY['sent'::"text", 'delivered'::"text", 'delivery_delayed'::"text", 'bounced'::"text", 'complained'::"text", 'opened'::"text", 'clicked'::"text", 'failed'::"text"])))
);


--
-- Name: equipment_asset_tag_seq; Type: SEQUENCE; Schema: company_os; Owner: -
--

CREATE SEQUENCE "company_os"."equipment_asset_tag_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipment; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_tag" "text" DEFAULT ('EQ-'::"text" || "lpad"(("nextval"('"company_os"."equipment_asset_tag_seq"'::"regclass"))::"text", 4, '0'::"text")) NOT NULL,
    "type" "text" DEFAULT 'other'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "brand" "text",
    "model" "text",
    "serial_number" "text",
    "processor" "text",
    "ram" "text",
    "storage" "text",
    "screen_size" numeric(4,1),
    "purchase_date" "date",
    "model_year" integer,
    "vendor_id" "uuid",
    "vendor_name_raw" "text",
    "invoice_ref" "text",
    "cost_vnd" numeric(14,2),
    "cost_usd" numeric(12,2),
    "status" "text" DEFAULT 'in_stock'::"text" NOT NULL,
    "condition" "text",
    "current_holder_id" "uuid",
    "notes" "text",
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    CONSTRAINT "equipment_condition_check" CHECK ((("condition" IS NULL) OR ("condition" = ANY (ARRAY['new'::"text", 'good'::"text", 'fair'::"text", 'damaged'::"text"])))),
    CONSTRAINT "equipment_status_check" CHECK (("status" = ANY (ARRAY['in_use'::"text", 'in_stock'::"text", 'in_repair'::"text", 'lost'::"text", 'retired'::"text", 'sold'::"text"]))),
    CONSTRAINT "equipment_type_check" CHECK (("type" = ANY (ARRAY['laptop'::"text", 'desktop'::"text", 'monitor'::"text", 'keyboard'::"text", 'mouse'::"text", 'phone'::"text", 'tablet'::"text", 'headset'::"text", 'dock'::"text", 'printer'::"text", 'accessory'::"text", 'other'::"text"])))
);


--
-- Name: equipment_assignments; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."equipment_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "assigned_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "returned_at" "date",
    "condition_out" "text",
    "condition_in" "text",
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipment_assignments_condition_in_check" CHECK ((("condition_in" IS NULL) OR ("condition_in" = ANY (ARRAY['new'::"text", 'good'::"text", 'fair'::"text", 'damaged'::"text"])))),
    CONSTRAINT "equipment_assignments_condition_out_check" CHECK ((("condition_out" IS NULL) OR ("condition_out" = ANY (ARRAY['new'::"text", 'good'::"text", 'fair'::"text", 'damaged'::"text"])))),
    CONSTRAINT "equipment_assignments_dates_ck" CHECK ((("returned_at" IS NULL) OR ("returned_at" >= "assigned_at")))
);


--
-- Name: equipment_requests; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."equipment_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "reason" "text",
    "needed_by" "date",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "decided_by" "text",
    "decided_at" timestamp with time zone,
    "decision_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipment_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text", 'fulfilled'::"text"]))),
    CONSTRAINT "equipment_requests_type_check" CHECK (("type" = ANY (ARRAY['laptop'::"text", 'desktop'::"text", 'monitor'::"text", 'keyboard'::"text", 'mouse'::"text", 'phone'::"text", 'tablet'::"text", 'headset'::"text", 'dock'::"text", 'printer'::"text", 'accessory'::"text", 'other'::"text"])))
);


--
-- Name: event_agenda_blocks; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."event_agenda_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "day_index" integer DEFAULT 1 NOT NULL,
    "day_label" "text",
    "day_date" "date",
    "period" "text",
    "time_label" "text",
    "title" "text" NOT NULL,
    "body" "text",
    "room" "text",
    "guest_visible" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_agenda_blocks_period_check" CHECK (("period" = ANY (ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text"])))
);


--
-- Name: TABLE "event_agenda_blocks"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."event_agenda_blocks" IS 'Structured retreat agenda blocks behind the event Agenda tab. One set of blocks drives both the guest "My Retreat" itinerary (guest_visible) and the internal ops work schedule. Service-role only.';


--
-- Name: event_agenda_staff; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."event_agenda_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "block_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'other'::"text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_agenda_staff_role_check" CHECK (("role" = ANY (ARRAY['lead'::"text", 'engineer'::"text", 'driver'::"text", 'maid'::"text", 'host'::"text", 'other'::"text"])))
);


--
-- Name: TABLE "event_agenda_staff"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."event_agenda_staff" IS 'Which staff work each agenda block (the work-schedule half of the agenda). Ops-only: never surfaced to the guest hub. Carries no wages — the P&L flat $150/day covers cost.';


--
-- Name: event_pnl_lines; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."event_pnl_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "side" "text" NOT NULL,
    "classification" "text" NOT NULL,
    "description" "text",
    "person_id" "uuid",
    "attendees" integer,
    "staff_days" numeric(6,2),
    "estimated_cents" bigint,
    "estimated_currency" "text",
    "estimated_usd_cents" bigint,
    "actual_cents" bigint,
    "actual_currency" "text",
    "actual_usd_cents" bigint,
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "note" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_pnl_lines_classification_check" CHECK (("classification" = ANY (ARRAY['accommodation'::"text", 'staff_cost'::"text", 'venue'::"text", 'transportation'::"text", 'food_beverage'::"text", 'equipment'::"text", 'visa'::"text", 'commission'::"text", 'stripe_fee'::"text", 'retreat'::"text", 'human_tokens'::"text", 'mac_mini'::"text", 'other'::"text"]))),
    CONSTRAINT "event_pnl_lines_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'to_be_paid'::"text", 'paid'::"text"]))),
    CONSTRAINT "event_pnl_lines_side_check" CHECK (("side" = ANY (ARRAY['revenue'::"text", 'expense'::"text"])))
);


--
-- Name: TABLE "event_pnl_lines"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."event_pnl_lines" IS 'Per-retreat P&L line items (revenue + expense) behind the event P&L tab. Native amount is truth; *_usd_cents is derived via fx_rates. Staff lines use a flat $150/day so real wages never leak to ops. Service-role only; hidden from the NL->SQL assistant.';


--
-- Name: event_registrations; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."event_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "product_id" "uuid",
    "person_id" "uuid" NOT NULL,
    "attendee_name" "text",
    "attendee_email" "extensions"."citext",
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_id" "uuid",
    "guest_count" integer DEFAULT 0 NOT NULL,
    "waitlist_position" integer,
    "ticket_code" "text",
    "checked_in_at" timestamp with time zone,
    "confirmation_sent_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "notes" "text",
    CONSTRAINT "event_registrations_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'refunded'::"text", 'pending_payment'::"text", 'registered'::"text", 'waitlisted'::"text", 'cancelled'::"text", 'attended'::"text", 'no_show'::"text"])))
);


--
-- Name: event_talks; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."event_talks" (
    "event_id" "uuid" NOT NULL,
    "talk_id" "uuid" NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "blurb" "text",
    "description" "text",
    "location" "text",
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "timezone" "text" DEFAULT 'Asia/Ho_Chi_Minh'::"text" NOT NULL,
    "capacity" integer,
    "cover_image_url" "text",
    "owner_person_id" "uuid",
    "landing_path" "text",
    "feedback_survey_id" "uuid",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "media" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "attendee_count_override" integer,
    "registered_count_override" integer,
    CONSTRAINT "events_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'open'::"text", 'closed'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "events_type_check" CHECK (("type" = ANY (ARRAY['retreat'::"text", 'workshop'::"text", 'webinar'::"text", 'micro_session'::"text", 'dinner'::"text", 'private_trip'::"text", 'company_event'::"text", 'keynote'::"text"]))),
    CONSTRAINT "events_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text", 'internal'::"text"])))
);


--
-- Name: COLUMN "events"."registered_count_override"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."events"."registered_count_override" IS 'Manual override for the admin "registered" count. Used for events measured by headcount rather than a registration list. Null => derive from event_registrations.';


--
-- Name: expenses; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_id" "uuid",
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "category" "text",
    "incurred_on" "date",
    "description" "text",
    "paid" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'quickbooks'::"text" NOT NULL,
    "external_id" "text",
    "txn_type" "text",
    "lines" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "synced_at" timestamp with time zone,
    "company_id" "uuid"
);


--
-- Name: fx_rates; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."fx_rates" (
    "currency" "text" NOT NULL,
    "rate_to_usd" numeric NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fx_rates_rate_to_usd_check" CHECK (("rate_to_usd" > (0)::numeric))
);


--
-- Name: gallery_photo_people; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."gallery_photo_people" (
    "photo_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "tagged_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "gallery_photo_people"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."gallery_photo_people" IS 'Tags linking a gallery photo to the people who appear in it. Powers "photos of <person>" for staff and the team assistant. Self-serve: any team member can tag.';


--
-- Name: gallery_photos; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."gallery_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "image_url" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "caption" "text",
    "taken_on" "date",
    "uploaded_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text",
    CONSTRAINT "gallery_photos_category_check" CHECK ((("category" IS NULL) OR ("category" = ANY (ARRAY['workshops'::"text", 'clients'::"text", 'team'::"text"]))))
);


--
-- Name: TABLE "gallery_photos"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."gallery_photos" IS 'Internal team photo gallery. Public-bucket images; admin-managed, team-visible.';


--
-- Name: goals; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coaching_profile_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description_markdown" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "quarter_label" "text",
    "objective_id" "uuid",
    "key_result_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metric_unit" "text",
    "start_value" numeric,
    "target_value" numeric,
    "current_value" numeric,
    "due_date" "date",
    "created_by" "uuid",
    "stretch_markdown" "text",
    CONSTRAINT "coaching_goals_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'achieved'::"text", 'dropped'::"text"])))
    "letter_md" "text",
    "letter_sealed_on" "date",
);


--
-- Name: holidays; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."holidays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "country" "text",
    "is_company_closure" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: idea_trend_reports; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."idea_trend_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "themes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "source_count" integer DEFAULT 0 NOT NULL,
    "model" "text",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: marketing_recaps; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."marketing_recaps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_month" "date" NOT NULL,
    "readout" "text" NOT NULL,
    "suggestions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "model" "text",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: ideas; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."ideas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "problem" "text",
    "data_needed" "text",
    "workflow" "text",
    "roi" "text",
    "office" "text",
    "ai_plan" "text",
    "ai_model" "text",
    "ai_error" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" DEFAULT 'build'::"text" NOT NULL,
    "story" "text",
    "takeaway" "text",
    "source_urls" "text"[],
    CONSTRAINT "ideas_kind_check" CHECK (("kind" = ANY (ARRAY['build'::"text", 'learning'::"text"]))),
    CONSTRAINT "ideas_office_check" CHECK (("office" = ANY (ARRAY['revenue'::"text", 'talent'::"text", 'operations'::"text", 'innovation'::"text"]))),
    CONSTRAINT "ideas_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'in_review'::"text", 'approved'::"text", 'declined'::"text", 'archived'::"text"])))
);


--
-- Name: inquiries; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."inquiries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'general'::"text" NOT NULL,
    "subject" "text",
    "message" "text",
    "source" "text",
    "source_site" "text",
    "status" "text" DEFAULT 'new_lead'::"text" NOT NULL,
    "deal_id" "uuid",
    "affiliate_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "campaign_id" "uuid",
    CONSTRAINT "inquiries_status_check" CHECK (("status" = ANY (ARRAY['new_lead'::"text", 'contacted'::"text", 'qualified'::"text", 'discovery_call'::"text", 'proposal'::"text", 'won'::"text", 'lost'::"text", 'nurture'::"text", 'no_action'::"text", 'spam'::"text", 'archived'::"text"]))),
    CONSTRAINT "inquiries_type_check" CHECK (("type" = ANY (ARRAY['general'::"text", 'keynote'::"text", 'consultation'::"text", 'coaching'::"text", 'retreat'::"text", 'newsletter'::"text", 'trip'::"text", 'service'::"text", 'partnership'::"text", 'checkout'::"text", 'other'::"text"])))
);


--
-- Name: integration_sources; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."integration_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text",
    "base_url" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: interactions; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" DEFAULT 'note'::"text" NOT NULL,
    "subject" "text",
    "body" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_id" "uuid",
    "person_id" "uuid",
    "company_id" "uuid",
    "subject_type" "text",
    "subject_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text",
    CONSTRAINT "interactions_category_check" CHECK ((("category" IS NULL) OR ("category" = ANY (ARRAY['workboard'::"text", 'one_on_one'::"text", 'goals'::"text", 'reviews'::"text", 'onboarding'::"text", 'people_ops'::"text", 'client'::"text", 'marketing'::"text", 'account'::"text", 'other'::"text"])))),
    CONSTRAINT "interactions_check" CHECK ((("person_id" IS NOT NULL) OR ("company_id" IS NOT NULL) OR ("subject_id" IS NOT NULL) OR (("kind" = ANY (ARRAY['lark'::"text", 'whatsapp'::"text"])) AND ("metadata" ? 'chat'::"text")))),
    CONSTRAINT "interactions_kind_check" CHECK (("kind" = ANY (ARRAY['note'::"text", 'call'::"text", 'email'::"text", 'meeting'::"text", 'message'::"text", 'status_change'::"text", 'system'::"text", 'lark'::"text", 'whatsapp'::"text", 'collections'::"text"])))
);


--
-- Name: interview_interviewers; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."interview_interviewers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "interview_id" "uuid" NOT NULL,
    "interviewer_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'interviewer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "interview_interviewers_role_check" CHECK (("role" = ANY (ARRAY['lead'::"text", 'interviewer'::"text", 'shadow'::"text", 'observer'::"text"])))
);


--
-- Name: interview_scorecards; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."interview_scorecards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "interview_id" "uuid" NOT NULL,
    "interviewer_id" "uuid" NOT NULL,
    "recommendation" "text",
    "overall_score" numeric(4,2),
    "summary" "text",
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "interview_scorecards_recommendation_check" CHECK ((("recommendation" IS NULL) OR ("recommendation" = ANY (ARRAY['strong_yes'::"text", 'yes'::"text", 'neutral'::"text", 'no'::"text", 'strong_no'::"text"]))))
);


--
-- Name: interviews; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."interviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "application_stage_id" "uuid",
    "meeting_id" "uuid",
    "title" "text",
    "mode" "text" DEFAULT 'video'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "duration_minutes" integer,
    "location" "text",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "loop_step_id" "uuid",
    "lark_event_id" "text",
    CONSTRAINT "interviews_mode_check" CHECK (("mode" = ANY (ARRAY['phone'::"text", 'video'::"text", 'onsite'::"text", 'take_home'::"text", 'panel'::"text"]))),
    CONSTRAINT "interviews_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'completed'::"text", 'cancelled'::"text", 'no_show'::"text", 'rescheduled'::"text"])))
);


--
-- Name: invoices; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "source" "text" DEFAULT 'quickbooks'::"text" NOT NULL,
    "external_id" "text" NOT NULL,
    "doc_number" "text",
    "txn_date" "date" NOT NULL,
    "due_date" "date",
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "balance_cents" bigint DEFAULT 0 NOT NULL,
    "status" "text" NOT NULL,
    "memo" "text",
    "payment_link" "text",
    "lines" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_name" "text",
    "customer_id" "text",
    "entity" "text" DEFAULT 'edge8'::"text" NOT NULL,
    "deal_id" "uuid",
    "kind" "text",
    "amount_usd_cents" bigint,
    "balance_usd_cents" bigint,
    "fx_rate" numeric,
    CONSTRAINT "invoices_kind_check" CHECK (("kind" = ANY (ARRAY['recurring'::"text", 'project'::"text"]))),
    CONSTRAINT "invoices_entity_check" CHECK (("entity" = ANY (ARRAY['edge8'::"text", 'aio'::"text"])))
);


--
-- Name: issues; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "diagnosis" "text" DEFAULT 'system'::"text" NOT NULL,
    "key_result_id" "uuid",
    "filed_by" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "notes_md" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "assignee_person_id" "uuid",
    CONSTRAINT "issues_diagnosis_check" CHECK (("diagnosis" = ANY (ARRAY['goal'::"text", 'system'::"text", 'execution'::"text"]))),
    CONSTRAINT "issues_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'solving'::"text", 'solved'::"text", 'dropped'::"text"])))
);


--
-- Name: job_requisitions; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."job_requisitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_company_id" "uuid",
    "department_id" "uuid",
    "position_id" "uuid",
    "title" "text" NOT NULL,
    "headcount" integer DEFAULT 1 NOT NULL,
    "employment_type" "text" DEFAULT 'full_time'::"text" NOT NULL,
    "location" "text",
    "remote_policy" "text",
    "salary_min_cents" bigint,
    "salary_max_cents" bigint,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "hiring_manager_id" "uuid",
    "recruiter_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "opened_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "candidate_ranking" "text",
    "requirements" "text",
    "responsibilities" "text",
    "full_jd" "text",
    "slug" "text",
    "is_public" boolean DEFAULT false NOT NULL,
    "application_questions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "chain_step" "text",
    "chain_started_at" timestamp with time zone,
    "chain_error" "text",
    CONSTRAINT "job_requisitions_check1" CHECK ((("salary_max_cents" IS NULL) OR ("salary_min_cents" IS NULL) OR ("salary_max_cents" >= "salary_min_cents"))),
    CONSTRAINT "job_requisitions_employment_type_check" CHECK (("employment_type" = ANY (ARRAY['full_time'::"text", 'part_time'::"text", 'contract'::"text", 'intern'::"text", 'temp'::"text", 'advisor'::"text"]))),
    CONSTRAINT "job_requisitions_remote_policy_check" CHECK ((("remote_policy" IS NULL) OR ("remote_policy" = ANY (ARRAY['onsite'::"text", 'hybrid'::"text", 'remote'::"text"])))),
    CONSTRAINT "job_requisitions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'on_hold'::"text", 'filled'::"text", 'cancelled'::"text", 'closed'::"text"])))
);


--
-- Name: key_results; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."key_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "objective_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "target_value" numeric,
    "current_value" numeric DEFAULT 0 NOT NULL,
    "unit" "text",
    "direction" "text" DEFAULT 'up'::"text" NOT NULL,
    "delivery_mix" "text" DEFAULT 'human'::"text" NOT NULL,
    "accountable_person_id" "uuid" NOT NULL,
    "executing_agent" "text",
    "status" "text" DEFAULT 'on_track'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_detail" "text",
    CONSTRAINT "key_results_delivery_mix_check" CHECK (("delivery_mix" = ANY (ARRAY['human'::"text", 'ai'::"text", 'blended'::"text"]))),
    CONSTRAINT "key_results_direction_check" CHECK (("direction" = ANY (ARRAY['up'::"text", 'down'::"text"]))),
    CONSTRAINT "key_results_source_check" CHECK (("source" = ANY (ARRAY['agent'::"text", 'manual'::"text"]))),
    CONSTRAINT "key_results_status_check" CHECK (("status" = ANY (ARRAY['on_track'::"text", 'at_risk'::"text", 'off_track'::"text", 'done'::"text"])))
);


--
-- Name: kr_logs; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."kr_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key_result_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "value" numeric,
    "note_md" "text",
    "author_kind" "text" NOT NULL,
    "author_agent" "text",
    "author_person_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kr_logs_author_kind_check" CHECK (("author_kind" = ANY (ARRAY['agent'::"text", 'human'::"text"]))),
    CONSTRAINT "kr_logs_author_required" CHECK (((("author_kind" = 'agent'::"text") AND ("author_agent" IS NOT NULL)) OR (("author_kind" = 'human'::"text") AND ("author_person_id" IS NOT NULL))))
);


--
-- Name: lead; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."lead" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "sla_due_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "disqualified_reason" "text",
    "owner_id" "uuid",
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pinned_at" timestamp with time zone
);


--
-- Name: leave_adjustments; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."leave_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_member_id" "uuid" NOT NULL,
    "leave_type" "text" NOT NULL,
    "delta_days" numeric NOT NULL,
    "kind" "text" NOT NULL,
    "reason" "text",
    "effective_date" "date" NOT NULL,
    "source" "text",
    "external_key" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leave_adjustments_kind_check" CHECK (("kind" = ANY (ARRAY['opening_balance'::"text", 'carryover'::"text", 'comp'::"text", 'correction'::"text"]))),
    CONSTRAINT "leave_adjustments_leave_type_check" CHECK (("leave_type" = ANY (ARRAY['vacation'::"text", 'sick'::"text", 'personal'::"text", 'parental'::"text", 'bereavement'::"text", 'unpaid'::"text", 'public_holiday'::"text", 'other'::"text"])))
);


--
-- Name: legal_entities; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."legal_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "legal_name" "text",
    "country" "text",
    "entity_type" "text",
    "base_currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "tax_id" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: lifecycle_transitions; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."lifecycle_transitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid",
    "from_stage" "text",
    "to_stage" "text",
    "from_status" "text",
    "to_status" "text",
    "reason" "text",
    "note" "text",
    "changed_by" "uuid",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_id" "uuid",
    CONSTRAINT "lifecycle_transitions_scope_check" CHECK ((("person_id" IS NOT NULL) OR ("company_id" IS NOT NULL)))
);


--
-- Name: marketing_asset_images; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."marketing_asset_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "prompt_used" "text",
    "model" "text",
    "is_selected" boolean DEFAULT false NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: marketing_campaigns; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."marketing_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "uuid",
    "pillar_id" "uuid",
    "name" "text" NOT NULL,
    "objective" "text",
    "seo_geo_md" "text",
    "starts_on" "date",
    "ends_on" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idea" "text",
    "writer_step" "text",
    "writer_started_at" timestamp with time zone,
    "writer_error" "text",
    "utm_campaign" "text",
    CONSTRAINT "marketing_campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'done'::"text", 'archived'::"text"]))),
    CONSTRAINT "marketing_campaigns_writer_step_check" CHECK ((("writer_step" IS NULL) OR ("writer_step" = ANY (ARRAY['draft'::"text", 'edit'::"text", 'seo'::"text", 'exhibits'::"text", 'hero'::"text", 'links'::"text", 'assemble'::"text", 'validate'::"text", 'ready'::"text"]))))
);


--
-- Name: marketing_content; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."marketing_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "brand_id" "uuid",
    "pillar" "text",
    "channel" "text" NOT NULL,
    "status" "text" DEFAULT 'idea'::"text" NOT NULL,
    "publish_date" "date",
    "parent_id" "uuid",
    "copy_md" "text",
    "asset_url" "text",
    "notes" "text",
    "sort_order" double precision DEFAULT 0 NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pillar_id" "uuid",
    "posted_url" "text",
    "blog_style" "text",
    "image_type" "text",
    "seo_md" "text",
    "image_brief_md" "text",
    "image_style" "text",
    "social_style" "text",
    "image_url" "text",
    "broadcast_id" "uuid",
    "campaign_id" "uuid",
    "slug" "text",
    "title_tag" "text",
    "meta_description" "text",
    "excerpt" "text",
    "primary_keyword" "text",
    "category" "text",
    "category_slug" "text",
    "read_time" "text",
    "published_at" timestamp with time zone,
    "body_html" "text",
    CONSTRAINT "marketing_calendar_image_type_check" CHECK ((("image_type" IS NULL) OR ("image_type" = ANY (ARRAY['real'::"text", 'ai'::"text", 'mixed'::"text", 'none'::"text"])))),
    CONSTRAINT "marketing_content_channel_check" CHECK (("channel" = ANY (ARRAY['blog'::"text", 'email'::"text", 'linkedin'::"text", 'facebook'::"text", 'twitter'::"text"]))),
    CONSTRAINT "marketing_content_status_check" CHECK (("status" = ANY (ARRAY['idea'::"text", 'drafted'::"text", 'approved'::"text", 'scheduled'::"text", 'published'::"text", 'skipped'::"text"])))
);


--
-- Name: marketing_pillars; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."marketing_pillars" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: meeting_action_items; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."meeting_action_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "detail" "text",
    "assignee_id" "uuid",
    "due_date" "date",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "origin" "text",
    "owner_side" "text" CHECK (("owner_side" = ANY (ARRAY['edge8'::"text", 'client'::"text", 'unclear'::"text"]))),
    "owner_name" "text",
    "evidence" "text",
    "file_state" "text" CHECK (("file_state" = ANY (ARRAY['proposed'::"text", 'to_file'::"text", 'filed'::"text", 'needs_board'::"text", 'client'::"text", 'dismissed'::"text"]))),
    "file_note" "text",
    "task_id" "uuid",
    "shadow_mark" "text" CHECK (("shadow_mark" = ANY (ARRAY['useful'::"text", 'not_useful'::"text"]))),
    CONSTRAINT "meeting_action_items_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'done'::"text", 'dropped'::"text"])))
);


--
-- Name: meeting_associations; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."meeting_associations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meeting_links_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['deal'::"text", 'company'::"text", 'project'::"text", 'inquiry'::"text", 'person'::"text"])))
);


--
-- Name: meeting_participants; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."meeting_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "person_id" "uuid",
    "external_email" "extensions"."citext",
    "display_name" "text",
    "role" "text" DEFAULT 'attendee'::"text" NOT NULL,
    "attended" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meeting_participants_role_check" CHECK (("role" = ANY (ARRAY['host'::"text", 'attendee'::"text", 'optional'::"text", 'absent'::"text"])))
);


--
-- Name: meetings; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "external_id" "text",
    "title" "text",
    "meeting_type" "text",
    "summary" "text",
    "summary_encrypted" boolean DEFAULT false NOT NULL,
    "summary_ciphertext" "text",
    "transcript_url" "text",
    "recording_url" "text",
    "minutes_url" "text",
    "owner_id" "uuid",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "duration_seconds" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_id" "uuid",
    "attendees" "text"[],
    "published_at" timestamp with time zone,
    "ai_status" "text",
    "ai_error" "text",
    "ai_model" "text",
    "source_file_path" "text",
    "source_file_name" "text",
    "created_by" "text",
    "archived_at" timestamp with time zone,
    "ai_program_id" "uuid",
    CONSTRAINT "meetings_source_check" CHECK (("source" = ANY (ARRAY['lark'::"text", 'thoughtflow'::"text", 'manual'::"text", 'zoom'::"text", 'google'::"text", 'other'::"text", 'notes'::"text", 'coaching'::"text", 'review'::"text"])))
);


--
-- Name: COLUMN "meetings"."ai_program_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."meetings"."ai_program_id" IS 'Optional AI Program tag; NULL = company-wide meeting.';


--
-- Name: notification_prefs; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."notification_prefs" (
    "person_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "muted" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_prefs_pkey" PRIMARY KEY ("person_id", "kind"),
    CONSTRAINT "notification_prefs_kind_check" CHECK (("kind" = ANY (ARRAY['card.completed'::"text", 'card.set_aside'::"text", 'subtask.done'::"text", 'leave.approved'::"text", 'leave.withdrawn'::"text", 'hire.made'::"text", 'deal.won'::"text", 'invoice.paid'::"text"])))
);


--
-- Name: notifications; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "admin_href" "text",
    "team_href" "text",
    "event_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_person_id_kind_event_key_key" UNIQUE ("person_id", "kind", "event_key"),
    CONSTRAINT "notifications_title_check" CHECK (("btrim"("title") <> ''::"text")),
    CONSTRAINT "notifications_kind_check" CHECK (("kind" = ANY (ARRAY['card.completed'::"text", 'card.set_aside'::"text", 'subtask.done'::"text", 'leave.approved'::"text", 'leave.withdrawn'::"text", 'hire.made'::"text", 'deal.won'::"text", 'invoice.paid'::"text"])))
);


--
-- Name: notification_reads; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."notification_reads" (
    "notification_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id")
);


--
-- Name: objectives; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."objectives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "strategy_id" "uuid",
    "level" "text" NOT NULL,
    "office" "text",
    "business_line" "text",
    "parent_kr_id" "uuid",
    "quarter" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "owner_person_id" "uuid",
    "owner_agent" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "brand" "text",
    "year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer NOT NULL,
    CONSTRAINT "objectives_brand_check" CHECK (("brand" = ANY (ARRAY['edge8'::"text", 'aio'::"text"]))),
    CONSTRAINT "objectives_business_line_check" CHECK (("business_line" = ANY (ARRAY['staffing'::"text", 'ai_programs'::"text"]))),
    CONSTRAINT "objectives_cascade_link" CHECK ((("level" = 'company'::"text") OR ("parent_kr_id" IS NOT NULL))),
    CONSTRAINT "objectives_level_check" CHECK (("level" = ANY (ARRAY['company'::"text", 'office'::"text", 'executor'::"text"]))),
    CONSTRAINT "objectives_office_check" CHECK (("office" = ANY (ARRAY['revenue'::"text", 'talent'::"text", 'operations'::"text", 'innovation'::"text"]))),
    CONSTRAINT "objectives_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'done'::"text", 'dropped'::"text"])))
);


--
-- Name: offers; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "position_id" "uuid",
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "pay_period" "text" DEFAULT 'annual'::"text" NOT NULL,
    "bonus_cents" bigint,
    "equity_note" "text",
    "start_date" "date",
    "expires_at" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "approved_by" "uuid",
    "contract_document_id" "uuid",
    "sent_at" timestamp with time zone,
    "responded_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "offers_pay_period_check" CHECK (("pay_period" = ANY (ARRAY['annual'::"text", 'monthly'::"text", 'biweekly'::"text", 'weekly'::"text", 'hourly'::"text", 'one_time'::"text"]))),
    CONSTRAINT "offers_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'sent'::"text", 'accepted'::"text", 'declined'::"text", 'rescinded'::"text", 'expired'::"text"])))
);


--
-- Name: onboarding_plans; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."onboarding_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_member_id" "uuid" NOT NULL,
    "stage" "text" DEFAULT 'preboarding'::"text" NOT NULL,
    "plan_uploaded_by" "uuid",
    "plan_uploaded_at" timestamp with time zone,
    "day8_survey_sent_at" timestamp with time zone,
    "day8_response_id" "uuid",
    "day45_email_sent_at" timestamp with time zone,
    "decision" "text",
    "decision_at" timestamp with time zone,
    "decision_by" "uuid",
    "day60_promoted_at" timestamp with time zone,
    "day180_email_sent_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plan_url" "text",
    "plan_path" "text",
    CONSTRAINT "onboarding_plans_decision_check" CHECK (("decision" = ANY (ARRAY['offer_full_time'::"text", 'extend_probation_30'::"text", 'terminate'::"text"]))),
    CONSTRAINT "onboarding_plans_stage_check" CHECK (("stage" = ANY (ARRAY['preboarding'::"text", 'day_1'::"text", 'day_8'::"text", 'day_45'::"text", 'day_60'::"text", 'day_180'::"text", 'complete'::"text"])))
);


--
-- Name: onboarding_tasks; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."onboarding_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_member_id" "uuid",
    "application_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "assignee_id" "uuid",
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "due_date" "date",
    "completed_at" timestamp with time zone,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_tasks_check" CHECK ((("team_member_id" IS NOT NULL) OR ("application_id" IS NOT NULL))),
    CONSTRAINT "onboarding_tasks_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'in_progress'::"text", 'done'::"text", 'blocked'::"text", 'skipped'::"text"])))
);


--
-- Name: orders; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "payment_method" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "stripe_session_id" "text",
    "stripe_payment_intent_id" "text",
    "stripe_customer_id" "text",
    "amount_cents" bigint DEFAULT 0 NOT NULL,
    "tax_cents" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "seat_hold_expires_at" timestamp with time zone,
    "refunded_cents" bigint DEFAULT 0 NOT NULL,
    "affiliate_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "amount_usd_cents" bigint,
    "stripe_fee_cents" bigint,
    "fx_rate" numeric,
    "vnd_amount" bigint,
    CONSTRAINT "orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['stripe'::"text", 'offline_vn'::"text", 'manual'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'awaiting_offline_payment'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text", 'partial_refund'::"text", 'expired'::"text"])))
);


--
-- Name: people_sensitive; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."people_sensitive" (
    "person_id" "uuid" NOT NULL,
    "date_of_birth" "date",
    "national_id_number" "text",
    "national_id_issue_date" "date",
    "national_id_issue_place" "text",
    "permanent_address" "text",
    "current_address" "text",
    "marital_status" "text",
    "bank_name" "text",
    "bank_account_number" "text",
    "bank_branch" "text",
    "tax_code" "text",
    "social_insurance_number" "text",
    "id_front_path" "text",
    "id_back_path" "text",
    "id_selfie_path" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "place_of_birth" "text",
    "native_province" "text"
);


--
-- Name: TABLE "people_sensitive"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."people_sensitive" IS 'Restricted legal/payroll PII. Service-role + admin-audited UI only. Explicitly hidden from chatbot_reader. Never join into directory/portal reads.';


--
-- Name: people_with_deals; Type: VIEW; Schema: company_os; Owner: -
--

CREATE VIEW "company_os"."people_with_deals" AS
 SELECT "p"."id",
    "p"."email",
    "p"."full_name",
    "p"."first_name",
    "p"."last_name",
    "p"."preferred_name",
    "p"."phone",
    "p"."avatar_url",
    "p"."country",
    "p"."timezone",
    "p"."is_team_member",
    "p"."do_not_contact",
    "p"."owner_id",
    "p"."source",
    "p"."auth_user_id",
    "p"."notes",
    "p"."created_at",
    "p"."updated_at",
    "p"."gender",
    "p"."persona",
    "p"."linkedin_url",
    "p"."city",
    "p"."state_province",
    "p"."metadata",
    "p"."archived_at",
    "p"."archived_by",
        CASE
            WHEN (COALESCE("d"."won_count", (0)::bigint) > 0) THEN 'customer'::"text"
            WHEN ("l"."person_id" IS NOT NULL) THEN 'lead'::"text"
            ELSE 'none'::"text"
        END AS "lifecycle_stage",
    "l"."status" AS "lead_status",
    "l"."disqualified_reason",
    COALESCE("d"."deal_value_usd_cents", (0)::numeric) AS "deal_value_usd_cents",
    COALESCE("d"."deal_count", (0)::bigint) AS "deal_count"
   FROM (("company_os"."people" "p"
     LEFT JOIN "company_os"."lead" "l" ON (("l"."person_id" = "p"."id")))
     LEFT JOIN ( SELECT "deals"."person_id",
            "sum"("deals"."amount_usd_cents") FILTER (WHERE ("deals"."status" = ANY (ARRAY['open'::"text", 'won'::"text"]))) AS "deal_value_usd_cents",
            "count"(*) AS "deal_count",
            "count"(*) FILTER (WHERE ("deals"."status" = 'won'::"text")) AS "won_count"
           FROM "company_os"."deals"
          WHERE (("deals"."person_id" IS NOT NULL) AND ("deals"."archived_at" IS NULL))
          GROUP BY "deals"."person_id") "d" ON (("d"."person_id" = "p"."id")));


--
-- Name: performance_reviews; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."performance_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_member_id" "uuid" NOT NULL,
    "reviewer_id" "uuid",
    "cycle_label" "text",
    "review_type" "text" DEFAULT 'manager'::"text" NOT NULL,
    "period_start" "date",
    "period_end" "date",
    "overall_rating" "text",
    "rating_scale" "text",
    "summary" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "submitted_at" timestamp with time zone,
    "acknowledged_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rater_kind" "text" DEFAULT 'manager'::"text" NOT NULL,
    "ratings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "achievements" "text",
    "improvements" "text",
    "comments" "text",
    "decision" "text",
    "keeper" boolean,
    "source" "text" DEFAULT 'portal'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reviewer_email" "text",
    "reviewer_name" "text",
    "access_token" "text",
    "link_sent_at" timestamp with time zone,
    CONSTRAINT "performance_reviews_decision_check" CHECK ((("decision" IS NULL) OR ("decision" = ANY (ARRAY['continue_to_contract'::"text", 'extend_probation'::"text", 'discontinue'::"text", 'renew'::"text", 'renew_with_changes'::"text", 'do_not_renew'::"text", 'promotion'::"text"])))),
    CONSTRAINT "performance_reviews_overall_rating_check" CHECK ((("overall_rating" IS NULL) OR ("overall_rating" = ANY (ARRAY['exceptional'::"text", 'exceeds'::"text", 'meets'::"text", 'partially_meets'::"text", 'below'::"text"])))),
    CONSTRAINT "performance_reviews_rater_kind_check" CHECK (("rater_kind" = ANY (ARRAY['self'::"text", 'manager'::"text", 'reviewer'::"text", 'external'::"text"]))),
    CONSTRAINT "performance_reviews_review_type_check" CHECK (("review_type" = ANY (ARRAY['probation'::"text", 'midyear'::"text", 'renewal'::"text", 'adhoc'::"text", 'annual'::"text"]))),
    CONSTRAINT "performance_reviews_source_check" CHECK (("source" = ANY (ARRAY['portal'::"text", 'lark_import'::"text"]))),
    CONSTRAINT "performance_reviews_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'draft'::"text", 'submitted'::"text", 'finalized'::"text", 'acknowledged'::"text"])))
);


--
-- Name: person_companies; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."person_companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'employee'::"text" NOT NULL,
    "title" "text",
    "is_primary" boolean DEFAULT false NOT NULL,
    "ownership_pct" numeric(5,2),
    "start_date" "date",
    "end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "person_companies_role_check" CHECK (("role" = ANY (ARRAY['owner_founder'::"text", 'executive'::"text", 'employee'::"text", 'primary'::"text", 'secondary'::"text", 'board'::"text", 'advisor'::"text", 'other'::"text"])))
);


--
-- Name: person_git_emails; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."person_git_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "git_email" "extensions"."citext" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "person_git_emails_source_check" CHECK (("source" = ANY (ARRAY['intake'::"text", 'discovered'::"text", 'manual'::"text"])))
);


--
-- Name: person_qualifications; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."person_qualifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "goal" "text",
    "plan" "text",
    "challenge" "text",
    "timeline" "text",
    "budget" "text",
    "authority" "text",
    "captured_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: pipeline_stages; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."pipeline_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_won" boolean DEFAULT false NOT NULL,
    "is_lost" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_probability" integer,
    CONSTRAINT "pipeline_stages_default_probability_check" CHECK ((("default_probability" >= 0) AND ("default_probability" <= 100)))
);


--
-- Name: pipelines; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."pipelines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'sales'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pipelines_kind_check" CHECK (("kind" = ANY (ARRAY['sales'::"text", 'coaching'::"text", 'retreat'::"text", 'sponsorship'::"text", 'partnership'::"text", 'other'::"text"])))
);


--
-- Name: portal_assume_sessions; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."portal_assume_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "started_by" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "ended_at" timestamp with time zone,
    "ended_by" "text"
);


--
-- Name: portal_members; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."portal_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "company_id" "uuid",
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "invited_by" "text",
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "portal_members_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'contributor'::"text", 'viewer'::"text", 'affiliate'::"text"])))
);


--
-- Name: COLUMN "portal_members"."role"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."portal_members"."role" IS 'admin | contributor | viewer (company members) or affiliate (person-level referral tier). Enforced in lib/portal/roles.ts.';


--
-- Name: products; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "description" "text",
    "date_start" timestamp with time zone,
    "date_end" timestamp with time zone,
    "location" "text",
    "capacity" integer,
    "cohort_slug" "text",
    "tier" "text",
    "payment_method_local_vn" boolean DEFAULT false NOT NULL,
    "stripe_product_id" "text",
    "stripe_price_id" "text",
    "amount_cents" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service_line_id" "uuid",
    "amount_usd_cents" bigint,
    "event_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "products_type_check" CHECK (("type" = ANY (ARRAY['event'::"text", 'membership'::"text", 'private_sprint'::"text", 'course'::"text", 'service'::"text", 'digital'::"text", 'other'::"text"])))
);


--
-- Name: program_documents; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."program_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ai_program_id" "uuid",
    "storage_path" "text",
    "filename" "text" NOT NULL,
    "size_bytes" bigint,
    "uploaded_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "url" "text",
    CONSTRAINT "program_documents_file_or_link" CHECK ((("storage_path" IS NULL) <> ("url" IS NULL)))
);


--
-- Name: TABLE "program_documents"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."program_documents" IS 'Client documents in the private program-documents bucket, company-owned; ai_program_id is an optional tag.';


--
-- Name: COLUMN "program_documents"."url"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."program_documents"."url" IS 'External link target; set exactly when storage_path is null (link rows).';


--
-- Name: program_plans; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."program_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ai_program_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "method" "text" NOT NULL,
    "brief_html" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_plans_method_check" CHECK (("method" = ANY (ARRAY['upload'::"text", 'chat'::"text"])))
);


--
-- Name: TABLE "program_plans"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."program_plans" IS 'Plans within an AI program: uploaded-doc markers or chatbot-produced 5Ds briefs (brief_html).';


--
-- Name: lark_user_connections; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."lark_user_connections" (
    "team_member_id" "uuid" NOT NULL,
    "open_id" "text" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "access_token_expires_at" timestamp with time zone NOT NULL,
    "refresh_token_expires_at" timestamp with time zone NOT NULL,
    "scope" "text",
    "last_error" "text",
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: qbo_connection; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."qbo_connection" (
    "id" "text" DEFAULT 'edge8'::"text" NOT NULL,
    "realm_id" "text" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "access_token_expires_at" timestamp with time zone NOT NULL,
    "refresh_token_expires_at" timestamp with time zone NOT NULL,
    "environment" "text" DEFAULT 'production'::"text" NOT NULL,
    "connected_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "qbo_connection_environment_check" CHECK (("environment" = ANY (ARRAY['sandbox'::"text", 'production'::"text"])))
);


--
-- Name: requisition_loop_interviewers; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."requisition_loop_interviewers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loop_step_id" "uuid" NOT NULL,
    "interviewer_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: requisition_loop_steps; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."requisition_loop_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_requisition_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "name" "text" NOT NULL,
    "duration_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "requisition_loop_steps_duration_minutes_check" CHECK ((("duration_minutes" IS NULL) OR (("duration_minutes" >= 5) AND ("duration_minutes" <= 480)))),
    CONSTRAINT "requisition_loop_steps_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 120)))
);


--
-- Name: scorecard_scores; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."scorecard_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scorecard_id" "uuid" NOT NULL,
    "criterion" "text" NOT NULL,
    "score" numeric(4,2),
    "weight" numeric(4,2) DEFAULT 1 NOT NULL,
    "comment" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: service_lines; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."service_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "business_unit" "text" NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_lines_business_unit_check" CHECK (("business_unit" = ANY (ARRAY['edge8'::"text", 'aio'::"text"])))
);


--
-- Name: sprints; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."sprints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "goal" "text",
    "starts_on" "date",
    "ends_on" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "closed_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meeting_id" "uuid",
    "focus_improvement" "text",
    "going_well" "text",
    "meeting_summary" "text",
    "week" "text",
    "locked_at" timestamp with time zone
);


--
-- Name: COLUMN "sprints"."meeting_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."sprints"."meeting_id" IS 'Planning/retro meeting attached to this sprint. One meeting can be attached to many sprints (one weekly meeting covers multiple clients).';


--
-- Name: COLUMN "sprints"."focus_improvement"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."sprints"."focus_improvement" IS 'The number one thing we are trying to improve this sprint, from the retrospective.';


--
-- Name: COLUMN "sprints"."going_well"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."sprints"."going_well" IS 'What is going well, summarized from the retrospective.';


--
-- Name: COLUMN "sprints"."meeting_summary"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."sprints"."meeting_summary" IS 'Client-specific summary extracted from the attached meeting notes.';


--
-- Name: staff_assignments; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."staff_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "team_member_id" "uuid" NOT NULL,
    "role_title" "text",
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_visible" boolean DEFAULT true NOT NULL,
    "client_manager_person_id" "uuid"
);


--
-- Name: COLUMN "staff_assignments"."client_manager_person_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."staff_assignments"."client_manager_person_id" IS 'Person at the client who approves this placement''s leave. Null = fall back to the Edge8 manager.';


--
-- Name: strategies; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."strategies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer NOT NULL,
    "title" "text" NOT NULL,
    "body_md" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "affiliate_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'incomplete'::"text", 'incomplete_expired'::"text", 'unpaid'::"text"])))
);


--
-- Name: survey_answers; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."survey_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "response_id" "uuid" NOT NULL,
    "field_id" "uuid" NOT NULL,
    "value" "text",
    "value_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: survey_fields; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."survey_fields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "type" "text" NOT NULL,
    "label" "text" NOT NULL,
    "help_text" "text",
    "required" boolean DEFAULT false NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: survey_list; Type: VIEW; Schema: company_os; Owner: -
--

CREATE VIEW "company_os"."survey_list" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"text" AS "slug",
    NULL::"text" AS "name",
    NULL::"text" AS "description",
    NULL::"text" AS "status",
    NULL::"text" AS "intro_text",
    NULL::"text" AS "thank_you_text",
    NULL::"jsonb" AS "metadata",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::boolean AS "is_anonymous",
    NULL::"text" AS "created_by",
    NULL::timestamp with time zone AS "archived_at",
    NULL::"text" AS "purpose",
    NULL::integer AS "response_count",
    NULL::timestamp with time zone AS "last_response_at";


--
-- Name: survey_responses; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."survey_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "person_id" "uuid",
    "cohort_slug" "text",
    "respondent_name" "text",
    "respondent_email" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "respondent_kind" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: surveys; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."surveys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "intro_text" "text",
    "thank_you_text" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_anonymous" boolean DEFAULT false NOT NULL,
    "created_by" "text",
    "archived_at" timestamp with time zone,
    "purpose" "text"
);


--
-- Name: sync_packets; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."sync_packets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_start" "date" NOT NULL,
    "body_md" "text" NOT NULL,
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: taggables; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."taggables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "label" "text" NOT NULL,
    "color" "text",
    "kind" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: talks; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."talks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: task_comments; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."task_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "author_person_id" "uuid",
    "author_label" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_comment_id" "uuid",
    "resolved_at" timestamp with time zone,
    "resolved_by_person_id" "uuid",
    "resolved_by_label" "text",
    "mentions" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL
);


--
-- Name: task_stage_log; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."task_stage_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "from_column_id" "uuid",
    "to_column_id" "uuid",
    "from_sprint_id" "uuid",
    "to_sprint_id" "uuid",
    "kind" "text" DEFAULT 'move'::"text" NOT NULL,
    "moved_by" "uuid",
    "note" "text",
    "moved_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: deal_stage_log; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."deal_stage_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "from_stage_id" "uuid",
    "to_stage_id" "uuid",
    "kind" "text" DEFAULT 'move'::"text" NOT NULL,
    "moved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "moved_by" "text",
    "note" "text"
);


--
-- Name: TABLE "deal_stage_log"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."deal_stage_log" IS 'One logged stage move of one deal.';


--
-- Name: tasks; Type: TABLE; Schema: company_os; Owner: -
--

--
-- Name: routine_runs; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."routine_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "routine_id" "text" NOT NULL,
    "host" "text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "duration_ms" integer,
    "summary" "text",
    "result" "jsonb",
    "error" "text",
    "log" "text",
    "ai_calls" integer DEFAULT 0 NOT NULL,
    "ai_input_tokens" bigint DEFAULT 0 NOT NULL,
    "ai_output_tokens" bigint DEFAULT 0 NOT NULL,
    "ai_cache_read_tokens" bigint DEFAULT 0 NOT NULL,
    "ai_cache_write_tokens" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tick_key" "text",
    "mode" "text" DEFAULT 'live'::"text" NOT NULL,
    "attempt" integer DEFAULT 1 NOT NULL,
    "workflow_run_id" "text",
    "step_deadline_at" timestamp with time zone,
    CONSTRAINT "routine_runs_host_check" CHECK (("host" = ANY (ARRAY['vercel'::"text", 'mac-mini'::"text"]))),
    CONSTRAINT "routine_runs_mode_check" CHECK (("mode" = ANY (ARRAY['shadow'::"text", 'live'::"text"]))),
    CONSTRAINT "routine_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'waiting'::"text", 'ok'::"text", 'skipped'::"text", 'error'::"text", 'died'::"text"])))
);


ALTER TABLE "company_os"."routine_runs" OWNER TO "postgres";

COMMENT ON TABLE "company_os"."routine_runs" IS 'one execution of one scheduled routine (a Vercel cron or a Mac mini launchd job) with its outcome, result and AI token usage.';

ALTER TABLE ONLY "company_os"."routine_runs" ADD CONSTRAINT "routine_runs_pkey" PRIMARY KEY ("id");

CREATE INDEX "routine_runs_routine_started_idx" ON "company_os"."routine_runs" USING "btree" ("routine_id", "started_at" DESC);

CREATE INDEX "routine_runs_started_idx" ON "company_os"."routine_runs" USING "btree" ("started_at" DESC);

CREATE UNIQUE INDEX "routine_runs_one_tick" ON "company_os"."routine_runs" USING "btree" ("routine_id", "tick_key", "mode") WHERE (("tick_key" IS NOT NULL) AND ("status" = ANY (ARRAY['running'::"text", 'waiting'::"text", 'ok'::"text", 'skipped'::"text"])));

CREATE INDEX "routine_runs_reap_idx" ON "company_os"."routine_runs" USING "btree" ("step_deadline_at") WHERE ("status" = 'running'::"text");


--
-- Name: ai_calls; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."ai_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "site" "text" NOT NULL,
    "class" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_tokens" integer,
    "output_tokens" integer,
    "cache_read_tokens" integer,
    "cache_write_tokens" integer,
    "cost_usd" numeric(12,6),
    "latency_ms" integer NOT NULL,
    "prompt_version" "text" NOT NULL,
    "input_hash" "text" NOT NULL,
    "run_id" "uuid",
    "ok" boolean NOT NULL,
    "error_kind" "text",
    CONSTRAINT "ai_calls_class_check" CHECK (("class" = ANY (ARRAY['S'::"text", 'C'::"text", 'B'::"text", 'A'::"text"]))),
    CONSTRAINT "ai_calls_provider_check" CHECK (("provider" = ANY (ARRAY['anthropic'::"text", 'openrouter'::"text", 'google'::"text"]))),
    CONSTRAINT "ai_calls_error_kind_check" CHECK (("error_kind" = ANY (ARRAY['refusal'::"text", 'max_tokens'::"text", 'timeout'::"text", 'connection'::"text", 'rate_limit'::"text", 'api_error'::"text", 'unknown'::"text"])))
);


ALTER TABLE "company_os"."ai_calls" OWNER TO "postgres";

COMMENT ON TABLE "company_os"."ai_calls" IS 'One row is: one model call made through the kernel/ai gateway — its site, data class, provider, model, tokens, latency and outcome, never its prompt or completion. [other · Logs, audit & telemetry | tier 3 support | active]';

ALTER TABLE ONLY "company_os"."ai_calls" ADD CONSTRAINT "ai_calls_pkey" PRIMARY KEY ("id");

CREATE INDEX "ai_calls_site_created_idx" ON "company_os"."ai_calls" USING "btree" ("site", "created_at");

CREATE INDEX "ai_calls_created_idx" ON "company_os"."ai_calls" USING "btree" ("created_at");

ALTER TABLE "company_os"."ai_calls" ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT ON TABLE "company_os"."ai_calls" TO "service_role";


--
-- Name: epics; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."epics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "company_os"."epics" OWNER TO "postgres";

COMMENT ON TABLE "company_os"."epics" IS 'One row is one epic: a board-scoped grouping of cards into a larger feature or initiative, orthogonal to columns (stage) and sprints (time). A card points at zero or one epic via tasks.epic_id.';


CREATE TABLE "company_os"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "board_id" "uuid",
    "board_column_id" "uuid",
    "sprint_id" "uuid",
    "epic_id" "uuid",
    "position" double precision DEFAULT 0 NOT NULL,
    "assignee_id" "uuid",
    "created_by" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'p3'::"text" NOT NULL,
    "due_date" "date",
    "completed_at" timestamp with time zone,
    "internal" boolean DEFAULT false NOT NULL,
    "subject_type" "text",
    "subject_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_task_id" "uuid",
    "human_tokens" numeric(6,2)
);


--
-- Name: COLUMN "tasks"."human_tokens"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."tasks"."human_tokens" IS 'Human-token estimate of effort for the card (and each subtask), read from the shape of the work on a 0.05 grid with no ceiling; never a forecast of time or resources. Scale: .claude/skills/workboard-cards/SKILL.md.';


--
-- Name: time_off; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."time_off" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_member_id" "uuid" NOT NULL,
    "leave_type" "text" DEFAULT 'vacation'::"text" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "is_half_day" boolean DEFAULT false NOT NULL,
    "hours" numeric(5,2),
    "reason" "text",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_source" "text",
    "external_id" "text",
    "days" numeric,
    "manager_note" "text",
    "requested_at" timestamp with time zone,
    CONSTRAINT "time_off_check" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "time_off_leave_type_check" CHECK (("leave_type" = ANY (ARRAY['vacation'::"text", 'sick'::"text", 'personal'::"text", 'parental'::"text", 'bereavement'::"text", 'unpaid'::"text", 'public_holiday'::"text", 'other'::"text"]))),
    CONSTRAINT "time_off_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text", 'taken'::"text"])))
);


--
-- Name: token_purchases; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."token_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "packs" integer NOT NULL,
    "tokens" integer NOT NULL,
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "stripe_session_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    CONSTRAINT "token_purchases_packs_check" CHECK ((("packs" >= 1) AND ("packs" <= 4))),
    CONSTRAINT "token_purchases_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'expired'::"text"])))
);


--
-- Name: vendors; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'other'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price_range" "text",
    "address" "text",
    "phone" "text",
    "tax_id" "text",
    "bank_info" "text",
    "primary_contact_name" "text",
    "primary_contact_email" "text",
    "primary_contact_phone" "text",
    "secondary_contact_name" "text",
    "secondary_contact_email" "text",
    "secondary_contact_phone" "text",
    "rating" "text",
    "url" "text",
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "vendors_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


--
-- Name: client_identities; Type: TABLE; Schema: htt; Owner: -
--

CREATE TABLE "htt"."client_identities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid",
    "git_email" "text",
    "github_login" "text",
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: delivered_additions; Type: TABLE; Schema: htt; Owner: -
--

CREATE TABLE "htt"."delivered_additions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seq" bigint NOT NULL,
    "company_id" "uuid" NOT NULL,
    "hours" numeric(6,2) NOT NULL,
    "kind" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "set_by_email" "text" NOT NULL,
    "set_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "delivered_additions_hours_check" CHECK (("hours" > (0)::numeric)),
    CONSTRAINT "delivered_additions_kind_check" CHECK (("kind" = ANY (ARRAY['meeting'::"text", 'deep_work'::"text", 'requirements'::"text", 'research'::"text", 'other'::"text"])))
);


--
-- Name: delivered_additions_seq_seq; Type: SEQUENCE; Schema: htt; Owner: -
--

ALTER TABLE "htt"."delivered_additions" ALTER COLUMN "seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "htt"."delivered_additions_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: man_hour_entries; Type: TABLE; Schema: htt; Owner: -
--

CREATE TABLE "htt"."man_hour_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid",
    "company_id" "uuid" NOT NULL,
    "repo_id" "uuid",
    "primary_role" "text",
    "hours" numeric(6,2) NOT NULL,
    "occurred_on" "date" NOT NULL,
    "occurred_hour" smallint,
    "source" "text" NOT NULL,
    "description" "text",
    "rate_cents" integer,
    "currency" "text" DEFAULT 'AUD'::"text",
    "status" "text" DEFAULT 'recorded'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "measured_hours" numeric(6,2),
    "evidence" "jsonb",
    "needs_review" boolean DEFAULT false NOT NULL,
    CONSTRAINT "man_hour_entries_occurred_hour_check" CHECK ((("occurred_hour" >= 0) AND ("occurred_hour" <= 23))),
    CONSTRAINT "man_hour_entries_source_check" CHECK (("source" = ANY (ARRAY['auto_session'::"text", 'manual'::"text"]))),
    CONSTRAINT "man_hour_entries_status_check" CHECK (("status" = ANY (ARRAY['recorded'::"text", 'approved'::"text", 'invoiced'::"text", 'paid'::"text", 'excluded'::"text"])))
);

CREATE TABLE "htt"."work_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "person_id" "uuid",
    "session_id" "text" NOT NULL,
    "tool" "text",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "active_intervals" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tokens_total" bigint DEFAULT 0 NOT NULL,
    "human_turns" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "occurred_on" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);



--
-- Name: model_prices; Type: TABLE; Schema: htt; Owner: -
--

CREATE TABLE "htt"."model_prices" (
    "model" "text" NOT NULL,
    "input_usd_per_million" numeric(10,4) NOT NULL,
    "output_usd_per_million" numeric(10,4) NOT NULL,
    "cache_write_5m_multiplier" numeric(6,3) DEFAULT 1.25 NOT NULL,
    "cache_write_1h_multiplier" numeric(6,3) DEFAULT 2.0 NOT NULL,
    "cache_read_multiplier" numeric(6,3) DEFAULT 0.10 NOT NULL,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "model_prices_cache_read_multiplier_check" CHECK (("cache_read_multiplier" >= (0)::numeric)),
    CONSTRAINT "model_prices_cache_write_1h_multiplier_check" CHECK (("cache_write_1h_multiplier" >= (0)::numeric)),
    CONSTRAINT "model_prices_cache_write_5m_multiplier_check" CHECK (("cache_write_5m_multiplier" >= (0)::numeric)),
    CONSTRAINT "model_prices_input_usd_per_million_check" CHECK (("input_usd_per_million" >= (0)::numeric)),
    CONSTRAINT "model_prices_output_usd_per_million_check" CHECK (("output_usd_per_million" >= (0)::numeric))
);


--
-- Name: project_goals; Type: TABLE; Schema: htt; Owner: -
--

CREATE TABLE "htt"."project_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seq" bigint NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "metric" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "period" "text" NOT NULL,
    "quantity" numeric,
    "source" "text" NOT NULL,
    "source_key" "text" NOT NULL,
    "set_by" "text" NOT NULL,
    "state" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_goals_period_check" CHECK (("period" = ANY (ARRAY['day'::"text", 'week'::"text", 'month'::"text", 'quarter'::"text"]))),
    CONSTRAINT "project_goals_quantity_check" CHECK ((("quantity" IS NULL) OR ("quantity" > (0)::numeric))),
    CONSTRAINT "project_goals_source_check" CHECK (("source" = ANY (ARRAY['stated'::"text", 'suggested'::"text", 'manual'::"text"])))
);


--
-- Name: project_goals_seq_seq; Type: SEQUENCE; Schema: htt; Owner: -
--

ALTER TABLE "htt"."project_goals" ALTER COLUMN "seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "htt"."project_goals_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: project_summaries; Type: TABLE; Schema: htt; Owner: -
--

CREATE TABLE "htt"."project_summaries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "content" "text" NOT NULL,
    "as_of" timestamp with time zone,
    "source_key" "text" NOT NULL,
    "model" "text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_summaries_kind_check" CHECK (("kind" = ANY (ARRAY['executive'::"text", 'latest_prs'::"text"])))
);


--
-- Name: pull_requests; Type: TABLE; Schema: htt; Owner: -
--

CREATE TABLE "htt"."pull_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "github_pr_id" bigint,
    "number" integer,
    "title" "text" NOT NULL,
    "author_login" "text",
    "author_person_id" "uuid",
    "url" "text",
    "state" "text" NOT NULL,
    "status" "text" DEFAULT 'tracked'::"text" NOT NULL,
    "opened_at" timestamp with time zone NOT NULL,
    "merged_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "head_branch" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pull_requests_state_check" CHECK (("state" = ANY (ARRAY['open'::"text", 'merged'::"text", 'closed'::"text"]))),
    CONSTRAINT "pull_requests_status_check" CHECK (("status" = ANY (ARRAY['tracked'::"text", 'verified'::"text", 'disputed'::"text", 'excluded'::"text"])))
);


--
-- Name: repos; Type: TABLE; Schema: htt; Owner: -
--

CREATE TABLE "htt"."repos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ai_program_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "slug" "text",
    "name" "text" NOT NULL,
    "github_repo" "text",
    "github_repo_id" bigint,
    "github_repo_aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "roi_metric_name" "text",
    "roi_metric_unit" "text",
    "roi_metric_baseline" numeric,
    "roi_metric_target" numeric,
    "roi_metric_period" "text",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "live_url" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "repos_roi_metric_period_check" CHECK (("roi_metric_period" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text"]))),
    CONSTRAINT "repos_roi_metric_unit_check" CHECK (("roi_metric_unit" = ANY (ARRAY['count'::"text", 'money'::"text", 'percent'::"text"]))),
    CONSTRAINT "repos_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'active'::"text", 'ramping'::"text", 'paused'::"text", 'complete'::"text", 'archived'::"text"])))
);


--
-- Name: sync_runs; Type: TABLE; Schema: htt; Owner: -
--

CREATE TABLE "htt"."sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "projects_synced" integer DEFAULT 0 NOT NULL,
    "prs_upserted" integer DEFAULT 0 NOT NULL,
    "unattributed" integer DEFAULT 0 NOT NULL,
    "errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "backfill" boolean DEFAULT false NOT NULL
);


--
-- Name: token_allocations; Type: TABLE; Schema: htt; Owner: -
--

CREATE TABLE "htt"."token_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seq" bigint NOT NULL,
    "company_id" "uuid" NOT NULL,
    "tokens" numeric,
    "set_by_email" "text" NOT NULL,
    "set_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text",
    "reason" "text",
    CONSTRAINT "token_allocations_kind_check" CHECK ((("kind" IS NULL) OR ("kind" = ANY (ARRAY['purchased'::"text", 'referral_credit'::"text", 'retreat'::"text", 'complimentary'::"text", 'invoiced'::"text", 'correction'::"text"])))),
    CONSTRAINT "token_allocations_tokens_check" CHECK (("tokens" >= (0)::numeric))
);


--
-- Name: token_allocations_seq_seq; Type: SEQUENCE; Schema: htt; Owner: -
--

ALTER TABLE "htt"."token_allocations" ALTER COLUMN "seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "htt"."token_allocations_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: token_entries; Type: TABLE; Schema: htt; Owner: -
--

CREATE TABLE "htt"."token_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "repo_id" "uuid",
    "pull_request_id" "uuid",
    "person_id" "uuid",
    "kind" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "source" "text" NOT NULL,
    "occurred_at" timestamp with time zone NOT NULL,
    "occurred_on" "date",
    "status" "text" DEFAULT 'recorded'::"text" NOT NULL,
    "session_branch" "text",
    "session_id" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "model" "text",
    "input_tokens" bigint,
    "output_tokens" bigint,
    "cache_write_tokens" bigint,
    "cache_write_5m_tokens" bigint,
    "cache_write_1h_tokens" bigint,
    "cache_read_tokens" bigint,
    CONSTRAINT "token_entries_amount_check" CHECK (("amount" >= 0)),
    CONSTRAINT "token_entries_cache_read_tokens_check" CHECK ((("cache_read_tokens" IS NULL) OR ("cache_read_tokens" >= 0))),
    CONSTRAINT "token_entries_cache_write_1h_tokens_check" CHECK ((("cache_write_1h_tokens" IS NULL) OR ("cache_write_1h_tokens" >= 0))),
    CONSTRAINT "token_entries_cache_write_5m_tokens_check" CHECK ((("cache_write_5m_tokens" IS NULL) OR ("cache_write_5m_tokens" >= 0))),
    CONSTRAINT "token_entries_cache_write_tokens_check" CHECK ((("cache_write_tokens" IS NULL) OR ("cache_write_tokens" >= 0))),
    CONSTRAINT "token_entries_input_tokens_check" CHECK ((("input_tokens" IS NULL) OR ("input_tokens" >= 0))),
    CONSTRAINT "token_entries_output_tokens_check" CHECK ((("output_tokens" IS NULL) OR ("output_tokens" >= 0))),
    CONSTRAINT "token_entries_kind_check" CHECK (("kind" = ANY (ARRAY['human'::"text", 'claude'::"text", 'app'::"text"]))),
    CONSTRAINT "token_entries_source_check" CHECK (("source" = ANY (ARRAY['pr_commit'::"text", 'pr_review'::"text", 'planning'::"text", 'design'::"text", 'research'::"text", 'manual'::"text", 'session'::"text", 'app'::"text", 'effort-log'::"text"]))),
    CONSTRAINT "token_entries_status_check" CHECK (("status" = ANY (ARRAY['recorded'::"text", 'approved'::"text", 'disputed'::"text", 'excluded'::"text"])))
);


--
-- Name: access_codes access_codes_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."access_codes"
    ADD CONSTRAINT "access_codes_pkey" PRIMARY KEY ("scope");


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("id");


--
-- Name: affiliate_commissions affiliate_commissions_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id");


--
-- Name: affiliate_payouts affiliate_payouts_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_pkey" PRIMARY KEY ("id");


--
-- Name: affiliates affiliates_code_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."affiliates"
    ADD CONSTRAINT "affiliates_code_key" UNIQUE ("code");


--
-- Name: affiliates affiliates_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."affiliates"
    ADD CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id");


--
-- Name: ai_programs ai_programs_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."ai_programs"
    ADD CONSTRAINT "ai_programs_pkey" PRIMARY KEY ("id");


--
-- Name: application_stage_log application_stage_log_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."application_stage_log"
    ADD CONSTRAINT "application_stage_log_pkey" PRIMARY KEY ("id");


--
-- Name: application_stages application_stages_job_requisition_id_position_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."application_stages"
    ADD CONSTRAINT "application_stages_job_requisition_id_position_key" UNIQUE ("job_requisition_id", "position");


--
-- Name: application_stages application_stages_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."application_stages"
    ADD CONSTRAINT "application_stages_pkey" PRIMARY KEY ("id");


--
-- Name: applications applications_candidate_id_job_requisition_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."applications"
    ADD CONSTRAINT "applications_candidate_id_job_requisition_id_key" UNIQUE ("candidate_id", "job_requisition_id");


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."applications"
    ADD CONSTRAINT "applications_pkey" PRIMARY KEY ("id");


--
-- Name: assistant_conversations assistant_conversations_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."assistant_conversations"
    ADD CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id");


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: board_columns board_columns_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."board_columns"
    ADD CONSTRAINT "board_columns_pkey" PRIMARY KEY ("id");


--
-- Name: board_members board_members_board_id_person_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."board_members"
    ADD CONSTRAINT "board_members_board_id_person_id_key" UNIQUE ("board_id", "person_id");


--
-- Name: board_members board_members_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."board_members"
    ADD CONSTRAINT "board_members_pkey" PRIMARY KEY ("id");


--
-- Name: boards boards_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."boards"
    ADD CONSTRAINT "boards_pkey" PRIMARY KEY ("id");


--
-- Name: boards boards_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."boards"
    ADD CONSTRAINT "boards_slug_key" UNIQUE ("slug");


--
-- Name: book_chapters book_chapters_book_id_sort_order_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."book_chapters"
    ADD CONSTRAINT "book_chapters_book_id_sort_order_key" UNIQUE ("book_id", "sort_order");


--
-- Name: book_chapters book_chapters_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."book_chapters"
    ADD CONSTRAINT "book_chapters_pkey" PRIMARY KEY ("id");


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");


--
-- Name: books books_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."books"
    ADD CONSTRAINT "books_pkey" PRIMARY KEY ("id");


--
-- Name: books books_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."books"
    ADD CONSTRAINT "books_slug_key" UNIQUE ("slug");


--
-- Name: brand_profiles brand_profiles_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."brand_profiles"
    ADD CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("brand_id");


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."brands"
    ADD CONSTRAINT "brands_pkey" PRIMARY KEY ("id");


--
-- Name: brands brands_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."brands"
    ADD CONSTRAINT "brands_slug_key" UNIQUE ("slug");


--
-- Name: call_scorecards call_scorecards_call_transcript_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."call_scorecards"
    ADD CONSTRAINT "call_scorecards_call_transcript_id_key" UNIQUE ("call_transcript_id");


--
-- Name: call_scorecards call_scorecards_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."call_scorecards"
    ADD CONSTRAINT "call_scorecards_pkey" PRIMARY KEY ("id");


--
-- Name: call_transcripts call_transcripts_meeting_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."call_transcripts"
    ADD CONSTRAINT "call_transcripts_meeting_id_key" UNIQUE ("meeting_id");


--
-- Name: call_transcripts call_transcripts_minute_token_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."call_transcripts"
    ADD CONSTRAINT "call_transcripts_minute_token_key" UNIQUE ("minute_token");


--
-- Name: call_transcripts call_transcripts_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."call_transcripts"
    ADD CONSTRAINT "call_transcripts_pkey" PRIMARY KEY ("id");


--
-- Name: candidate_profile candidate_profile_person_unique; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."candidate_profile"
    ADD CONSTRAINT "candidate_profile_person_unique" UNIQUE ("person_id");


--
-- Name: candidate_profile candidate_profile_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."candidate_profile"
    ADD CONSTRAINT "candidate_profile_pkey" PRIMARY KEY ("id");


--
-- Name: candidate_sensitive candidate_sensitive_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."candidate_sensitive"
    ADD CONSTRAINT "candidate_sensitive_pkey" PRIMARY KEY ("person_id");


--
-- Name: candidates candidates_person_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."candidates"
    ADD CONSTRAINT "candidates_person_id_key" UNIQUE ("person_id");


--
-- Name: candidates candidates_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."candidates"
    ADD CONSTRAINT "candidates_pkey" PRIMARY KEY ("id");


--
-- Name: capacity_commitments capacity_commitments_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."capacity_commitments"
    ADD CONSTRAINT "capacity_commitments_pkey" PRIMARY KEY ("id");


--
-- Name: capacity_roles capacity_roles_name_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."capacity_roles"
    ADD CONSTRAINT "capacity_roles_name_key" UNIQUE ("name");


--
-- Name: capacity_roles capacity_roles_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."capacity_roles"
    ADD CONSTRAINT "capacity_roles_pkey" PRIMARY KEY ("id");


--
-- Name: client_backlog_items client_backlog_items_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."client_backlog_items"
    ADD CONSTRAINT "client_backlog_items_pkey" PRIMARY KEY ("id");


--
-- Name: client_roadmap_groups client_roadmap_groups_company_id_key_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."client_roadmap_groups"
    ADD CONSTRAINT "client_roadmap_groups_company_id_key_key" UNIQUE ("company_id", "key");


--
-- Name: client_roadmap_groups client_roadmap_groups_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."client_roadmap_groups"
    ADD CONSTRAINT "client_roadmap_groups_pkey" PRIMARY KEY ("id");


--
-- Name: client_roadmap_overview client_roadmap_overview_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."client_roadmap_overview"
    ADD CONSTRAINT "client_roadmap_overview_pkey" PRIMARY KEY ("company_id");


--
-- Name: coaching_checkins coaching_checkins_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_checkins"
    ADD CONSTRAINT "coaching_checkins_pkey" PRIMARY KEY ("id");


--
-- Name: coaching_commitment_history coaching_commitment_history_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_commitment_history"
    ADD CONSTRAINT "coaching_commitment_history_pkey" PRIMARY KEY ("id");


--
-- Name: coaching_commitments coaching_commitments_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_commitments"
    ADD CONSTRAINT "coaching_commitments_pkey" PRIMARY KEY ("id");


--
-- Name: coaching_context coaching_context_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_context"
    ADD CONSTRAINT "coaching_context_pkey" PRIMARY KEY ("id");


--
-- Name: coaching_goal_comments coaching_goal_comments_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_goal_comments"
    ADD CONSTRAINT "coaching_goal_comments_pkey" PRIMARY KEY ("id");


--
-- Name: goals coaching_goals_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."goals"
    ADD CONSTRAINT "coaching_goals_pkey" PRIMARY KEY ("id");


--
-- Name: coaching_member_notes coaching_member_notes_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_member_notes"
    ADD CONSTRAINT "coaching_member_notes_pkey" PRIMARY KEY ("id");


--
-- Name: coaching_ocean_profiles coaching_ocean_profiles_coaching_profile_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_ocean_profiles"
    ADD CONSTRAINT "coaching_ocean_profiles_coaching_profile_id_key" UNIQUE ("coaching_profile_id");


--
-- Name: coaching_ocean_profiles coaching_ocean_profiles_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_ocean_profiles"
    ADD CONSTRAINT "coaching_ocean_profiles_pkey" PRIMARY KEY ("id");


--
-- Name: coaching_one_on_ones coaching_one_on_ones_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_one_on_ones"
    ADD CONSTRAINT "coaching_one_on_ones_pkey" PRIMARY KEY ("id");


--
-- Name: coaching_priorities coaching_priorities_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_priorities"
    ADD CONSTRAINT "coaching_priorities_pkey" PRIMARY KEY ("id");


--
-- Name: coaching_profiles coaching_profiles_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_profiles"
    ADD CONSTRAINT "coaching_profiles_pkey" PRIMARY KEY ("id");


--
-- Name: coaching_profiles coaching_profiles_team_member_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_profiles"
    ADD CONSTRAINT "coaching_profiles_team_member_id_key" UNIQUE ("team_member_id");


--
-- Name: coaching_talking_points coaching_talking_points_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_talking_points"
    ADD CONSTRAINT "coaching_talking_points_pkey" PRIMARY KEY ("id");


--
-- Name: coaching_trends coaching_trends_coaching_profile_id_period_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_trends"
    ADD CONSTRAINT "coaching_trends_coaching_profile_id_period_key" UNIQUE ("coaching_profile_id", "period");


--
-- Name: coaching_trends coaching_trends_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_trends"
    ADD CONSTRAINT "coaching_trends_pkey" PRIMARY KEY ("id");


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");


--
-- Name: company_github_orgs company_github_orgs_org_login_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."company_github_orgs"
    ADD CONSTRAINT "company_github_orgs_org_login_key" UNIQUE ("org_login");


--
-- Name: company_github_orgs company_github_orgs_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."company_github_orgs"
    ADD CONSTRAINT "company_github_orgs_pkey" PRIMARY KEY ("id");


--
-- Name: company_profile company_profile_label_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."company_profile"
    ADD CONSTRAINT "company_profile_label_key" UNIQUE ("label");


--
-- Name: company_profile company_profile_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."company_profile"
    ADD CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id");


--
-- Name: compensation_sensitive compensation_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."compensation_sensitive"
    ADD CONSTRAINT "compensation_pkey" PRIMARY KEY ("id");


--
-- Name: contractor_payments contractor_payments_person_id_period_month_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_payments"
    ADD CONSTRAINT "contractor_payments_person_id_period_month_key" UNIQUE ("person_id", "period_month");


--
-- Name: contractor_payments contractor_payments_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_payments"
    ADD CONSTRAINT "contractor_payments_pkey" PRIMARY KEY ("id");


--
-- Name: contractor_work_events contractor_work_events_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_work_events"
    ADD CONSTRAINT "contractor_work_events_pkey" PRIMARY KEY ("id");


--
-- Name: contractor_work_requests contractor_work_requests_access_token_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_work_requests"
    ADD CONSTRAINT "contractor_work_requests_access_token_key" UNIQUE ("access_token");


--
-- Name: contractor_work_requests contractor_work_requests_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_work_requests"
    ADD CONSTRAINT "contractor_work_requests_pkey" PRIMARY KEY ("id");


--
-- Name: core_values core_values_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."core_values"
    ADD CONSTRAINT "core_values_pkey" PRIMARY KEY ("id");


--
-- Name: core_values core_values_sort_order_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."core_values"
    ADD CONSTRAINT "core_values_sort_order_key" UNIQUE ("sort_order");


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");


--
-- Name: email_campaign_recipients email_campaign_recipients_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."email_campaign_recipients"
    ADD CONSTRAINT "email_campaign_recipients_pkey" PRIMARY KEY ("id");


--
-- Name: email_campaign_recipients email_campaign_recipients_unique; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."email_campaign_recipients"
    ADD CONSTRAINT "email_campaign_recipients_unique" UNIQUE ("campaign_id", "person_id");


--
-- Name: email_campaigns email_campaigns_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id");


--
-- Name: email_events email_events_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."email_events"
    ADD CONSTRAINT "email_events_pkey" PRIMARY KEY ("id");


--
-- Name: equipment equipment_asset_tag_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."equipment"
    ADD CONSTRAINT "equipment_asset_tag_key" UNIQUE ("asset_tag");


--
-- Name: equipment_assignments equipment_assignments_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."equipment_assignments"
    ADD CONSTRAINT "equipment_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: equipment equipment_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."equipment"
    ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_requests equipment_requests_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."equipment_requests"
    ADD CONSTRAINT "equipment_requests_pkey" PRIMARY KEY ("id");


--
-- Name: event_agenda_blocks event_agenda_blocks_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_agenda_blocks"
    ADD CONSTRAINT "event_agenda_blocks_pkey" PRIMARY KEY ("id");


--
-- Name: event_agenda_staff event_agenda_staff_block_id_person_id_role_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_agenda_staff"
    ADD CONSTRAINT "event_agenda_staff_block_id_person_id_role_key" UNIQUE ("block_id", "person_id", "role");


--
-- Name: event_agenda_staff event_agenda_staff_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_agenda_staff"
    ADD CONSTRAINT "event_agenda_staff_pkey" PRIMARY KEY ("id");


--
-- Name: event_pnl_lines event_pnl_lines_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_pnl_lines"
    ADD CONSTRAINT "event_pnl_lines_pkey" PRIMARY KEY ("id");


--
-- Name: event_registrations event_registrations_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_registrations"
    ADD CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id");


--
-- Name: event_talks event_talks_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_talks"
    ADD CONSTRAINT "event_talks_pkey" PRIMARY KEY ("event_id", "talk_id");


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");


--
-- Name: events events_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."events"
    ADD CONSTRAINT "events_slug_key" UNIQUE ("slug");


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");


--
-- Name: fx_rates fx_rates_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."fx_rates"
    ADD CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("currency");


--
-- Name: gallery_photo_people gallery_photo_people_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."gallery_photo_people"
    ADD CONSTRAINT "gallery_photo_people_pkey" PRIMARY KEY ("photo_id", "person_id");


--
-- Name: gallery_photos gallery_photos_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."gallery_photos"
    ADD CONSTRAINT "gallery_photos_pkey" PRIMARY KEY ("id");


--
-- Name: holidays holidays_date_name_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."holidays"
    ADD CONSTRAINT "holidays_date_name_key" UNIQUE ("date", "name");


--
-- Name: holidays holidays_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."holidays"
    ADD CONSTRAINT "holidays_pkey" PRIMARY KEY ("id");


--
-- Name: idea_trend_reports idea_trend_reports_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."idea_trend_reports"
    ADD CONSTRAINT "idea_trend_reports_pkey" PRIMARY KEY ("id");


--
-- Name: marketing_recaps marketing_recaps_period_month_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_recaps"
    ADD CONSTRAINT "marketing_recaps_period_month_key" UNIQUE ("period_month");


--
-- Name: marketing_recaps marketing_recaps_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_recaps"
    ADD CONSTRAINT "marketing_recaps_pkey" PRIMARY KEY ("id");


--
-- Name: ideas ideas_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."ideas"
    ADD CONSTRAINT "ideas_pkey" PRIMARY KEY ("id");


--
-- Name: inquiries inquiries_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."inquiries"
    ADD CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id");


--
-- Name: integration_sources integration_sources_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."integration_sources"
    ADD CONSTRAINT "integration_sources_pkey" PRIMARY KEY ("id");


--
-- Name: integration_sources integration_sources_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."integration_sources"
    ADD CONSTRAINT "integration_sources_slug_key" UNIQUE ("slug");


--
-- Name: interactions interactions_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interactions"
    ADD CONSTRAINT "interactions_pkey" PRIMARY KEY ("id");


--
-- Name: interview_interviewers interview_interviewers_interview_id_interviewer_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interview_interviewers"
    ADD CONSTRAINT "interview_interviewers_interview_id_interviewer_id_key" UNIQUE ("interview_id", "interviewer_id");


--
-- Name: interview_interviewers interview_interviewers_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interview_interviewers"
    ADD CONSTRAINT "interview_interviewers_pkey" PRIMARY KEY ("id");


--
-- Name: interview_scorecards interview_scorecards_interview_id_interviewer_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interview_scorecards"
    ADD CONSTRAINT "interview_scorecards_interview_id_interviewer_id_key" UNIQUE ("interview_id", "interviewer_id");


--
-- Name: interview_scorecards interview_scorecards_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interview_scorecards"
    ADD CONSTRAINT "interview_scorecards_pkey" PRIMARY KEY ("id");


--
-- Name: interviews interviews_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interviews"
    ADD CONSTRAINT "interviews_pkey" PRIMARY KEY ("id");


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");


--
-- Name: invoices invoices_source_entity_external_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."invoices"
    ADD CONSTRAINT "invoices_source_entity_external_id_key" UNIQUE ("source", "entity", "external_id");


--
-- Name: issues issues_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."issues"
    ADD CONSTRAINT "issues_pkey" PRIMARY KEY ("id");


--
-- Name: job_requisitions job_requisitions_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."job_requisitions"
    ADD CONSTRAINT "job_requisitions_pkey" PRIMARY KEY ("id");


--
-- Name: key_results key_results_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."key_results"
    ADD CONSTRAINT "key_results_pkey" PRIMARY KEY ("id");


--
-- Name: kr_logs kr_logs_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."kr_logs"
    ADD CONSTRAINT "kr_logs_pkey" PRIMARY KEY ("id");


--
-- Name: lead lead_person_unique; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."lead"
    ADD CONSTRAINT "lead_person_unique" UNIQUE ("person_id");


--
-- Name: lead lead_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."lead"
    ADD CONSTRAINT "lead_pkey" PRIMARY KEY ("id");


--
-- Name: leave_adjustments leave_adjustments_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."leave_adjustments"
    ADD CONSTRAINT "leave_adjustments_pkey" PRIMARY KEY ("id");


--
-- Name: leave_adjustments leave_adjustments_source_external_key_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."leave_adjustments"
    ADD CONSTRAINT "leave_adjustments_source_external_key_key" UNIQUE ("source", "external_key");


--
-- Name: leave_policies leave_policies_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."leave_policies"
    ADD CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id");


--
-- Name: legal_entities legal_entities_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."legal_entities"
    ADD CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id");


--
-- Name: legal_entities legal_entities_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."legal_entities"
    ADD CONSTRAINT "legal_entities_slug_key" UNIQUE ("slug");


--
-- Name: lifecycle_transitions lifecycle_transitions_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."lifecycle_transitions"
    ADD CONSTRAINT "lifecycle_transitions_pkey" PRIMARY KEY ("id");


--
-- Name: marketing_asset_images marketing_asset_images_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_asset_images"
    ADD CONSTRAINT "marketing_asset_images_pkey" PRIMARY KEY ("id");


--
-- Name: marketing_campaigns marketing_campaigns_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id");


--
-- Name: marketing_content marketing_content_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_content"
    ADD CONSTRAINT "marketing_content_pkey" PRIMARY KEY ("id");


--
-- Name: marketing_pillars marketing_pillars_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_pillars"
    ADD CONSTRAINT "marketing_pillars_pkey" PRIMARY KEY ("id");


--
-- Name: meeting_action_items meeting_action_items_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meeting_action_items"
    ADD CONSTRAINT "meeting_action_items_pkey" PRIMARY KEY ("id");


--
-- Name: meeting_associations meeting_links_meeting_id_entity_type_entity_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meeting_associations"
    ADD CONSTRAINT "meeting_links_meeting_id_entity_type_entity_id_key" UNIQUE ("meeting_id", "entity_type", "entity_id");


--
-- Name: meeting_associations meeting_links_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meeting_associations"
    ADD CONSTRAINT "meeting_links_pkey" PRIMARY KEY ("id");


--
-- Name: meeting_participants meeting_participants_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meeting_participants"
    ADD CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id");


--
-- Name: meetings meetings_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meetings"
    ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");


--
-- Name: objectives objectives_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."objectives"
    ADD CONSTRAINT "objectives_pkey" PRIMARY KEY ("id");


--
-- Name: offers offers_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");


--
-- Name: onboarding_plans onboarding_plans_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."onboarding_plans"
    ADD CONSTRAINT "onboarding_plans_pkey" PRIMARY KEY ("id");


--
-- Name: onboarding_plans onboarding_plans_team_member_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."onboarding_plans"
    ADD CONSTRAINT "onboarding_plans_team_member_id_key" UNIQUE ("team_member_id");


--
-- Name: onboarding_tasks onboarding_tasks_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."onboarding_tasks"
    ADD CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id");


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");


--
-- Name: orders orders_stripe_session_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."orders"
    ADD CONSTRAINT "orders_stripe_session_id_key" UNIQUE ("stripe_session_id");


--
-- Name: people people_auth_user_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."people"
    ADD CONSTRAINT "people_auth_user_id_key" UNIQUE ("auth_user_id");


--
-- Name: people people_email_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."people"
    ADD CONSTRAINT "people_email_key" UNIQUE ("email");


--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."people"
    ADD CONSTRAINT "people_pkey" PRIMARY KEY ("id");


--
-- Name: people_sensitive people_sensitive_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."people_sensitive"
    ADD CONSTRAINT "people_sensitive_pkey" PRIMARY KEY ("person_id");


--
-- Name: performance_reviews performance_reviews_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."performance_reviews"
    ADD CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id");


--
-- Name: person_companies person_companies_person_id_company_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."person_companies"
    ADD CONSTRAINT "person_companies_person_id_company_id_key" UNIQUE ("person_id", "company_id");


--
-- Name: person_companies person_companies_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."person_companies"
    ADD CONSTRAINT "person_companies_pkey" PRIMARY KEY ("id");


--
-- Name: person_git_emails person_git_emails_git_email_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."person_git_emails"
    ADD CONSTRAINT "person_git_emails_git_email_key" UNIQUE ("git_email");


--
-- Name: person_git_emails person_git_emails_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."person_git_emails"
    ADD CONSTRAINT "person_git_emails_pkey" PRIMARY KEY ("id");


--
-- Name: person_qualifications person_qualifications_person_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."person_qualifications"
    ADD CONSTRAINT "person_qualifications_person_id_key" UNIQUE ("person_id");


--
-- Name: person_qualifications person_qualifications_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."person_qualifications"
    ADD CONSTRAINT "person_qualifications_pkey" PRIMARY KEY ("id");


--
-- Name: pipeline_stages pipeline_stages_pipeline_id_name_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pipeline_id_name_key" UNIQUE ("pipeline_id", "name");


--
-- Name: pipeline_stages pipeline_stages_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id");


--
-- Name: pipelines pipelines_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."pipelines"
    ADD CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id");


--
-- Name: pipelines pipelines_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."pipelines"
    ADD CONSTRAINT "pipelines_slug_key" UNIQUE ("slug");


--
-- Name: portal_assume_sessions portal_assume_sessions_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."portal_assume_sessions"
    ADD CONSTRAINT "portal_assume_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: portal_members portal_members_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."portal_members"
    ADD CONSTRAINT "portal_members_pkey" PRIMARY KEY ("id");


--
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."products"
    ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");


--
-- Name: products products_stripe_price_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."products"
    ADD CONSTRAINT "products_stripe_price_id_key" UNIQUE ("stripe_price_id");


--
-- Name: products products_stripe_product_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."products"
    ADD CONSTRAINT "products_stripe_product_id_key" UNIQUE ("stripe_product_id");


--
-- Name: program_documents program_documents_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."program_documents"
    ADD CONSTRAINT "program_documents_pkey" PRIMARY KEY ("id");


--
-- Name: program_plans program_plans_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."program_plans"
    ADD CONSTRAINT "program_plans_pkey" PRIMARY KEY ("id");


--
-- Name: lark_user_connections lark_user_connections_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."lark_user_connections"
    ADD CONSTRAINT "lark_user_connections_pkey" PRIMARY KEY ("team_member_id");


--
-- Name: qbo_connection qbo_connection_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."qbo_connection"
    ADD CONSTRAINT "qbo_connection_pkey" PRIMARY KEY ("id");


--
-- Name: requisition_loop_steps requisition_loop_steps_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."requisition_loop_steps"
    ADD CONSTRAINT "requisition_loop_steps_pkey" PRIMARY KEY ("id");

--
-- Name: requisition_loop_interviewers requisition_loop_interviewers_loop_step_id_interviewer_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."requisition_loop_interviewers"
    ADD CONSTRAINT "requisition_loop_interviewers_loop_step_id_interviewer_id_key" UNIQUE ("loop_step_id", "interviewer_id");


--
-- Name: requisition_loop_interviewers requisition_loop_interviewers_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."requisition_loop_interviewers"
    ADD CONSTRAINT "requisition_loop_interviewers_pkey" PRIMARY KEY ("id");



--
-- Name: scorecard_scores scorecard_scores_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."scorecard_scores"
    ADD CONSTRAINT "scorecard_scores_pkey" PRIMARY KEY ("id");


--
-- Name: scorecard_scores scorecard_scores_scorecard_id_criterion_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."scorecard_scores"
    ADD CONSTRAINT "scorecard_scores_scorecard_id_criterion_key" UNIQUE ("scorecard_id", "criterion");


--
-- Name: service_lines service_lines_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."service_lines"
    ADD CONSTRAINT "service_lines_pkey" PRIMARY KEY ("id");


--
-- Name: service_lines service_lines_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."service_lines"
    ADD CONSTRAINT "service_lines_slug_key" UNIQUE ("slug");


--
-- Name: sprints sprints_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."sprints"
    ADD CONSTRAINT "sprints_pkey" PRIMARY KEY ("id");


--
-- Name: epics epics_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."epics"
    ADD CONSTRAINT "epics_pkey" PRIMARY KEY ("id");


--
-- Name: staff_assignments staff_assignments_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."staff_assignments"
    ADD CONSTRAINT "staff_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: strategies strategies_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."strategies"
    ADD CONSTRAINT "strategies_pkey" PRIMARY KEY ("id");


--
-- Name: strategies strategies_year_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."strategies"
    ADD CONSTRAINT "strategies_year_key" UNIQUE ("year");


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: subscriptions subscriptions_stripe_subscription_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");


--
-- Name: survey_answers survey_answers_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."survey_answers"
    ADD CONSTRAINT "survey_answers_pkey" PRIMARY KEY ("id");


--
-- Name: survey_answers survey_answers_response_field_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."survey_answers"
    ADD CONSTRAINT "survey_answers_response_field_key" UNIQUE ("response_id", "field_id");


--
-- Name: survey_fields survey_fields_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."survey_fields"
    ADD CONSTRAINT "survey_fields_pkey" PRIMARY KEY ("id");


--
-- Name: survey_responses survey_responses_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."survey_responses"
    ADD CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id");


--
-- Name: surveys surveys_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."surveys"
    ADD CONSTRAINT "surveys_pkey" PRIMARY KEY ("id");


--
-- Name: sync_packets sync_packets_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."sync_packets"
    ADD CONSTRAINT "sync_packets_pkey" PRIMARY KEY ("id");


--
-- Name: sync_packets sync_packets_week_start_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."sync_packets"
    ADD CONSTRAINT "sync_packets_week_start_key" UNIQUE ("week_start");


--
-- Name: taggables taggables_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."taggables"
    ADD CONSTRAINT "taggables_pkey" PRIMARY KEY ("id");


--
-- Name: taggables taggables_tag_id_entity_type_entity_id_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."taggables"
    ADD CONSTRAINT "taggables_tag_id_entity_type_entity_id_key" UNIQUE ("tag_id", "entity_type", "entity_id");


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");


--
-- Name: tags tags_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."tags"
    ADD CONSTRAINT "tags_slug_key" UNIQUE ("slug");


--
-- Name: talks talks_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."talks"
    ADD CONSTRAINT "talks_pkey" PRIMARY KEY ("id");


--
-- Name: talks talks_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."talks"
    ADD CONSTRAINT "talks_slug_key" UNIQUE ("slug");


--
-- Name: task_comments task_comments_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_comments"
    ADD CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id");


--
-- Name: task_stage_log task_stage_log_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_stage_log"
    ADD CONSTRAINT "task_stage_log_pkey" PRIMARY KEY ("id");


--
-- Name: deal_stage_log deal_stage_log_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deal_stage_log"
    ADD CONSTRAINT "deal_stage_log_pkey" PRIMARY KEY ("id");


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");


--
-- Name: company_information team_knowledge_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."company_information"
    ADD CONSTRAINT "team_knowledge_pkey" PRIMARY KEY ("id");


--
-- Name: company_information team_knowledge_slug_key; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."company_information"
    ADD CONSTRAINT "team_knowledge_slug_key" UNIQUE ("slug");


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");


--
-- Name: time_off time_off_external_uq; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."time_off"
    ADD CONSTRAINT "time_off_external_uq" UNIQUE ("external_source", "external_id");


--
-- Name: time_off time_off_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."time_off"
    ADD CONSTRAINT "time_off_pkey" PRIMARY KEY ("id");


--
-- Name: token_purchases token_purchases_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."token_purchases"
    ADD CONSTRAINT "token_purchases_pkey" PRIMARY KEY ("id");


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");


--
-- Name: client_identities client_identities_pkey; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."client_identities"
    ADD CONSTRAINT "client_identities_pkey" PRIMARY KEY ("id");


--
-- Name: delivered_additions delivered_additions_pkey; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."delivered_additions"
    ADD CONSTRAINT "delivered_additions_pkey" PRIMARY KEY ("id");


--
-- Name: man_hour_entries man_hour_entries_pkey; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."man_hour_entries"
    ADD CONSTRAINT "man_hour_entries_pkey" PRIMARY KEY ("id");


--
-- Name: model_prices model_prices_pkey; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."model_prices"
    ADD CONSTRAINT "model_prices_pkey" PRIMARY KEY ("model");


--
-- Name: project_goals project_goals_pkey; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."project_goals"
    ADD CONSTRAINT "project_goals_pkey" PRIMARY KEY ("id");


--
-- Name: project_summaries project_summaries_pkey; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."project_summaries"
    ADD CONSTRAINT "project_summaries_pkey" PRIMARY KEY ("id");


--
-- Name: project_summaries project_summaries_repo_id_kind_key; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."project_summaries"
    ADD CONSTRAINT "project_summaries_repo_id_kind_key" UNIQUE ("repo_id", "kind");


--
-- Name: pull_requests pull_requests_pkey; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."pull_requests"
    ADD CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id");


--
-- Name: repos repos_pkey; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."repos"
    ADD CONSTRAINT "repos_pkey" PRIMARY KEY ("id");


--
-- Name: sync_runs sync_runs_pkey; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."sync_runs"
    ADD CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id");


--
-- Name: token_allocations token_allocations_pkey; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."token_allocations"
    ADD CONSTRAINT "token_allocations_pkey" PRIMARY KEY ("id");


--
-- Name: token_entries token_entries_pkey; Type: CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."token_entries"
    ADD CONSTRAINT "token_entries_pkey" PRIMARY KEY ("id");


--
-- Name: admins_email_lower_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "admins_email_lower_idx" ON "company_os"."admins" USING "btree" ("lower"("email"));


--
-- Name: admins_person_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "admins_person_id_idx" ON "company_os"."admins" USING "btree" ("person_id");


--
-- Name: affiliate_commissions_source_event_source_ref_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "affiliate_commissions_source_event_source_ref_key" ON "company_os"."affiliate_commissions" USING "btree" ("source_event", "source_ref");


--
-- Name: affiliates_company_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "affiliates_company_id_idx" ON "company_os"."affiliates" USING "btree" ("company_id");


--
-- Name: ai_programs_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "ai_programs_company_idx" ON "company_os"."ai_programs" USING "btree" ("company_id");


--
-- Name: ai_programs_status_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "ai_programs_status_idx" ON "company_os"."ai_programs" USING "btree" ("status");


--
-- Name: applications_ai_rating_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "applications_ai_rating_idx" ON "company_os"."applications" USING "btree" ("job_requisition_id", "ai_rating" DESC NULLS LAST);


--
-- Name: applications_person_req_uniq; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "applications_person_req_uniq" ON "company_os"."applications" USING "btree" ("person_id", "job_requisition_id");


--
-- Name: assistant_conversations_owner_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "assistant_conversations_owner_idx" ON "company_os"."assistant_conversations" USING "btree" ("surface", "owner_auth_user_id", "last_message_at" DESC) WHERE ("archived_at" IS NULL);


--
-- Name: board_columns_board_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "board_columns_board_idx" ON "company_os"."board_columns" USING "btree" ("board_id");


--
-- Name: board_members_board_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "board_members_board_idx" ON "company_os"."board_members" USING "btree" ("board_id");


--
-- Name: board_members_person_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "board_members_person_idx" ON "company_os"."board_members" USING "btree" ("person_id");


--
-- Name: boards_ai_program_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "boards_ai_program_id_idx" ON "company_os"."boards" USING "btree" ("ai_program_id") WHERE ("ai_program_id" IS NOT NULL);


--
-- Name: boards_client_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "boards_client_idx" ON "company_os"."boards" USING "btree" ("client_company_id");


--
-- Name: call_transcripts_search_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "call_transcripts_search_idx" ON "company_os"."call_transcripts" USING "gin" ("search");


--
-- Name: call_transcripts_started_at_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "call_transcripts_started_at_idx" ON "company_os"."call_transcripts" USING "btree" ("started_at" DESC);


--
-- Name: capacity_commitments_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "capacity_commitments_company_idx" ON "company_os"."capacity_commitments" USING "btree" ("company_id") WHERE ("company_id" IS NOT NULL);


--
-- Name: capacity_commitments_role_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "capacity_commitments_role_idx" ON "company_os"."capacity_commitments" USING "btree" ("role_id", "starts_on") WHERE ("archived_at" IS NULL);


--
-- Name: client_backlog_items_ai_program_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "client_backlog_items_ai_program_id_idx" ON "company_os"."client_backlog_items" USING "btree" ("ai_program_id") WHERE ("ai_program_id" IS NOT NULL);


--
-- Name: client_backlog_items_company_group_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "client_backlog_items_company_group_idx" ON "company_os"."client_backlog_items" USING "btree" ("company_id", "group_key", "sort_order");


--
-- Name: client_backlog_items_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "client_backlog_items_company_idx" ON "company_os"."client_backlog_items" USING "btree" ("company_id");


--
-- Name: client_backlog_items_company_ref_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "client_backlog_items_company_ref_key" ON "company_os"."client_backlog_items" USING "btree" ("company_id", "ref") WHERE ("ref" IS NOT NULL);


--
-- Name: client_roadmap_groups_ai_program_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "client_roadmap_groups_ai_program_id_idx" ON "company_os"."client_roadmap_groups" USING "btree" ("ai_program_id") WHERE ("ai_program_id" IS NOT NULL);


--
-- Name: client_roadmap_groups_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "client_roadmap_groups_company_idx" ON "company_os"."client_roadmap_groups" USING "btree" ("company_id", "sort_order");


--
-- Name: client_roadmap_overview_ai_program_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "client_roadmap_overview_ai_program_id_idx" ON "company_os"."client_roadmap_overview" USING "btree" ("ai_program_id") WHERE ("ai_program_id" IS NOT NULL);


--
-- Name: coaching_checkins_profile_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_checkins_profile_idx" ON "company_os"."coaching_checkins" USING "btree" ("coaching_profile_id", "sent_at" DESC);


--
-- Name: coaching_commitment_history_commitment_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_commitment_history_commitment_idx" ON "company_os"."coaching_commitment_history" USING "btree" ("commitment_id", "changed_at" DESC);


--
-- Name: coaching_commitments_profile_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_commitments_profile_idx" ON "company_os"."coaching_commitments" USING "btree" ("coaching_profile_id", "status");


--
-- Name: coaching_commitments_profile_order_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_commitments_profile_order_idx" ON "company_os"."coaching_commitments" USING "btree" ("coaching_profile_id", "sort_order");


--
-- Name: coaching_context_coach_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_context_coach_idx" ON "company_os"."coaching_context" USING "btree" ("coach_id", "kind");


--
-- Name: coaching_goal_comments_goal_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_goal_comments_goal_idx" ON "company_os"."coaching_goal_comments" USING "btree" ("goal_id", "created_at");


--
-- Name: coaching_goals_profile_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_goals_profile_idx" ON "company_os"."goals" USING "btree" ("coaching_profile_id", "status");


--
-- Name: coaching_member_notes_profile_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_member_notes_profile_idx" ON "company_os"."coaching_member_notes" USING "btree" ("coaching_profile_id", "created_at" DESC);


--
-- Name: coaching_one_on_ones_led_by_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_one_on_ones_led_by_idx" ON "company_os"."coaching_one_on_ones" USING "btree" ("led_by") WHERE ("led_by" IS NOT NULL);


--
-- Name: coaching_one_on_ones_lark_hold_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_one_on_ones_lark_hold_idx" ON "company_os"."coaching_one_on_ones" USING "btree" ("lark_hold_synced_at") WHERE ("archived_at" IS NULL);


--
-- Name: coaching_one_on_ones_meeting_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_one_on_ones_meeting_idx" ON "company_os"."coaching_one_on_ones" USING "btree" ("meeting_id");


--
-- Name: coaching_one_on_ones_profile_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_one_on_ones_profile_idx" ON "company_os"."coaching_one_on_ones" USING "btree" ("coaching_profile_id", "held_on" DESC) WHERE ("archived_at" IS NULL);


--
-- Name: coaching_one_on_ones_profile_date_uniq; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "coaching_one_on_ones_profile_date_uniq" ON "company_os"."coaching_one_on_ones" USING "btree" ("coaching_profile_id", "held_on") WHERE ("archived_at" IS NULL);


--
-- Name: coaching_priorities_profile_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_priorities_profile_idx" ON "company_os"."coaching_priorities" USING "btree" ("coaching_profile_id", "status", "sort_order");


--
-- Name: coaching_profiles_coach_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_profiles_coach_idx" ON "company_os"."coaching_profiles" USING "btree" ("coach_id") WHERE "active";


--
-- Name: coaching_talking_points_profile_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "coaching_talking_points_profile_idx" ON "company_os"."coaching_talking_points" USING "btree" ("coaching_profile_id", "created_at") WHERE ("addressed_at" IS NULL);


--
-- Name: companies_active_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "companies_active_idx" ON "company_os"."companies" USING "btree" ("created_at" DESC) WHERE ("archived_at" IS NULL);


--
-- Name: company_github_orgs_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "company_github_orgs_company_idx" ON "company_os"."company_github_orgs" USING "btree" ("company_id");


--
-- Name: contractor_payments_person_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "contractor_payments_person_idx" ON "company_os"."contractor_payments" USING "btree" ("person_id");


--
-- Name: contractor_payments_status_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "contractor_payments_status_idx" ON "company_os"."contractor_payments" USING "btree" ("status");


--
-- Name: contractor_work_events_request_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "contractor_work_events_request_idx" ON "company_os"."contractor_work_events" USING "btree" ("request_id", "created_at");


--
-- Name: contractor_work_requests_client_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "contractor_work_requests_client_company_idx" ON "company_os"."contractor_work_requests" USING "btree" ("client_company_id");


--
-- Name: contractor_work_requests_payment_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "contractor_work_requests_payment_idx" ON "company_os"."contractor_work_requests" USING "btree" ("payment_id");


--
-- Name: contractor_work_requests_person_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "contractor_work_requests_person_idx" ON "company_os"."contractor_work_requests" USING "btree" ("person_id");


--
-- Name: contractor_work_requests_status_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "contractor_work_requests_status_idx" ON "company_os"."contractor_work_requests" USING "btree" ("status");


--
-- Name: deals_active_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "deals_active_idx" ON "company_os"."deals" USING "btree" ("created_at" DESC) WHERE ("archived_at" IS NULL);


--
-- Name: deals_referrer_company_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "deals_referrer_company_id_idx" ON "company_os"."deals" USING "btree" ("referrer_company_id");


--
-- Name: deals_referrer_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "deals_referrer_id_idx" ON "company_os"."deals" USING "btree" ("referrer_id");


--
-- Name: email_campaign_recipients_person_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "email_campaign_recipients_person_idx" ON "company_os"."email_campaign_recipients" USING "btree" ("person_id");


--
-- Name: email_campaign_recipients_queue_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "email_campaign_recipients_queue_idx" ON "company_os"."email_campaign_recipients" USING "btree" ("campaign_id", "status") WHERE ("status" = 'pending'::"text");


--
-- Name: email_campaigns_brand_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "email_campaigns_brand_idx" ON "company_os"."email_campaigns" USING "btree" ("brand_id");


--
-- Name: email_campaigns_created_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "email_campaigns_created_idx" ON "company_os"."email_campaigns" USING "btree" ("created_at" DESC);


--
-- Name: email_campaigns_status_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "email_campaigns_status_idx" ON "company_os"."email_campaigns" USING "btree" ("status");


--
-- Name: email_events_campaign_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "email_events_campaign_idx" ON "company_os"."email_events" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);


--
-- Name: email_events_dedupe_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "email_events_dedupe_idx" ON "company_os"."email_events" USING "btree" ("resend_email_id", "event_type", "occurred_at");


--
-- Name: email_events_occurred_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "email_events_occurred_idx" ON "company_os"."email_events" USING "btree" ("occurred_at" DESC);


--
-- Name: email_events_person_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "email_events_person_idx" ON "company_os"."email_events" USING "btree" ("person_id");


--
-- Name: email_events_recipient_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "email_events_recipient_idx" ON "company_os"."email_events" USING "btree" ("recipient");


--
-- Name: email_events_svix_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "email_events_svix_idx" ON "company_os"."email_events" USING "btree" ("svix_id") WHERE ("svix_id" IS NOT NULL);


--
-- Name: equipment_assignments_equipment_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "equipment_assignments_equipment_idx" ON "company_os"."equipment_assignments" USING "btree" ("equipment_id", "assigned_at" DESC);


--
-- Name: equipment_assignments_one_open_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "equipment_assignments_one_open_idx" ON "company_os"."equipment_assignments" USING "btree" ("equipment_id") WHERE ("returned_at" IS NULL);


--
-- Name: equipment_assignments_person_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "equipment_assignments_person_idx" ON "company_os"."equipment_assignments" USING "btree" ("person_id");


--
-- Name: equipment_holder_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "equipment_holder_idx" ON "company_os"."equipment" USING "btree" ("current_holder_id");


--
-- Name: equipment_requests_person_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "equipment_requests_person_idx" ON "company_os"."equipment_requests" USING "btree" ("person_id", "created_at" DESC);


--
-- Name: equipment_requests_status_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "equipment_requests_status_idx" ON "company_os"."equipment_requests" USING "btree" ("status") WHERE ("status" = 'pending'::"text");


--
-- Name: equipment_serial_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "equipment_serial_idx" ON "company_os"."equipment" USING "btree" ("serial_number") WHERE ("serial_number" IS NOT NULL);


--
-- Name: equipment_status_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "equipment_status_idx" ON "company_os"."equipment" USING "btree" ("status");


--
-- Name: equipment_type_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "equipment_type_idx" ON "company_os"."equipment" USING "btree" ("type");


--
-- Name: equipment_vendor_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "equipment_vendor_idx" ON "company_os"."equipment" USING "btree" ("vendor_id");


--
-- Name: event_agenda_blocks_event_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "event_agenda_blocks_event_id_idx" ON "company_os"."event_agenda_blocks" USING "btree" ("event_id", "day_index", "sort_order");


--
-- Name: event_agenda_staff_block_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "event_agenda_staff_block_id_idx" ON "company_os"."event_agenda_staff" USING "btree" ("block_id");


--
-- Name: event_pnl_lines_event_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "event_pnl_lines_event_id_idx" ON "company_os"."event_pnl_lines" USING "btree" ("event_id");


--
-- Name: event_registrations_event_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "event_registrations_event_idx" ON "company_os"."event_registrations" USING "btree" ("event_id", "status");


--
-- Name: event_registrations_ticket_code_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "event_registrations_ticket_code_key" ON "company_os"."event_registrations" USING "btree" ("ticket_code");


--
-- Name: event_talks_talk_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "event_talks_talk_idx" ON "company_os"."event_talks" USING "btree" ("talk_id");


--
-- Name: events_status_starts_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "events_status_starts_idx" ON "company_os"."events" USING "btree" ("status", "starts_at");


--
-- Name: events_type_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "events_type_idx" ON "company_os"."events" USING "btree" ("type");


--
-- Name: expenses_incurred_on_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "expenses_incurred_on_idx" ON "company_os"."expenses" USING "btree" ("incurred_on");


--
-- Name: expenses_source_external_id_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "expenses_source_external_id_key" ON "company_os"."expenses" USING "btree" ("source", "external_id") WHERE ("external_id" IS NOT NULL);


--
-- Name: expenses_vendor_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "expenses_vendor_idx" ON "company_os"."expenses" USING "btree" ("vendor_id");


--
-- Name: expenses_company_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "expenses_company_id_idx" ON "company_os"."expenses" USING "btree" ("company_id") WHERE ("company_id" IS NOT NULL);


--
-- Name: gallery_photo_people_person_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "gallery_photo_people_person_idx" ON "company_os"."gallery_photo_people" USING "btree" ("person_id");


--
-- Name: idea_trend_reports_generated_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idea_trend_reports_generated_idx" ON "company_os"."idea_trend_reports" USING "btree" ("generated_at" DESC);


--
-- Name: marketing_recaps_period_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "marketing_recaps_period_idx" ON "company_os"."marketing_recaps" USING "btree" ("period_month" DESC);


--
-- Name: ideas_kind_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "ideas_kind_idx" ON "company_os"."ideas" USING "btree" ("kind");


--
-- Name: ideas_office_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "ideas_office_idx" ON "company_os"."ideas" USING "btree" ("office");


--
-- Name: ideas_person_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "ideas_person_id_idx" ON "company_os"."ideas" USING "btree" ("person_id");


--
-- Name: ideas_status_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "ideas_status_idx" ON "company_os"."ideas" USING "btree" ("status");


--
-- Name: idx_action_items_assignee; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_action_items_assignee" ON "company_os"."meeting_action_items" USING "btree" ("assignee_id");


--
-- Name: idx_action_items_meeting; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_action_items_meeting" ON "company_os"."meeting_action_items" USING "btree" ("meeting_id");


--
-- Name: idx_app_stage_log_app; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_app_stage_log_app" ON "company_os"."application_stage_log" USING "btree" ("application_id", "moved_at");


--
-- Name: idx_application_stages_req; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_application_stages_req" ON "company_os"."application_stages" USING "btree" ("job_requisition_id", "position");


--
-- Name: idx_applications_candidate; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_applications_candidate" ON "company_os"."applications" USING "btree" ("candidate_id");


--
-- Name: idx_applications_req; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_applications_req" ON "company_os"."applications" USING "btree" ("job_requisition_id");


--
-- Name: idx_applications_stage; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_applications_stage" ON "company_os"."applications" USING "btree" ("current_stage_id");


--
-- Name: idx_applications_status; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_applications_status" ON "company_os"."applications" USING "btree" ("status");


--
-- Name: idx_audit_record; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_audit_record" ON "company_os"."audit_log" USING "btree" ("table_name", "record_id");


--
-- Name: idx_bookings_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_bookings_person" ON "company_os"."bookings" USING "btree" ("person_id");


--
-- Name: idx_candidates_company; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_candidates_company" ON "company_os"."candidates" USING "btree" ("current_company_id");


--
-- Name: idx_candidates_pool; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_candidates_pool" ON "company_os"."candidates" USING "btree" ("pool_status");


--
-- Name: idx_candidates_recruiter; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_candidates_recruiter" ON "company_os"."candidates" USING "btree" ("owner_recruiter_id");


--
-- Name: idx_commissions_affiliate; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_commissions_affiliate" ON "company_os"."affiliate_commissions" USING "btree" ("affiliate_id");


--
-- Name: idx_commissions_payout; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_commissions_payout" ON "company_os"."affiliate_commissions" USING "btree" ("payout_id");


--
-- Name: idx_companies_owner; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_companies_owner" ON "company_os"."companies" USING "btree" ("owner_id");


--
-- Name: idx_companies_website_url; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_companies_website_url" ON "company_os"."companies" USING "btree" ("website_url");


--
-- Name: idx_compensation_current; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "idx_compensation_current" ON "company_os"."compensation_sensitive" USING "btree" ("team_member_id", "comp_type") WHERE "is_current";


--
-- Name: idx_compensation_member; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_compensation_member" ON "company_os"."compensation_sensitive" USING "btree" ("team_member_id");


--
-- Name: idx_deals_company; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_deals_company" ON "company_os"."deals" USING "btree" ("company_id");


--
-- Name: idx_deals_next_step_date; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_deals_next_step_date" ON "company_os"."deals" USING "btree" ("next_step_date") WHERE ("status" = 'open'::"text");


--
-- Name: idx_deals_owner; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_deals_owner" ON "company_os"."deals" USING "btree" ("owner_id");


--
-- Name: idx_deals_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_deals_person" ON "company_os"."deals" USING "btree" ("person_id");


--
-- Name: idx_deals_pipeline; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_deals_pipeline" ON "company_os"."deals" USING "btree" ("pipeline_id");


--
-- Name: idx_deals_status; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_deals_status" ON "company_os"."deals" USING "btree" ("status");


--
-- Name: idx_departments_parent; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_departments_parent" ON "company_os"."departments" USING "btree" ("parent_department_id");


--
-- Name: idx_documents_entity; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_documents_entity" ON "company_os"."documents" USING "btree" ("entity_type", "entity_id");


--
-- Name: idx_inquiries_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_inquiries_person" ON "company_os"."inquiries" USING "btree" ("person_id");


--
-- Name: idx_inquiries_status; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_inquiries_status" ON "company_os"."inquiries" USING "btree" ("status");


--
-- Name: idx_inquiries_type; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_inquiries_type" ON "company_os"."inquiries" USING "btree" ("type");


--
-- Name: idx_interactions_company; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_interactions_company" ON "company_os"."interactions" USING "btree" ("company_id");


--
-- Name: idx_interactions_occurred; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_interactions_occurred" ON "company_os"."interactions" USING "btree" ("occurred_at" DESC);


--
-- Name: idx_interactions_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_interactions_person" ON "company_os"."interactions" USING "btree" ("person_id");


--
-- Name: idx_interactions_subject; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_interactions_subject" ON "company_os"."interactions" USING "btree" ("subject_type", "subject_id");


--
-- Name: idx_interview_interviewers_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_interview_interviewers_person" ON "company_os"."interview_interviewers" USING "btree" ("interviewer_id");


--
-- Name: idx_interviews_app; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_interviews_app" ON "company_os"."interviews" USING "btree" ("application_id");


--
-- Name: idx_interviews_scheduled; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_interviews_scheduled" ON "company_os"."interviews" USING "btree" ("scheduled_at");


--
-- Name: idx_lifecycle_transitions_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_lifecycle_transitions_person" ON "company_os"."lifecycle_transitions" USING "btree" ("person_id", "occurred_at");


--
-- Name: idx_lifecycle_transitions_stage; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_lifecycle_transitions_stage" ON "company_os"."lifecycle_transitions" USING "btree" ("to_stage", "occurred_at");


--
-- Name: idx_meeting_links_entity; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_meeting_links_entity" ON "company_os"."meeting_associations" USING "btree" ("entity_type", "entity_id");


--
-- Name: idx_meeting_participants_email; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "idx_meeting_participants_email" ON "company_os"."meeting_participants" USING "btree" ("meeting_id", "external_email") WHERE ("external_email" IS NOT NULL);


--
-- Name: idx_meeting_participants_meeting; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_meeting_participants_meeting" ON "company_os"."meeting_participants" USING "btree" ("meeting_id");


--
-- Name: idx_meeting_participants_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_meeting_participants_person" ON "company_os"."meeting_participants" USING "btree" ("person_id");


--
-- Name: idx_meetings_owner; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_meetings_owner" ON "company_os"."meetings" USING "btree" ("owner_id");


--
-- Name: idx_meetings_source_external; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "idx_meetings_source_external" ON "company_os"."meetings" USING "btree" ("source", "external_id") WHERE ("external_id" IS NOT NULL);


--
-- Name: idx_meetings_started; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_meetings_started" ON "company_os"."meetings" USING "btree" ("started_at" DESC);


--
-- Name: idx_offers_application; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_offers_application" ON "company_os"."offers" USING "btree" ("application_id");


--
-- Name: idx_offers_status; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_offers_status" ON "company_os"."offers" USING "btree" ("status");


--
-- Name: idx_onboarding_member; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_onboarding_member" ON "company_os"."onboarding_tasks" USING "btree" ("team_member_id");


--
-- Name: idx_onboarding_status; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_onboarding_status" ON "company_os"."onboarding_tasks" USING "btree" ("status");


--
-- Name: idx_orders_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_orders_person" ON "company_os"."orders" USING "btree" ("person_id");


--
-- Name: idx_orders_product; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_orders_product" ON "company_os"."orders" USING "btree" ("product_id");


--
-- Name: idx_orders_status; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_orders_status" ON "company_os"."orders" USING "btree" ("status");


--
-- Name: idx_people_auth_user; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "idx_people_auth_user" ON "company_os"."people" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);


--
-- Name: idx_people_owner; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_people_owner" ON "company_os"."people" USING "btree" ("owner_id");


--
-- Name: idx_perf_reviews_cycle; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_perf_reviews_cycle" ON "company_os"."performance_reviews" USING "btree" ("cycle_label");


--
-- Name: idx_perf_reviews_member; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_perf_reviews_member" ON "company_os"."performance_reviews" USING "btree" ("team_member_id");


--
-- Name: idx_perf_reviews_reviewer; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_perf_reviews_reviewer" ON "company_os"."performance_reviews" USING "btree" ("reviewer_id");


--
-- Name: idx_person_companies_company; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_person_companies_company" ON "company_os"."person_companies" USING "btree" ("company_id");


--
-- Name: idx_pipeline_stages_pipeline; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_pipeline_stages_pipeline" ON "company_os"."pipeline_stages" USING "btree" ("pipeline_id", "position");


--
-- Name: idx_positions_dept; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_positions_dept" ON "company_os"."positions" USING "btree" ("department_id");


--
-- Name: idx_products_type; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_products_type" ON "company_os"."products" USING "btree" ("type");


--
-- Name: idx_registrations_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_registrations_person" ON "company_os"."event_registrations" USING "btree" ("person_id");


--
-- Name: idx_registrations_product; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_registrations_product" ON "company_os"."event_registrations" USING "btree" ("product_id");


--
-- Name: idx_requisitions_client; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_requisitions_client" ON "company_os"."job_requisitions" USING "btree" ("client_company_id");


--
-- Name: idx_requisitions_manager; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_requisitions_manager" ON "company_os"."job_requisitions" USING "btree" ("hiring_manager_id");


--
-- Name: idx_requisitions_recruiter; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_requisitions_recruiter" ON "company_os"."job_requisitions" USING "btree" ("recruiter_id");


--
-- Name: idx_requisitions_status; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_requisitions_status" ON "company_os"."job_requisitions" USING "btree" ("status");


--
-- Name: idx_scorecard_scores_card; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_scorecard_scores_card" ON "company_os"."scorecard_scores" USING "btree" ("scorecard_id", "position");


--
-- Name: idx_scorecards_interview; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_scorecards_interview" ON "company_os"."interview_scorecards" USING "btree" ("interview_id");


--
-- Name: idx_subscriptions_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_subscriptions_person" ON "company_os"."subscriptions" USING "btree" ("person_id");


--
-- Name: idx_subscriptions_status; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_subscriptions_status" ON "company_os"."subscriptions" USING "btree" ("status");


--
-- Name: idx_taggables_entity; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_taggables_entity" ON "company_os"."taggables" USING "btree" ("entity_type", "entity_id");


--
-- Name: idx_team_members_dept; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_team_members_dept" ON "company_os"."team_members" USING "btree" ("department_id");


--
-- Name: idx_team_members_manager; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_team_members_manager" ON "company_os"."team_members" USING "btree" ("manager_id");


--
-- Name: idx_team_members_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_team_members_person" ON "company_os"."team_members" USING "btree" ("person_id");


--
-- Name: idx_team_members_status; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_team_members_status" ON "company_os"."team_members" USING "btree" ("status");


--
-- Name: idx_time_off_member; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_time_off_member" ON "company_os"."time_off" USING "btree" ("team_member_id");


--
-- Name: idx_time_off_range; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_time_off_range" ON "company_os"."time_off" USING "btree" ("start_date", "end_date");


--
-- Name: idx_time_off_status; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "idx_time_off_status" ON "company_os"."time_off" USING "btree" ("status");


--
-- Name: interviews_lark_event_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "interviews_lark_event_idx" ON "company_os"."interviews" USING "btree" ("lark_event_id") WHERE ("lark_event_id" IS NOT NULL);


--
-- Name: interviews_loop_step_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "interviews_loop_step_idx" ON "company_os"."interviews" USING "btree" ("loop_step_id");


--
-- Name: invoices_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "invoices_company_idx" ON "company_os"."invoices" USING "btree" ("company_id");


--
-- Name: job_requisitions_slug_uniq; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "job_requisitions_slug_uniq" ON "company_os"."job_requisitions" USING "btree" ("slug");


--
-- Name: kr_logs_kr_week_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "kr_logs_kr_week_idx" ON "company_os"."kr_logs" USING "btree" ("key_result_id", "week_start");


--
-- Name: leave_adjustments_member_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "leave_adjustments_member_idx" ON "company_os"."leave_adjustments" USING "btree" ("team_member_id", "leave_type");


--
-- Name: marketing_asset_images_entry_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "marketing_asset_images_entry_idx" ON "company_os"."marketing_asset_images" USING "btree" ("entry_id", "created_at" DESC);


--
-- Name: marketing_asset_images_one_selected; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "marketing_asset_images_one_selected" ON "company_os"."marketing_asset_images" USING "btree" ("entry_id") WHERE "is_selected";


--
-- Name: marketing_campaigns_brand_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "marketing_campaigns_brand_idx" ON "company_os"."marketing_campaigns" USING "btree" ("brand_id");


--
-- Name: marketing_campaigns_pillar_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "marketing_campaigns_pillar_idx" ON "company_os"."marketing_campaigns" USING "btree" ("pillar_id");


--
-- Name: marketing_content_blog_slug_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "marketing_content_blog_slug_key" ON "company_os"."marketing_content" USING "btree" ("brand_id", "slug") WHERE (("channel" = 'blog'::"text") AND ("slug" IS NOT NULL));


--
-- Name: marketing_content_brand_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "marketing_content_brand_idx" ON "company_os"."marketing_content" USING "btree" ("brand_id");


--
-- Name: marketing_content_broadcast_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "marketing_content_broadcast_idx" ON "company_os"."marketing_content" USING "btree" ("broadcast_id") WHERE ("broadcast_id" IS NOT NULL);


--
-- Name: marketing_content_campaign_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "marketing_content_campaign_idx" ON "company_os"."marketing_content" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);


--
-- Name: marketing_content_pillar_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "marketing_content_pillar_idx" ON "company_os"."marketing_content" USING "btree" ("pillar_id");


--
-- Name: marketing_content_publish_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "marketing_content_publish_idx" ON "company_os"."marketing_content" USING "btree" ("publish_date");


--
-- Name: marketing_content_status_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "marketing_content_status_idx" ON "company_os"."marketing_content" USING "btree" ("status");


--
-- Name: marketing_pillars_brand_name_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "marketing_pillars_brand_name_idx" ON "company_os"."marketing_pillars" USING "btree" ("brand_id", "lower"("name"));


--
-- Name: meetings_ai_program_id_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "meetings_ai_program_id_idx" ON "company_os"."meetings" USING "btree" ("ai_program_id") WHERE ("ai_program_id" IS NOT NULL);


--
-- Name: meetings_coaching_one_on_one_uniq; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "meetings_coaching_one_on_one_uniq" ON "company_os"."meetings" USING "btree" ((("metadata" ->> 'coaching_one_on_one_id'::"text"))) WHERE (("metadata" ->> 'coaching_one_on_one_id'::"text") IS NOT NULL);


--
-- Name: meetings_notes_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "meetings_notes_company_idx" ON "company_os"."meetings" USING "btree" ("company_id") WHERE ("source" = 'notes'::"text");


--
-- Name: meetings_notes_published_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "meetings_notes_published_idx" ON "company_os"."meetings" USING "btree" ("published_at") WHERE ("source" = 'notes'::"text");


--
-- Name: people_active_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "people_active_idx" ON "company_os"."people" USING "btree" ("created_at" DESC) WHERE ("archived_at" IS NULL);


--
-- Name: people_github_login_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "people_github_login_key" ON "company_os"."people" USING "btree" ("github_login") WHERE ("github_login" IS NOT NULL);


--
-- Name: people_marketing_consent_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "people_marketing_consent_idx" ON "company_os"."people" USING "btree" ("marketing_consent") WHERE ("marketing_consent" = 'subscribed'::"text");


--
-- Name: performance_reviews_cycle_rater_uniq; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "performance_reviews_cycle_rater_uniq" ON "company_os"."performance_reviews" USING "btree" ("team_member_id", "cycle_label", "rater_kind") WHERE (("source" = 'portal'::"text") AND ("cycle_label" IS NOT NULL) AND ("rater_kind" = ANY (ARRAY['self'::"text", 'manager'::"text"])));


--
-- Name: performance_reviews_cycle_reviewer_uniq; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "performance_reviews_cycle_reviewer_uniq" ON "company_os"."performance_reviews" USING "btree" ("team_member_id", "cycle_label", "reviewer_id") WHERE (("source" = 'portal'::"text") AND ("cycle_label" IS NOT NULL) AND ("rater_kind" = 'reviewer'::"text"));


--
-- Name: performance_reviews_cycle_external_uniq; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "performance_reviews_cycle_external_uniq" ON "company_os"."performance_reviews" USING "btree" ("team_member_id", "cycle_label", "lower"("reviewer_email")) WHERE (("source" = 'portal'::"text") AND ("cycle_label" IS NOT NULL) AND ("rater_kind" = 'external'::"text"));


--
-- Name: performance_reviews_access_token_uniq; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "performance_reviews_access_token_uniq" ON "company_os"."performance_reviews" USING "btree" ("access_token") WHERE ("access_token" IS NOT NULL);


--
-- Name: performance_reviews_member_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "performance_reviews_member_idx" ON "company_os"."performance_reviews" USING "btree" ("team_member_id", "submitted_at");


--
-- Name: person_git_emails_one_primary; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "person_git_emails_one_primary" ON "company_os"."person_git_emails" USING "btree" ("person_id") WHERE "is_primary";


--
-- Name: person_git_emails_person_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "person_git_emails_person_idx" ON "company_os"."person_git_emails" USING "btree" ("person_id");


--
-- Name: portal_assume_sessions_started_by_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "portal_assume_sessions_started_by_idx" ON "company_os"."portal_assume_sessions" USING "btree" ("started_by");


--
-- Name: portal_members_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "portal_members_company_idx" ON "company_os"."portal_members" USING "btree" ("company_id");


--
-- Name: portal_members_person_company_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "portal_members_person_company_key" ON "company_os"."portal_members" USING "btree" ("person_id", "company_id") WHERE ("company_id" IS NOT NULL);


--
-- Name: portal_members_person_only_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "portal_members_person_only_key" ON "company_os"."portal_members" USING "btree" ("person_id") WHERE ("company_id" IS NULL);


--
-- Name: products_event_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "products_event_idx" ON "company_os"."products" USING "btree" ("event_id");


--
-- Name: program_documents_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "program_documents_company_idx" ON "company_os"."program_documents" USING "btree" ("company_id");


--
-- Name: program_documents_program_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "program_documents_program_idx" ON "company_os"."program_documents" USING "btree" ("ai_program_id");


--
-- Name: program_documents_storage_path_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "program_documents_storage_path_key" ON "company_os"."program_documents" USING "btree" ("storage_path");


--
-- Name: program_plans_program_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "program_plans_program_idx" ON "company_os"."program_plans" USING "btree" ("ai_program_id");


--
-- Name: requisition_loop_steps_req_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "requisition_loop_steps_req_idx" ON "company_os"."requisition_loop_steps" USING "btree" ("job_requisition_id", "position");

--
-- Name: requisition_loop_interviewers_person_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "requisition_loop_interviewers_person_idx" ON "company_os"."requisition_loop_interviewers" USING "btree" ("interviewer_id");


--
-- Name: requisition_loop_interviewers_step_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "requisition_loop_interviewers_step_idx" ON "company_os"."requisition_loop_interviewers" USING "btree" ("loop_step_id");



--
-- Name: sprints_board_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "sprints_board_idx" ON "company_os"."sprints" USING "btree" ("board_id");


--
-- Name: sprints_board_week_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "sprints_board_week_key" ON "company_os"."sprints" USING "btree" ("board_id", "week") WHERE ("week" IS NOT NULL);


--
-- Name: staff_assignments_active_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "staff_assignments_active_key" ON "company_os"."staff_assignments" USING "btree" ("company_id", "team_member_id") WHERE ("status" = 'active'::"text");


--
-- Name: staff_assignments_client_manager_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "staff_assignments_client_manager_idx" ON "company_os"."staff_assignments" USING "btree" ("client_manager_person_id") WHERE ("client_manager_person_id" IS NOT NULL);


--
-- Name: staff_assignments_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "staff_assignments_company_idx" ON "company_os"."staff_assignments" USING "btree" ("company_id");


--
-- Name: staff_assignments_team_member_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "staff_assignments_team_member_idx" ON "company_os"."staff_assignments" USING "btree" ("team_member_id");


--
-- Name: survey_answers_response_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "survey_answers_response_idx" ON "company_os"."survey_answers" USING "btree" ("response_id");


--
-- Name: survey_fields_survey_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "survey_fields_survey_idx" ON "company_os"."survey_fields" USING "btree" ("survey_id", "position");


--
-- Name: survey_responses_survey_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "survey_responses_survey_idx" ON "company_os"."survey_responses" USING "btree" ("survey_id", "submitted_at" DESC);


--
-- Name: task_comments_parent_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "task_comments_parent_idx" ON "company_os"."task_comments" USING "btree" ("parent_comment_id");


--
-- Name: task_comments_task_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "task_comments_task_idx" ON "company_os"."task_comments" USING "btree" ("task_id");


--
-- Name: task_stage_log_task_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "task_stage_log_task_idx" ON "company_os"."task_stage_log" USING "btree" ("task_id");


--
-- Name: deal_stage_log_deal_moved_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "deal_stage_log_deal_moved_idx" ON "company_os"."deal_stage_log" USING "btree" ("deal_id", "moved_at" DESC);


--
-- Name: deals_campaign_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "deals_campaign_idx" ON "company_os"."deals" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);


--
-- Name: invoices_deal_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "invoices_deal_idx" ON "company_os"."invoices" USING "btree" ("deal_id") WHERE ("deal_id" IS NOT NULL);


--
-- Name: tasks_assignee_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "tasks_assignee_idx" ON "company_os"."tasks" USING "btree" ("assignee_id");


--
-- Name: tasks_board_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "tasks_board_idx" ON "company_os"."tasks" USING "btree" ("board_id");


--
-- Name: tasks_column_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "tasks_column_idx" ON "company_os"."tasks" USING "btree" ("board_column_id");


--
-- Name: tasks_parent_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "tasks_parent_idx" ON "company_os"."tasks" USING "btree" ("parent_task_id");


--
-- Name: tasks_sprint_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "tasks_sprint_idx" ON "company_os"."tasks" USING "btree" ("sprint_id");


--
-- Name: tasks_epic_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "tasks_epic_idx" ON "company_os"."tasks" USING "btree" ("epic_id");


--
-- Name: epics_board_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "epics_board_idx" ON "company_os"."epics" USING "btree" ("board_id");


--
-- Name: tasks_subject_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "tasks_subject_idx" ON "company_os"."tasks" USING "btree" ("subject_type", "subject_id");


--
-- Name: tasks_content_day_once; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "tasks_content_day_once" ON "company_os"."tasks" USING "btree" ("board_id", (("metadata" ->> 'content_day'::"text"))) WHERE (("subject_type" = 'marketing_day'::"text") AND ("parent_task_id" IS NULL));


--
-- Name: tasks_content_asset_once; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "tasks_content_asset_once" ON "company_os"."tasks" USING "btree" ("board_id", "subject_id") WHERE ("subject_type" = 'marketing_content'::"text");


--
-- Name: tasks_writer_campaign_once; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "tasks_writer_campaign_once" ON "company_os"."tasks" USING "btree" ("board_id", "subject_id") WHERE ("subject_type" = 'marketing_campaign'::"text");


--
-- Name: team_knowledge_category_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "team_knowledge_category_idx" ON "company_os"."company_information" USING "btree" ("category");


--
-- Name: team_knowledge_fts_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "team_knowledge_fts_idx" ON "company_os"."company_information" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("body", ''::"text"))));


--
-- Name: team_knowledge_slug_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "team_knowledge_slug_idx" ON "company_os"."company_information" USING "btree" ("slug");


--
-- Name: team_members_department_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "team_members_department_idx" ON "company_os"."team_members" USING "btree" ("department_id");


--
-- Name: token_purchases_company_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "token_purchases_company_idx" ON "company_os"."token_purchases" USING "btree" ("company_id");


--
-- Name: token_purchases_session_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "token_purchases_session_idx" ON "company_os"."token_purchases" USING "btree" ("stripe_session_id");


--
-- Name: uq_meetings_source_external; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "uq_meetings_source_external" ON "company_os"."meetings" USING "btree" ("source", "external_id") WHERE ("external_id" IS NOT NULL);


--
-- Name: vendors_qbo_vendor_id_key; Type: INDEX; Schema: company_os; Owner: -
--

CREATE UNIQUE INDEX "vendors_qbo_vendor_id_key" ON "company_os"."vendors" USING "btree" ((("metadata" ->> 'qbo_vendor_id'::"text"))) WHERE (("metadata" ->> 'qbo_vendor_id'::"text") IS NOT NULL);


--
-- Name: vendors_type_idx; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "vendors_type_idx" ON "company_os"."vendors" USING "btree" ("type");


--
-- Name: client_identities_email_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "client_identities_email_idx" ON "htt"."client_identities" USING "btree" ("lower"("git_email"));


--
-- Name: client_identities_login_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "client_identities_login_idx" ON "htt"."client_identities" USING "btree" ("lower"("github_login"));


--
-- Name: man_hour_auto_uniq; Type: INDEX; Schema: htt; Owner: -
--

CREATE UNIQUE INDEX "man_hour_auto_uniq" ON "htt"."man_hour_entries" USING "btree" ("person_id", "repo_id", "occurred_on") WHERE ("source" = 'auto_session'::"text");


--
-- Name: delivered_additions_company_seq_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "delivered_additions_company_seq_idx" ON "htt"."delivered_additions" USING "btree" ("company_id", "seq" DESC);


--
-- Name: man_hour_company_day_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "man_hour_company_day_idx" ON "htt"."man_hour_entries" USING "btree" ("company_id", "occurred_on");


--
-- Name: man_hour_started_at_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "man_hour_started_at_idx" ON "htt"."man_hour_entries" USING "btree" ("person_id", "repo_id", "started_at") WHERE ("started_at" IS NOT NULL);


--
-- Name: project_goals_latest; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "project_goals_latest" ON "htt"."project_goals" USING "btree" ("repo_id", "seq" DESC);


--
-- Name: pull_requests_github_pr_id_uniq; Type: INDEX; Schema: htt; Owner: -
--

CREATE UNIQUE INDEX "pull_requests_github_pr_id_uniq" ON "htt"."pull_requests" USING "btree" ("github_pr_id");


--
-- Name: pull_requests_repo_head_branch_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "pull_requests_repo_head_branch_idx" ON "htt"."pull_requests" USING "btree" ("repo_id", "head_branch") WHERE ("head_branch" IS NOT NULL);


--
-- Name: pull_requests_repo_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "pull_requests_repo_idx" ON "htt"."pull_requests" USING "btree" ("repo_id", "state");


--
-- Name: repos_company_slug_uniq; Type: INDEX; Schema: htt; Owner: -
--

CREATE UNIQUE INDEX "repos_company_slug_uniq" ON "htt"."repos" USING "btree" ("company_id", "slug") WHERE ("slug" IS NOT NULL);


--
-- Name: repos_company_status_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "repos_company_status_idx" ON "htt"."repos" USING "btree" ("company_id", "status");


--
-- Name: repos_ai_program_id_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "repos_ai_program_id_idx" ON "htt"."repos" USING "btree" ("ai_program_id");


--
-- Name: repos_github_repo_uniq; Type: INDEX; Schema: htt; Owner: -
--

CREATE UNIQUE INDEX "repos_github_repo_uniq" ON "htt"."repos" USING "btree" ("github_repo") WHERE ("github_repo" IS NOT NULL);


--
-- Name: token_allocations_company_seq_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "token_allocations_company_seq_idx" ON "htt"."token_allocations" USING "btree" ("company_id", "seq" DESC);


--
-- Name: token_entries_app_repo_day_source_uniq; Type: INDEX; Schema: htt; Owner: -
--

CREATE UNIQUE INDEX "token_entries_app_repo_day_source_uniq" ON "htt"."token_entries" USING "btree" ("repo_id", "occurred_on", "source") WHERE ("kind" = 'app'::"text");


--
-- Name: token_entries_company_occurred_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "token_entries_company_occurred_idx" ON "htt"."token_entries" USING "btree" ("company_id", "occurred_at");


--
-- Name: token_entries_member_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "token_entries_member_idx" ON "htt"."token_entries" USING "btree" ("person_id");


--
-- Name: token_entries_member_repo_day_kind_uniq; Type: INDEX; Schema: htt; Owner: -
--

CREATE UNIQUE INDEX "token_entries_member_repo_day_kind_uniq" ON "htt"."token_entries" USING "btree" ("person_id", "repo_id", "occurred_on", "kind");


--
-- Name: token_entries_pr_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "token_entries_pr_idx" ON "htt"."token_entries" USING "btree" ("pull_request_id");


--
-- Name: token_entries_repo_kind_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "token_entries_repo_kind_idx" ON "htt"."token_entries" USING "btree" ("repo_id", "kind");


--
-- Name: token_entries_session_branch_idx; Type: INDEX; Schema: htt; Owner: -
--

CREATE INDEX "token_entries_session_branch_idx" ON "htt"."token_entries" USING "btree" ("repo_id", "session_branch") WHERE (("pull_request_id" IS NULL) AND ("session_branch" IS NOT NULL));


--
-- Name: token_entries_session_kind_uniq; Type: INDEX; Schema: htt; Owner: -
--

CREATE UNIQUE INDEX "token_entries_session_kind_uniq" ON "htt"."token_entries" USING "btree" ("session_id", "kind");


--
-- Name: survey_list _RETURN; Type: RULE; Schema: company_os; Owner: -
--

CREATE OR REPLACE VIEW "company_os"."survey_list" AS
 SELECT "s"."id",
    "s"."slug",
    "s"."name",
    "s"."description",
    "s"."status",
    "s"."intro_text",
    "s"."thank_you_text",
    "s"."metadata",
    "s"."created_at",
    "s"."updated_at",
    "s"."is_anonymous",
    "s"."created_by",
    "s"."archived_at",
    "s"."purpose",
    ("count"("r"."id"))::integer AS "response_count",
    "max"(COALESCE("r"."submitted_at", "r"."created_at")) AS "last_response_at"
   FROM ("company_os"."surveys" "s"
     LEFT JOIN "company_os"."survey_responses" "r" ON (("r"."survey_id" = "s"."id")))
  GROUP BY "s"."id";


--
-- Name: capacity_commitments set_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "company_os"."capacity_commitments" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: capacity_roles set_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "company_os"."capacity_roles" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: company_github_orgs company_github_orgs_set_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "company_github_orgs_set_updated_at" BEFORE UPDATE ON "company_os"."company_github_orgs" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: meetings meetings_normalize_type; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "meetings_normalize_type" BEFORE INSERT OR UPDATE ON "company_os"."meetings" FOR EACH ROW EXECUTE FUNCTION "company_os"."meetings_normalize_type_tg"();


--
-- Name: person_git_emails person_git_emails_set_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "person_git_emails_set_updated_at" BEFORE UPDATE ON "company_os"."person_git_emails" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: affiliates set_affiliates_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_affiliates_updated_at" BEFORE UPDATE ON "company_os"."affiliates" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: bookings set_amount_usd_cents_bookings; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_amount_usd_cents_bookings" BEFORE INSERT OR UPDATE OF "amount_cents", "currency" ON "company_os"."bookings" FOR EACH ROW EXECUTE FUNCTION "company_os"."set_amount_usd_cents"();


--
-- Name: orders set_amount_usd_cents_orders; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_amount_usd_cents_orders" BEFORE INSERT OR UPDATE OF "amount_cents", "currency" ON "company_os"."orders" FOR EACH ROW EXECUTE FUNCTION "company_os"."set_amount_usd_cents"();


--
-- Name: products set_amount_usd_cents_products; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_amount_usd_cents_products" BEFORE INSERT OR UPDATE OF "amount_cents", "currency" ON "company_os"."products" FOR EACH ROW EXECUTE FUNCTION "company_os"."set_amount_usd_cents"();


--
-- Name: application_stages set_application_stages_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_application_stages_updated_at" BEFORE UPDATE ON "company_os"."application_stages" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: applications set_applications_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_applications_updated_at" BEFORE UPDATE ON "company_os"."applications" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: board_columns set_board_columns_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_board_columns_updated_at" BEFORE UPDATE ON "company_os"."board_columns" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: boards set_boards_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_boards_updated_at" BEFORE UPDATE ON "company_os"."boards" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: book_chapters set_book_chapters_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_book_chapters_updated_at" BEFORE UPDATE ON "company_os"."book_chapters" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: bookings set_bookings_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_bookings_updated_at" BEFORE UPDATE ON "company_os"."bookings" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: books set_books_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_books_updated_at" BEFORE UPDATE ON "company_os"."books" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: brand_profiles set_brand_profiles_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_brand_profiles_updated_at" BEFORE UPDATE ON "company_os"."brand_profiles" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: brands set_brands_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_brands_updated_at" BEFORE UPDATE ON "company_os"."brands" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: candidates set_candidates_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_candidates_updated_at" BEFORE UPDATE ON "company_os"."candidates" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: companies set_companies_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_companies_updated_at" BEFORE UPDATE ON "company_os"."companies" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: company_profile set_company_profile_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_company_profile_updated_at" BEFORE UPDATE ON "company_os"."company_profile" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: compensation_sensitive set_compensation_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_compensation_updated_at" BEFORE UPDATE ON "company_os"."compensation_sensitive" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: deals set_deals_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_deals_updated_at" BEFORE UPDATE ON "company_os"."deals" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: deals deals_stage_decides; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "deals_stage_decides" BEFORE INSERT OR UPDATE ON "company_os"."deals" FOR EACH ROW EXECUTE FUNCTION "company_os"."deals_stage_decides"();


--
-- Name: deals deals_log_stage_move; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "deals_log_stage_move" AFTER INSERT OR UPDATE OF "stage_id" ON "company_os"."deals" FOR EACH ROW EXECUTE FUNCTION "company_os"."deals_log_stage_move"();


--
-- Name: deals deals_derive_usd; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "deals_derive_usd" BEFORE INSERT OR UPDATE OF "amount_cents", "currency" ON "company_os"."deals" FOR EACH ROW EXECUTE FUNCTION "company_os"."deals_derive_usd"();


--
-- Name: departments set_departments_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_departments_updated_at" BEFORE UPDATE ON "company_os"."departments" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: email_campaigns set_email_campaigns_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_email_campaigns_updated_at" BEFORE UPDATE ON "company_os"."email_campaigns" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: events set_events_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_events_updated_at" BEFORE UPDATE ON "company_os"."events" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: expenses set_expenses_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_expenses_updated_at" BEFORE UPDATE ON "company_os"."expenses" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: interview_scorecards set_interview_scorecards_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_interview_scorecards_updated_at" BEFORE UPDATE ON "company_os"."interview_scorecards" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: interviews set_interviews_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_interviews_updated_at" BEFORE UPDATE ON "company_os"."interviews" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: job_requisitions set_job_requisitions_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_job_requisitions_updated_at" BEFORE UPDATE ON "company_os"."job_requisitions" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: legal_entities set_legal_entities_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_legal_entities_updated_at" BEFORE UPDATE ON "company_os"."legal_entities" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: marketing_content set_marketing_calendar_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_marketing_calendar_updated_at" BEFORE UPDATE ON "company_os"."marketing_content" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: marketing_campaigns set_marketing_campaigns_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_marketing_campaigns_updated_at" BEFORE UPDATE ON "company_os"."marketing_campaigns" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: marketing_pillars set_marketing_pillars_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_marketing_pillars_updated_at" BEFORE UPDATE ON "company_os"."marketing_pillars" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: meeting_action_items set_meeting_action_items_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_meeting_action_items_updated_at" BEFORE UPDATE ON "company_os"."meeting_action_items" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: meetings set_meetings_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_meetings_updated_at" BEFORE UPDATE ON "company_os"."meetings" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: offers set_offers_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_offers_updated_at" BEFORE UPDATE ON "company_os"."offers" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: onboarding_tasks set_onboarding_tasks_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_onboarding_tasks_updated_at" BEFORE UPDATE ON "company_os"."onboarding_tasks" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: orders set_orders_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_orders_updated_at" BEFORE UPDATE ON "company_os"."orders" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: people set_people_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_people_updated_at" BEFORE UPDATE ON "company_os"."people" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: performance_reviews set_performance_reviews_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_performance_reviews_updated_at" BEFORE UPDATE ON "company_os"."performance_reviews" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: person_companies set_person_companies_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_person_companies_updated_at" BEFORE UPDATE ON "company_os"."person_companies" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: person_qualifications set_person_qualifications_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_person_qualifications_updated_at" BEFORE UPDATE ON "company_os"."person_qualifications" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: pipelines set_pipelines_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_pipelines_updated_at" BEFORE UPDATE ON "company_os"."pipelines" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: positions set_positions_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_positions_updated_at" BEFORE UPDATE ON "company_os"."positions" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: products set_products_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_products_updated_at" BEFORE UPDATE ON "company_os"."products" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: sprints set_sprints_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_sprints_updated_at" BEFORE UPDATE ON "company_os"."sprints" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: sprints sprints_set_week; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "sprints_set_week" BEFORE INSERT OR UPDATE ON "company_os"."sprints" FOR EACH ROW EXECUTE FUNCTION "company_os"."sprints_set_week"();


--
-- Name: epics set_epics_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_epics_updated_at" BEFORE UPDATE ON "company_os"."epics" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: subscriptions set_subscriptions_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_subscriptions_updated_at" BEFORE UPDATE ON "company_os"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: tasks set_tasks_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_tasks_updated_at" BEFORE UPDATE ON "company_os"."tasks" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: tasks tasks_children_follow_card; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "tasks_children_follow_card" AFTER UPDATE OF "status" ON "company_os"."tasks" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "company_os"."tasks_children_follow_card"();


--
-- Name: team_members set_team_members_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_team_members_updated_at" BEFORE UPDATE ON "company_os"."team_members" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: time_off set_time_off_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_time_off_updated_at" BEFORE UPDATE ON "company_os"."time_off" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: candidate_sensitive set_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "company_os"."candidate_sensitive" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: event_agenda_blocks set_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "company_os"."event_agenda_blocks" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: event_pnl_lines set_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "company_os"."event_pnl_lines" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: people_sensitive set_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "company_os"."people_sensitive" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: vendors set_vendors_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_vendors_updated_at" BEFORE UPDATE ON "company_os"."vendors" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--
-- Name: man_hour_entries man_hour_entries_set_updated_at; Type: TRIGGER; Schema: htt; Owner: -
--

CREATE TRIGGER "man_hour_entries_set_updated_at" BEFORE UPDATE ON "htt"."man_hour_entries" FOR EACH ROW EXECUTE FUNCTION "htt"."set_updated_at"();


--
-- Name: pull_requests pull_requests_set_updated_at; Type: TRIGGER; Schema: htt; Owner: -
--

CREATE TRIGGER "pull_requests_set_updated_at" BEFORE UPDATE ON "htt"."pull_requests" FOR EACH ROW EXECUTE FUNCTION "htt"."set_updated_at"();


--
-- Name: repos repos_set_updated_at; Type: TRIGGER; Schema: htt; Owner: -
--

CREATE TRIGGER "repos_set_updated_at" BEFORE UPDATE ON "htt"."repos" FOR EACH ROW EXECUTE FUNCTION "htt"."set_updated_at"();


--
-- Name: token_entries token_entries_set_updated_at; Type: TRIGGER; Schema: htt; Owner: -
--

CREATE TRIGGER "token_entries_set_updated_at" BEFORE UPDATE ON "htt"."token_entries" FOR EACH ROW EXECUTE FUNCTION "htt"."set_updated_at"();


--
-- Name: admins admins_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."admins"
    ADD CONSTRAINT "admins_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;


--
-- Name: affiliate_commissions affiliate_commissions_affiliate_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "company_os"."affiliates"("id");


--
-- Name: affiliate_commissions affiliate_commissions_order_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "company_os"."orders"("id");


--
-- Name: affiliate_commissions affiliate_commissions_payout_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "company_os"."affiliate_payouts"("id");


--
-- Name: affiliate_payouts affiliate_payouts_affiliate_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "company_os"."affiliates"("id");


--
-- Name: affiliates affiliates_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."affiliates"
    ADD CONSTRAINT "affiliates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: affiliates affiliates_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."affiliates"
    ADD CONSTRAINT "affiliates_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: ai_programs ai_programs_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."ai_programs"
    ADD CONSTRAINT "ai_programs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: application_stage_log application_stage_log_application_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."application_stage_log"
    ADD CONSTRAINT "application_stage_log_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "company_os"."applications"("id") ON DELETE CASCADE;


--
-- Name: application_stage_log application_stage_log_from_stage_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."application_stage_log"
    ADD CONSTRAINT "application_stage_log_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "company_os"."application_stages"("id");


--
-- Name: application_stage_log application_stage_log_moved_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."application_stage_log"
    ADD CONSTRAINT "application_stage_log_moved_by_fkey" FOREIGN KEY ("moved_by") REFERENCES "company_os"."team_members"("id");


--
-- Name: application_stage_log application_stage_log_to_stage_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."application_stage_log"
    ADD CONSTRAINT "application_stage_log_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "company_os"."application_stages"("id");


--
-- Name: application_stages application_stages_job_requisition_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."application_stages"
    ADD CONSTRAINT "application_stages_job_requisition_id_fkey" FOREIGN KEY ("job_requisition_id") REFERENCES "company_os"."job_requisitions"("id") ON DELETE CASCADE;


--
-- Name: applications applications_candidate_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."applications"
    ADD CONSTRAINT "applications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "company_os"."candidates"("id") ON DELETE CASCADE;


--
-- Name: applications applications_current_stage_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."applications"
    ADD CONSTRAINT "applications_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "company_os"."application_stages"("id");


--
-- Name: applications applications_job_requisition_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."applications"
    ADD CONSTRAINT "applications_job_requisition_id_fkey" FOREIGN KEY ("job_requisition_id") REFERENCES "company_os"."job_requisitions"("id") ON DELETE CASCADE;


--
-- Name: applications applications_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."applications"
    ADD CONSTRAINT "applications_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: applications applications_referrer_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."applications"
    ADD CONSTRAINT "applications_referrer_person_id_fkey" FOREIGN KEY ("referrer_person_id") REFERENCES "company_os"."people"("id");


--
-- Name: applications applications_resume_document_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."applications"
    ADD CONSTRAINT "applications_resume_document_id_fkey" FOREIGN KEY ("resume_document_id") REFERENCES "company_os"."documents"("id");


--
-- Name: assistant_conversations assistant_conversations_owner_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."assistant_conversations"
    ADD CONSTRAINT "assistant_conversations_owner_person_id_fkey" FOREIGN KEY ("owner_person_id") REFERENCES "company_os"."people"("id");


--
-- Name: audit_log audit_log_actor_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."audit_log"
    ADD CONSTRAINT "audit_log_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "company_os"."people"("id");


--
-- Name: board_columns board_columns_board_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."board_columns"
    ADD CONSTRAINT "board_columns_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "company_os"."boards"("id") ON DELETE CASCADE;


--
-- Name: board_members board_members_board_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."board_members"
    ADD CONSTRAINT "board_members_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "company_os"."boards"("id") ON DELETE CASCADE;


--
-- Name: board_members board_members_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."board_members"
    ADD CONSTRAINT "board_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: boards boards_ai_program_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."boards"
    ADD CONSTRAINT "boards_ai_program_id_fkey" FOREIGN KEY ("ai_program_id") REFERENCES "company_os"."ai_programs"("id") ON DELETE SET NULL;


--
-- Name: boards boards_client_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."boards"
    ADD CONSTRAINT "boards_client_company_id_fkey" FOREIGN KEY ("client_company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: boards boards_owner_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."boards"
    ADD CONSTRAINT "boards_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "company_os"."people"("id");


--
-- Name: book_chapters book_chapters_book_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."book_chapters"
    ADD CONSTRAINT "book_chapters_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "company_os"."books"("id") ON DELETE CASCADE;


--
-- Name: bookings bookings_order_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."bookings"
    ADD CONSTRAINT "bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "company_os"."orders"("id");


--
-- Name: bookings bookings_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."bookings"
    ADD CONSTRAINT "bookings_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: bookings bookings_product_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."bookings"
    ADD CONSTRAINT "bookings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "company_os"."products"("id");


--
-- Name: books books_brand_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."books"
    ADD CONSTRAINT "books_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "company_os"."brands"("id");


--
-- Name: brand_profiles brand_profiles_brand_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."brand_profiles"
    ADD CONSTRAINT "brand_profiles_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "company_os"."brands"("id") ON DELETE CASCADE;


--
-- Name: call_scorecards call_scorecards_call_transcript_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."call_scorecards"
    ADD CONSTRAINT "call_scorecards_call_transcript_id_fkey" FOREIGN KEY ("call_transcript_id") REFERENCES "company_os"."call_transcripts"("id") ON DELETE CASCADE;


--
-- Name: call_transcripts call_transcripts_meeting_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."call_transcripts"
    ADD CONSTRAINT "call_transcripts_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "company_os"."meetings"("id") ON DELETE SET NULL;


--
-- Name: candidate_profile candidate_profile_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."candidate_profile"
    ADD CONSTRAINT "candidate_profile_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: candidate_sensitive candidate_sensitive_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."candidate_sensitive"
    ADD CONSTRAINT "candidate_sensitive_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: candidates candidates_current_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."candidates"
    ADD CONSTRAINT "candidates_current_company_id_fkey" FOREIGN KEY ("current_company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: candidates candidates_owner_recruiter_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."candidates"
    ADD CONSTRAINT "candidates_owner_recruiter_id_fkey" FOREIGN KEY ("owner_recruiter_id") REFERENCES "company_os"."team_members"("id");


--
-- Name: candidates candidates_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."candidates"
    ADD CONSTRAINT "candidates_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: candidates candidates_resume_document_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."candidates"
    ADD CONSTRAINT "candidates_resume_document_id_fkey" FOREIGN KEY ("resume_document_id") REFERENCES "company_os"."documents"("id");


--
-- Name: capacity_commitments capacity_commitments_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."capacity_commitments"
    ADD CONSTRAINT "capacity_commitments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE SET NULL;


--
-- Name: capacity_commitments capacity_commitments_role_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."capacity_commitments"
    ADD CONSTRAINT "capacity_commitments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "company_os"."capacity_roles"("id") ON DELETE CASCADE;


--
-- Name: capacity_roles capacity_roles_position_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."capacity_roles"
    ADD CONSTRAINT "capacity_roles_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "company_os"."positions"("id") ON DELETE SET NULL;


--
-- Name: client_backlog_items client_backlog_items_ai_program_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."client_backlog_items"
    ADD CONSTRAINT "client_backlog_items_ai_program_id_fkey" FOREIGN KEY ("ai_program_id") REFERENCES "company_os"."ai_programs"("id") ON DELETE SET NULL;


--
-- Name: client_backlog_items client_backlog_items_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."client_backlog_items"
    ADD CONSTRAINT "client_backlog_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE CASCADE;


--
-- Name: client_roadmap_groups client_roadmap_groups_ai_program_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."client_roadmap_groups"
    ADD CONSTRAINT "client_roadmap_groups_ai_program_id_fkey" FOREIGN KEY ("ai_program_id") REFERENCES "company_os"."ai_programs"("id") ON DELETE SET NULL;


--
-- Name: client_roadmap_groups client_roadmap_groups_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."client_roadmap_groups"
    ADD CONSTRAINT "client_roadmap_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE CASCADE;


--
-- Name: client_roadmap_overview client_roadmap_overview_ai_program_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."client_roadmap_overview"
    ADD CONSTRAINT "client_roadmap_overview_ai_program_id_fkey" FOREIGN KEY ("ai_program_id") REFERENCES "company_os"."ai_programs"("id") ON DELETE SET NULL;


--
-- Name: client_roadmap_overview client_roadmap_overview_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."client_roadmap_overview"
    ADD CONSTRAINT "client_roadmap_overview_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE CASCADE;


--
-- Name: coaching_checkins coaching_checkins_coaching_profile_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_checkins"
    ADD CONSTRAINT "coaching_checkins_coaching_profile_id_fkey" FOREIGN KEY ("coaching_profile_id") REFERENCES "company_os"."coaching_profiles"("id") ON DELETE CASCADE;


--
-- Name: coaching_commitment_history coaching_commitment_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_commitment_history"
    ADD CONSTRAINT "coaching_commitment_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "company_os"."team_members"("id");


--
-- Name: coaching_commitment_history coaching_commitment_history_commitment_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_commitment_history"
    ADD CONSTRAINT "coaching_commitment_history_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "company_os"."coaching_commitments"("id") ON DELETE CASCADE;


--
-- Name: coaching_commitments coaching_commitments_coaching_profile_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_commitments"
    ADD CONSTRAINT "coaching_commitments_coaching_profile_id_fkey" FOREIGN KEY ("coaching_profile_id") REFERENCES "company_os"."coaching_profiles"("id") ON DELETE CASCADE;


--
-- Name: coaching_commitments coaching_commitments_created_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_commitments"
    ADD CONSTRAINT "coaching_commitments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "company_os"."team_members"("id");


--
-- Name: coaching_commitments coaching_commitments_one_on_one_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_commitments"
    ADD CONSTRAINT "coaching_commitments_one_on_one_id_fkey" FOREIGN KEY ("one_on_one_id") REFERENCES "company_os"."coaching_one_on_ones"("id") ON DELETE SET NULL;


--
-- Name: coaching_commitments coaching_commitments_status_updated_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_commitments"
    ADD CONSTRAINT "coaching_commitments_status_updated_by_fkey" FOREIGN KEY ("status_updated_by") REFERENCES "company_os"."team_members"("id");


--
-- Name: coaching_context coaching_context_coach_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_context"
    ADD CONSTRAINT "coaching_context_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "company_os"."team_members"("id");


--
-- Name: coaching_goal_comments coaching_goal_comments_author_team_member_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_goal_comments"
    ADD CONSTRAINT "coaching_goal_comments_author_team_member_id_fkey" FOREIGN KEY ("author_team_member_id") REFERENCES "company_os"."team_members"("id");


--
-- Name: coaching_goal_comments coaching_goal_comments_goal_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_goal_comments"
    ADD CONSTRAINT "coaching_goal_comments_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "company_os"."goals"("id") ON DELETE CASCADE;


--
-- Name: goals coaching_goals_coaching_profile_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."goals"
    ADD CONSTRAINT "coaching_goals_coaching_profile_id_fkey" FOREIGN KEY ("coaching_profile_id") REFERENCES "company_os"."coaching_profiles"("id") ON DELETE CASCADE;


--
-- Name: goals coaching_goals_created_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."goals"
    ADD CONSTRAINT "coaching_goals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "company_os"."team_members"("id");


--
-- Name: goals coaching_goals_key_result_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."goals"
    ADD CONSTRAINT "coaching_goals_key_result_id_fkey" FOREIGN KEY ("key_result_id") REFERENCES "company_os"."key_results"("id") ON DELETE SET NULL;


--
-- Name: goals coaching_goals_objective_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."goals"
    ADD CONSTRAINT "coaching_goals_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "company_os"."objectives"("id") ON DELETE SET NULL;


--
-- Name: coaching_member_notes coaching_member_notes_coaching_profile_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_member_notes"
    ADD CONSTRAINT "coaching_member_notes_coaching_profile_id_fkey" FOREIGN KEY ("coaching_profile_id") REFERENCES "company_os"."coaching_profiles"("id") ON DELETE CASCADE;


--
-- Name: coaching_ocean_profiles coaching_ocean_profiles_coaching_profile_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_ocean_profiles"
    ADD CONSTRAINT "coaching_ocean_profiles_coaching_profile_id_fkey" FOREIGN KEY ("coaching_profile_id") REFERENCES "company_os"."coaching_profiles"("id") ON DELETE CASCADE;


--
-- Name: coaching_one_on_ones coaching_one_on_ones_coaching_profile_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_one_on_ones"
    ADD CONSTRAINT "coaching_one_on_ones_coaching_profile_id_fkey" FOREIGN KEY ("coaching_profile_id") REFERENCES "company_os"."coaching_profiles"("id") ON DELETE CASCADE;


--
-- Name: coaching_one_on_ones coaching_one_on_ones_led_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_one_on_ones"
    ADD CONSTRAINT "coaching_one_on_ones_led_by_fkey" FOREIGN KEY ("led_by") REFERENCES "company_os"."team_members"("id") ON DELETE SET NULL;


--
-- Name: lark_user_connections lark_user_connections_team_member_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."lark_user_connections"
    ADD CONSTRAINT "lark_user_connections_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "company_os"."team_members"("id") ON DELETE CASCADE;


--
-- Name: coaching_one_on_ones coaching_one_on_ones_meeting_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_one_on_ones"
    ADD CONSTRAINT "coaching_one_on_ones_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "company_os"."meetings"("id");


--
-- Name: coaching_priorities coaching_priorities_coaching_profile_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_priorities"
    ADD CONSTRAINT "coaching_priorities_coaching_profile_id_fkey" FOREIGN KEY ("coaching_profile_id") REFERENCES "company_os"."coaching_profiles"("id") ON DELETE CASCADE;


--
-- Name: coaching_priorities coaching_priorities_key_result_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_priorities"
    ADD CONSTRAINT "coaching_priorities_key_result_id_fkey" FOREIGN KEY ("key_result_id") REFERENCES "company_os"."key_results"("id") ON DELETE SET NULL;


--
-- Name: coaching_priorities coaching_priorities_objective_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_priorities"
    ADD CONSTRAINT "coaching_priorities_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "company_os"."objectives"("id") ON DELETE SET NULL;


--
-- Name: coaching_profiles coaching_profiles_coach_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_profiles"
    ADD CONSTRAINT "coaching_profiles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "company_os"."team_members"("id");


--
-- Name: coaching_profiles coaching_profiles_team_member_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_profiles"
    ADD CONSTRAINT "coaching_profiles_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "company_os"."team_members"("id") ON DELETE CASCADE;


--
-- Name: coaching_talking_points coaching_talking_points_author_team_member_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_talking_points"
    ADD CONSTRAINT "coaching_talking_points_author_team_member_id_fkey" FOREIGN KEY ("author_team_member_id") REFERENCES "company_os"."team_members"("id");


--
-- Name: coaching_talking_points coaching_talking_points_coaching_profile_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_talking_points"
    ADD CONSTRAINT "coaching_talking_points_coaching_profile_id_fkey" FOREIGN KEY ("coaching_profile_id") REFERENCES "company_os"."coaching_profiles"("id") ON DELETE CASCADE;


--
-- Name: coaching_trends coaching_trends_coaching_profile_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_trends"
    ADD CONSTRAINT "coaching_trends_coaching_profile_id_fkey" FOREIGN KEY ("coaching_profile_id") REFERENCES "company_os"."coaching_profiles"("id") ON DELETE CASCADE;


--
-- Name: coaching_trends coaching_trends_one_on_one_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."coaching_trends"
    ADD CONSTRAINT "coaching_trends_one_on_one_id_fkey" FOREIGN KEY ("one_on_one_id") REFERENCES "company_os"."coaching_one_on_ones"("id") ON DELETE SET NULL;


--
-- Name: companies companies_owner_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."companies"
    ADD CONSTRAINT "companies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "company_os"."people"("id");


--
-- Name: company_github_orgs company_github_orgs_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."company_github_orgs"
    ADD CONSTRAINT "company_github_orgs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE CASCADE;


--
-- Name: company_profile company_profile_updated_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."company_profile"
    ADD CONSTRAINT "company_profile_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "company_os"."people"("id");


--
-- Name: compensation_sensitive compensation_approved_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."compensation_sensitive"
    ADD CONSTRAINT "compensation_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "company_os"."team_members"("id");


--
-- Name: compensation_sensitive compensation_team_member_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."compensation_sensitive"
    ADD CONSTRAINT "compensation_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "company_os"."team_members"("id") ON DELETE CASCADE;


--
-- Name: contractor_payments contractor_payments_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_payments"
    ADD CONSTRAINT "contractor_payments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: contractor_work_events contractor_work_events_request_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_work_events"
    ADD CONSTRAINT "contractor_work_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "company_os"."contractor_work_requests"("id") ON DELETE CASCADE;


--
-- Name: contractor_work_requests contractor_work_requests_billed_invoice_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_work_requests"
    ADD CONSTRAINT "contractor_work_requests_billed_invoice_id_fkey" FOREIGN KEY ("billed_invoice_id") REFERENCES "company_os"."invoices"("id");


--
-- Name: contractor_work_requests contractor_work_requests_client_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_work_requests"
    ADD CONSTRAINT "contractor_work_requests_client_company_id_fkey" FOREIGN KEY ("client_company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: contractor_work_requests contractor_work_requests_payment_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_work_requests"
    ADD CONSTRAINT "contractor_work_requests_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "company_os"."contractor_payments"("id");


--
-- Name: contractor_work_requests contractor_work_requests_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_work_requests"
    ADD CONSTRAINT "contractor_work_requests_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: contractor_work_requests contractor_work_requests_requested_by_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."contractor_work_requests"
    ADD CONSTRAINT "contractor_work_requests_requested_by_person_id_fkey" FOREIGN KEY ("requested_by_person_id") REFERENCES "company_os"."people"("id");


--
-- Name: deals deals_affiliate_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deals"
    ADD CONSTRAINT "deals_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "company_os"."affiliates"("id");


--
-- Name: deals deals_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deals"
    ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: deals deals_owner_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deals"
    ADD CONSTRAINT "deals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "company_os"."people"("id");


--
-- Name: deals deals_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deals"
    ADD CONSTRAINT "deals_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: deals deals_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deals"
    ADD CONSTRAINT "deals_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "company_os"."pipelines"("id");


--
-- Name: deals deals_referrer_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deals"
    ADD CONSTRAINT "deals_referrer_company_id_fkey" FOREIGN KEY ("referrer_company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: deals deals_referrer_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deals"
    ADD CONSTRAINT "deals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;


--
-- Name: deals deals_service_line_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deals"
    ADD CONSTRAINT "deals_service_line_id_fkey" FOREIGN KEY ("service_line_id") REFERENCES "company_os"."service_lines"("id");


--
-- Name: deals deals_stage_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deals"
    ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "company_os"."pipeline_stages"("id");


--
-- Name: departments departments_head_team_member_fk; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."departments"
    ADD CONSTRAINT "departments_head_team_member_fk" FOREIGN KEY ("head_team_member_id") REFERENCES "company_os"."team_members"("id");


--
-- Name: departments departments_parent_department_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."departments"
    ADD CONSTRAINT "departments_parent_department_id_fkey" FOREIGN KEY ("parent_department_id") REFERENCES "company_os"."departments"("id");


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."documents"
    ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "company_os"."people"("id");


--
-- Name: email_campaign_recipients email_campaign_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."email_campaign_recipients"
    ADD CONSTRAINT "email_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "company_os"."email_campaigns"("id") ON DELETE CASCADE;


--
-- Name: email_campaign_recipients email_campaign_recipients_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."email_campaign_recipients"
    ADD CONSTRAINT "email_campaign_recipients_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: email_campaigns email_campaigns_brand_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "company_os"."brands"("id") ON DELETE SET NULL;


--
-- Name: email_events email_events_campaign_fk; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."email_events"
    ADD CONSTRAINT "email_events_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "company_os"."email_campaigns"("id") ON DELETE SET NULL;


--
-- Name: email_events email_events_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."email_events"
    ADD CONSTRAINT "email_events_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: equipment_assignments equipment_assignments_equipment_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."equipment_assignments"
    ADD CONSTRAINT "equipment_assignments_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "company_os"."equipment"("id") ON DELETE CASCADE;


--
-- Name: equipment_assignments equipment_assignments_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."equipment_assignments"
    ADD CONSTRAINT "equipment_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE RESTRICT;


--
-- Name: equipment equipment_current_holder_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."equipment"
    ADD CONSTRAINT "equipment_current_holder_id_fkey" FOREIGN KEY ("current_holder_id") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;


--
-- Name: equipment_requests equipment_requests_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."equipment_requests"
    ADD CONSTRAINT "equipment_requests_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: equipment equipment_vendor_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."equipment"
    ADD CONSTRAINT "equipment_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "company_os"."vendors"("id") ON DELETE SET NULL;


--
-- Name: event_agenda_blocks event_agenda_blocks_event_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_agenda_blocks"
    ADD CONSTRAINT "event_agenda_blocks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "company_os"."events"("id") ON DELETE CASCADE;


--
-- Name: event_agenda_staff event_agenda_staff_block_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_agenda_staff"
    ADD CONSTRAINT "event_agenda_staff_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "company_os"."event_agenda_blocks"("id") ON DELETE CASCADE;


--
-- Name: event_agenda_staff event_agenda_staff_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_agenda_staff"
    ADD CONSTRAINT "event_agenda_staff_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: event_pnl_lines event_pnl_lines_event_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_pnl_lines"
    ADD CONSTRAINT "event_pnl_lines_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "company_os"."events"("id") ON DELETE CASCADE;


--
-- Name: event_pnl_lines event_pnl_lines_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_pnl_lines"
    ADD CONSTRAINT "event_pnl_lines_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;


--
-- Name: event_registrations event_registrations_event_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "company_os"."events"("id") ON DELETE SET NULL;


--
-- Name: event_registrations event_registrations_order_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_registrations"
    ADD CONSTRAINT "event_registrations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "company_os"."orders"("id") ON DELETE CASCADE;


--
-- Name: event_registrations event_registrations_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_registrations"
    ADD CONSTRAINT "event_registrations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: event_registrations event_registrations_product_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_registrations"
    ADD CONSTRAINT "event_registrations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "company_os"."products"("id");


--
-- Name: event_talks event_talks_event_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_talks"
    ADD CONSTRAINT "event_talks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "company_os"."events"("id") ON DELETE CASCADE;


--
-- Name: event_talks event_talks_talk_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."event_talks"
    ADD CONSTRAINT "event_talks_talk_id_fkey" FOREIGN KEY ("talk_id") REFERENCES "company_os"."talks"("id") ON DELETE CASCADE;


--
-- Name: events events_feedback_survey_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."events"
    ADD CONSTRAINT "events_feedback_survey_id_fkey" FOREIGN KEY ("feedback_survey_id") REFERENCES "company_os"."surveys"("id") ON DELETE SET NULL;


--
-- Name: events events_owner_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."events"
    ADD CONSTRAINT "events_owner_person_id_fkey" FOREIGN KEY ("owner_person_id") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;


--
-- Name: expenses expenses_vendor_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."expenses"
    ADD CONSTRAINT "expenses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "company_os"."vendors"("id");


--
-- Name: expenses expenses_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."expenses"
    ADD CONSTRAINT "expenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE SET NULL;


--
-- Name: gallery_photo_people gallery_photo_people_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."gallery_photo_people"
    ADD CONSTRAINT "gallery_photo_people_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: gallery_photo_people gallery_photo_people_photo_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."gallery_photo_people"
    ADD CONSTRAINT "gallery_photo_people_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "company_os"."gallery_photos"("id") ON DELETE CASCADE;


--
-- Name: gallery_photo_people gallery_photo_people_tagged_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."gallery_photo_people"
    ADD CONSTRAINT "gallery_photo_people_tagged_by_fkey" FOREIGN KEY ("tagged_by") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;


--
-- Name: ideas ideas_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."ideas"
    ADD CONSTRAINT "ideas_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: inquiries inquiries_affiliate_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."inquiries"
    ADD CONSTRAINT "inquiries_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "company_os"."affiliates"("id");


--
-- Name: inquiries inquiries_deal_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."inquiries"
    ADD CONSTRAINT "inquiries_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "company_os"."deals"("id");


--
-- Name: inquiries inquiries_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."inquiries"
    ADD CONSTRAINT "inquiries_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: interactions interactions_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interactions"
    ADD CONSTRAINT "interactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE CASCADE;


--
-- Name: interactions interactions_owner_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interactions"
    ADD CONSTRAINT "interactions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "company_os"."people"("id");


--
-- Name: interactions interactions_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interactions"
    ADD CONSTRAINT "interactions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: interview_interviewers interview_interviewers_interview_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interview_interviewers"
    ADD CONSTRAINT "interview_interviewers_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "company_os"."interviews"("id") ON DELETE CASCADE;


--
-- Name: interview_interviewers interview_interviewers_interviewer_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interview_interviewers"
    ADD CONSTRAINT "interview_interviewers_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: interview_scorecards interview_scorecards_interview_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interview_scorecards"
    ADD CONSTRAINT "interview_scorecards_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "company_os"."interviews"("id") ON DELETE CASCADE;


--
-- Name: interview_scorecards interview_scorecards_interviewer_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interview_scorecards"
    ADD CONSTRAINT "interview_scorecards_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "company_os"."people"("id");


--
-- Name: interviews interviews_application_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interviews"
    ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "company_os"."applications"("id") ON DELETE CASCADE;


--
-- Name: interviews interviews_application_stage_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interviews"
    ADD CONSTRAINT "interviews_application_stage_id_fkey" FOREIGN KEY ("application_stage_id") REFERENCES "company_os"."application_stages"("id");


--
-- Name: interviews interviews_loop_step_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interviews"
    ADD CONSTRAINT "interviews_loop_step_id_fkey" FOREIGN KEY ("loop_step_id") REFERENCES "company_os"."requisition_loop_steps"("id") ON DELETE SET NULL;


--
-- Name: interviews interviews_meeting_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."interviews"
    ADD CONSTRAINT "interviews_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "company_os"."meetings"("id");


--
-- Name: invoices invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."invoices"
    ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: issues issues_assignee_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."issues"
    ADD CONSTRAINT "issues_assignee_person_id_fkey" FOREIGN KEY ("assignee_person_id") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;


--
-- Name: issues issues_key_result_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."issues"
    ADD CONSTRAINT "issues_key_result_id_fkey" FOREIGN KEY ("key_result_id") REFERENCES "company_os"."key_results"("id") ON DELETE SET NULL;


--
-- Name: job_requisitions job_requisitions_client_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."job_requisitions"
    ADD CONSTRAINT "job_requisitions_client_company_id_fkey" FOREIGN KEY ("client_company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: job_requisitions job_requisitions_department_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."job_requisitions"
    ADD CONSTRAINT "job_requisitions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "company_os"."departments"("id");


--
-- Name: job_requisitions job_requisitions_hiring_manager_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."job_requisitions"
    ADD CONSTRAINT "job_requisitions_hiring_manager_id_fkey" FOREIGN KEY ("hiring_manager_id") REFERENCES "company_os"."people"("id");


--
-- Name: job_requisitions job_requisitions_position_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."job_requisitions"
    ADD CONSTRAINT "job_requisitions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "company_os"."positions"("id");


--
-- Name: job_requisitions job_requisitions_recruiter_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."job_requisitions"
    ADD CONSTRAINT "job_requisitions_recruiter_id_fkey" FOREIGN KEY ("recruiter_id") REFERENCES "company_os"."team_members"("id");


--
-- Name: key_results key_results_accountable_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."key_results"
    ADD CONSTRAINT "key_results_accountable_person_id_fkey" FOREIGN KEY ("accountable_person_id") REFERENCES "company_os"."people"("id");


--
-- Name: key_results key_results_objective_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."key_results"
    ADD CONSTRAINT "key_results_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "company_os"."objectives"("id") ON DELETE CASCADE;


--
-- Name: kr_logs kr_logs_author_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."kr_logs"
    ADD CONSTRAINT "kr_logs_author_person_id_fkey" FOREIGN KEY ("author_person_id") REFERENCES "company_os"."people"("id");


--
-- Name: kr_logs kr_logs_key_result_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."kr_logs"
    ADD CONSTRAINT "kr_logs_key_result_id_fkey" FOREIGN KEY ("key_result_id") REFERENCES "company_os"."key_results"("id") ON DELETE CASCADE;


--
-- Name: lead lead_owner_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."lead"
    ADD CONSTRAINT "lead_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "company_os"."people"("id");


--
-- Name: lead lead_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."lead"
    ADD CONSTRAINT "lead_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: leave_adjustments leave_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."leave_adjustments"
    ADD CONSTRAINT "leave_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "company_os"."team_members"("id");


--
-- Name: leave_adjustments leave_adjustments_team_member_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."leave_adjustments"
    ADD CONSTRAINT "leave_adjustments_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "company_os"."team_members"("id") ON DELETE CASCADE;


--
-- Name: lifecycle_transitions lifecycle_transitions_changed_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."lifecycle_transitions"
    ADD CONSTRAINT "lifecycle_transitions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "company_os"."people"("id");


--
-- Name: lifecycle_transitions lifecycle_transitions_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."lifecycle_transitions"
    ADD CONSTRAINT "lifecycle_transitions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: lifecycle_transitions lifecycle_transitions_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."lifecycle_transitions"
    ADD CONSTRAINT "lifecycle_transitions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: marketing_asset_images marketing_asset_images_entry_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_asset_images"
    ADD CONSTRAINT "marketing_asset_images_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "company_os"."marketing_content"("id") ON DELETE CASCADE;


--
-- Name: marketing_content marketing_calendar_brand_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_content"
    ADD CONSTRAINT "marketing_calendar_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "company_os"."brands"("id") ON DELETE SET NULL;


--
-- Name: marketing_content marketing_calendar_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_content"
    ADD CONSTRAINT "marketing_calendar_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "company_os"."email_campaigns"("id") ON DELETE SET NULL;


--
-- Name: marketing_content marketing_calendar_campaign_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_content"
    ADD CONSTRAINT "marketing_calendar_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "company_os"."marketing_campaigns"("id") ON DELETE SET NULL;


--
-- Name: marketing_content marketing_calendar_parent_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_content"
    ADD CONSTRAINT "marketing_calendar_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "company_os"."marketing_content"("id") ON DELETE SET NULL;


--
-- Name: marketing_content marketing_calendar_pillar_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_content"
    ADD CONSTRAINT "marketing_calendar_pillar_id_fkey" FOREIGN KEY ("pillar_id") REFERENCES "company_os"."marketing_pillars"("id") ON DELETE SET NULL;


--
-- Name: marketing_campaigns marketing_campaigns_brand_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "company_os"."brands"("id") ON DELETE SET NULL;


--
-- Name: marketing_campaigns marketing_campaigns_pillar_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_pillar_id_fkey" FOREIGN KEY ("pillar_id") REFERENCES "company_os"."marketing_pillars"("id") ON DELETE SET NULL;


--
-- Name: marketing_pillars marketing_pillars_brand_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."marketing_pillars"
    ADD CONSTRAINT "marketing_pillars_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "company_os"."brands"("id") ON DELETE CASCADE;


--
-- Name: meeting_action_items meeting_action_items_assignee_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meeting_action_items"
    ADD CONSTRAINT "meeting_action_items_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "company_os"."people"("id");


--
-- Name: meeting_action_items meeting_action_items_meeting_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meeting_action_items"
    ADD CONSTRAINT "meeting_action_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "company_os"."meetings"("id") ON DELETE CASCADE;


--
-- Name: meeting_associations meeting_links_meeting_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meeting_associations"
    ADD CONSTRAINT "meeting_links_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "company_os"."meetings"("id") ON DELETE CASCADE;


--
-- Name: meeting_participants meeting_participants_meeting_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meeting_participants"
    ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "company_os"."meetings"("id") ON DELETE CASCADE;


--
-- Name: meeting_participants meeting_participants_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meeting_participants"
    ADD CONSTRAINT "meeting_participants_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: meetings meetings_ai_program_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meetings"
    ADD CONSTRAINT "meetings_ai_program_id_fkey" FOREIGN KEY ("ai_program_id") REFERENCES "company_os"."ai_programs"("id") ON DELETE SET NULL;


--
-- Name: meetings meetings_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meetings"
    ADD CONSTRAINT "meetings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: meetings meetings_owner_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."meetings"
    ADD CONSTRAINT "meetings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "company_os"."people"("id");


--
-- Name: objectives objectives_owner_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."objectives"
    ADD CONSTRAINT "objectives_owner_person_id_fkey" FOREIGN KEY ("owner_person_id") REFERENCES "company_os"."people"("id");


--
-- Name: objectives objectives_parent_kr_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."objectives"
    ADD CONSTRAINT "objectives_parent_kr_fkey" FOREIGN KEY ("parent_kr_id") REFERENCES "company_os"."key_results"("id");


--
-- Name: objectives objectives_strategy_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."objectives"
    ADD CONSTRAINT "objectives_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "company_os"."strategies"("id");


--
-- Name: offers offers_application_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."offers"
    ADD CONSTRAINT "offers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "company_os"."applications"("id") ON DELETE CASCADE;


--
-- Name: offers offers_approved_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."offers"
    ADD CONSTRAINT "offers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "company_os"."team_members"("id");


--
-- Name: offers offers_contract_document_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."offers"
    ADD CONSTRAINT "offers_contract_document_id_fkey" FOREIGN KEY ("contract_document_id") REFERENCES "company_os"."documents"("id");


--
-- Name: offers offers_position_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."offers"
    ADD CONSTRAINT "offers_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "company_os"."positions"("id");


--
-- Name: onboarding_plans onboarding_plans_decision_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."onboarding_plans"
    ADD CONSTRAINT "onboarding_plans_decision_by_fkey" FOREIGN KEY ("decision_by") REFERENCES "company_os"."team_members"("id");


--
-- Name: onboarding_plans onboarding_plans_plan_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."onboarding_plans"
    ADD CONSTRAINT "onboarding_plans_plan_uploaded_by_fkey" FOREIGN KEY ("plan_uploaded_by") REFERENCES "company_os"."team_members"("id");


--
-- Name: onboarding_plans onboarding_plans_team_member_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."onboarding_plans"
    ADD CONSTRAINT "onboarding_plans_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "company_os"."team_members"("id") ON DELETE CASCADE;


--
-- Name: onboarding_tasks onboarding_tasks_application_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."onboarding_tasks"
    ADD CONSTRAINT "onboarding_tasks_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "company_os"."applications"("id");


--
-- Name: onboarding_tasks onboarding_tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."onboarding_tasks"
    ADD CONSTRAINT "onboarding_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "company_os"."team_members"("id");


--
-- Name: onboarding_tasks onboarding_tasks_team_member_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."onboarding_tasks"
    ADD CONSTRAINT "onboarding_tasks_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "company_os"."team_members"("id") ON DELETE CASCADE;


--
-- Name: orders orders_affiliate_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."orders"
    ADD CONSTRAINT "orders_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "company_os"."affiliates"("id");


--
-- Name: orders orders_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."orders"
    ADD CONSTRAINT "orders_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: orders orders_product_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."orders"
    ADD CONSTRAINT "orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "company_os"."products"("id");


--
-- Name: people people_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."people"
    ADD CONSTRAINT "people_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");


--
-- Name: people people_owner_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."people"
    ADD CONSTRAINT "people_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "company_os"."people"("id");


--
-- Name: people_sensitive people_sensitive_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."people_sensitive"
    ADD CONSTRAINT "people_sensitive_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: performance_reviews performance_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."performance_reviews"
    ADD CONSTRAINT "performance_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "company_os"."team_members"("id");


--
-- Name: performance_reviews performance_reviews_team_member_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."performance_reviews"
    ADD CONSTRAINT "performance_reviews_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "company_os"."team_members"("id") ON DELETE CASCADE;


--
-- Name: person_companies person_companies_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."person_companies"
    ADD CONSTRAINT "person_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE CASCADE;


--
-- Name: person_companies person_companies_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."person_companies"
    ADD CONSTRAINT "person_companies_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: person_git_emails person_git_emails_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."person_git_emails"
    ADD CONSTRAINT "person_git_emails_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: person_qualifications person_qualifications_captured_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."person_qualifications"
    ADD CONSTRAINT "person_qualifications_captured_by_fkey" FOREIGN KEY ("captured_by") REFERENCES "company_os"."people"("id");


--
-- Name: person_qualifications person_qualifications_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."person_qualifications"
    ADD CONSTRAINT "person_qualifications_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: pipeline_stages pipeline_stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "company_os"."pipelines"("id") ON DELETE CASCADE;


--
-- Name: portal_assume_sessions portal_assume_sessions_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."portal_assume_sessions"
    ADD CONSTRAINT "portal_assume_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: portal_assume_sessions portal_assume_sessions_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."portal_assume_sessions"
    ADD CONSTRAINT "portal_assume_sessions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: portal_members portal_members_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."portal_members"
    ADD CONSTRAINT "portal_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: portal_members portal_members_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."portal_members"
    ADD CONSTRAINT "portal_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: positions positions_department_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."positions"
    ADD CONSTRAINT "positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "company_os"."departments"("id");


--
-- Name: products products_event_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."products"
    ADD CONSTRAINT "products_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "company_os"."events"("id") ON DELETE SET NULL;


--
-- Name: products products_service_line_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."products"
    ADD CONSTRAINT "products_service_line_id_fkey" FOREIGN KEY ("service_line_id") REFERENCES "company_os"."service_lines"("id");


--
-- Name: program_documents program_documents_ai_program_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."program_documents"
    ADD CONSTRAINT "program_documents_ai_program_id_fkey" FOREIGN KEY ("ai_program_id") REFERENCES "company_os"."ai_programs"("id") ON DELETE SET NULL;


--
-- Name: program_documents program_documents_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."program_documents"
    ADD CONSTRAINT "program_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: program_plans program_plans_ai_program_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."program_plans"
    ADD CONSTRAINT "program_plans_ai_program_id_fkey" FOREIGN KEY ("ai_program_id") REFERENCES "company_os"."ai_programs"("id") ON DELETE CASCADE;


--
-- Name: requisition_loop_steps requisition_loop_steps_job_requisition_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."requisition_loop_steps"
    ADD CONSTRAINT "requisition_loop_steps_job_requisition_id_fkey" FOREIGN KEY ("job_requisition_id") REFERENCES "company_os"."job_requisitions"("id") ON DELETE CASCADE;

--
-- Name: requisition_loop_interviewers requisition_loop_interviewers_interviewer_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."requisition_loop_interviewers"
    ADD CONSTRAINT "requisition_loop_interviewers_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "company_os"."people"("id");


--
-- Name: requisition_loop_interviewers requisition_loop_interviewers_loop_step_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."requisition_loop_interviewers"
    ADD CONSTRAINT "requisition_loop_interviewers_loop_step_id_fkey" FOREIGN KEY ("loop_step_id") REFERENCES "company_os"."requisition_loop_steps"("id") ON DELETE CASCADE;



--
-- Name: scorecard_scores scorecard_scores_scorecard_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."scorecard_scores"
    ADD CONSTRAINT "scorecard_scores_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "company_os"."interview_scorecards"("id") ON DELETE CASCADE;


--
-- Name: sprints sprints_board_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."sprints"
    ADD CONSTRAINT "sprints_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "company_os"."boards"("id") ON DELETE CASCADE;


--
-- Name: sprints sprints_meeting_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."sprints"
    ADD CONSTRAINT "sprints_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "company_os"."meetings"("id");


--
-- Name: staff_assignments staff_assignments_client_manager_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."staff_assignments"
    ADD CONSTRAINT "staff_assignments_client_manager_person_id_fkey" FOREIGN KEY ("client_manager_person_id") REFERENCES "company_os"."people"("id");


--
-- Name: staff_assignments staff_assignments_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."staff_assignments"
    ADD CONSTRAINT "staff_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: staff_assignments staff_assignments_team_member_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."staff_assignments"
    ADD CONSTRAINT "staff_assignments_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "company_os"."team_members"("id");


--
-- Name: subscriptions subscriptions_affiliate_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."subscriptions"
    ADD CONSTRAINT "subscriptions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "company_os"."affiliates"("id");


--
-- Name: subscriptions subscriptions_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."subscriptions"
    ADD CONSTRAINT "subscriptions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: subscriptions subscriptions_product_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."subscriptions"
    ADD CONSTRAINT "subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "company_os"."products"("id");


--
-- Name: survey_answers survey_answers_field_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."survey_answers"
    ADD CONSTRAINT "survey_answers_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "company_os"."survey_fields"("id") ON DELETE CASCADE;


--
-- Name: survey_answers survey_answers_response_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."survey_answers"
    ADD CONSTRAINT "survey_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "company_os"."survey_responses"("id") ON DELETE CASCADE;


--
-- Name: survey_fields survey_fields_survey_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."survey_fields"
    ADD CONSTRAINT "survey_fields_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "company_os"."surveys"("id") ON DELETE CASCADE;


--
-- Name: survey_responses survey_responses_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."survey_responses"
    ADD CONSTRAINT "survey_responses_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;


--
-- Name: survey_responses survey_responses_survey_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."survey_responses"
    ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "company_os"."surveys"("id") ON DELETE CASCADE;


--
-- Name: taggables taggables_tag_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."taggables"
    ADD CONSTRAINT "taggables_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "company_os"."tags"("id") ON DELETE CASCADE;


--
-- Name: task_comments task_comments_author_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_comments"
    ADD CONSTRAINT "task_comments_author_person_id_fkey" FOREIGN KEY ("author_person_id") REFERENCES "company_os"."people"("id");


--
-- Name: task_comments task_comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_comments"
    ADD CONSTRAINT "task_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "company_os"."task_comments"("id") ON DELETE CASCADE;


--
-- Name: task_comments task_comments_resolved_by_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_comments"
    ADD CONSTRAINT "task_comments_resolved_by_person_id_fkey" FOREIGN KEY ("resolved_by_person_id") REFERENCES "company_os"."people"("id");


--
-- Name: task_comments task_comments_task_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_comments"
    ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "company_os"."tasks"("id") ON DELETE CASCADE;


--
-- Name: task_stage_log task_stage_log_from_column_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_stage_log"
    ADD CONSTRAINT "task_stage_log_from_column_id_fkey" FOREIGN KEY ("from_column_id") REFERENCES "company_os"."board_columns"("id");


--
-- Name: task_stage_log task_stage_log_from_sprint_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_stage_log"
    ADD CONSTRAINT "task_stage_log_from_sprint_id_fkey" FOREIGN KEY ("from_sprint_id") REFERENCES "company_os"."sprints"("id");


--
-- Name: task_stage_log task_stage_log_moved_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_stage_log"
    ADD CONSTRAINT "task_stage_log_moved_by_fkey" FOREIGN KEY ("moved_by") REFERENCES "company_os"."people"("id");


--
-- Name: task_stage_log task_stage_log_task_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_stage_log"
    ADD CONSTRAINT "task_stage_log_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "company_os"."tasks"("id") ON DELETE CASCADE;


--
-- Name: deal_stage_log deal_stage_log_deal_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deal_stage_log"
    ADD CONSTRAINT "deal_stage_log_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "company_os"."deals"("id") ON DELETE CASCADE;


--
-- Name: deal_stage_log deal_stage_log_from_stage_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deal_stage_log"
    ADD CONSTRAINT "deal_stage_log_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "company_os"."pipeline_stages"("id") ON DELETE SET NULL;


--
-- Name: deal_stage_log deal_stage_log_to_stage_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deal_stage_log"
    ADD CONSTRAINT "deal_stage_log_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "company_os"."pipeline_stages"("id") ON DELETE SET NULL;


--
-- Name: deals deals_campaign_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."deals"
    ADD CONSTRAINT "deals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "company_os"."marketing_campaigns"("id") ON DELETE SET NULL;


--
-- Name: inquiries inquiries_campaign_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."inquiries"
    ADD CONSTRAINT "inquiries_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "company_os"."marketing_campaigns"("id") ON DELETE SET NULL;


--
-- Name: invoices invoices_deal_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."invoices"
    ADD CONSTRAINT "invoices_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "company_os"."deals"("id") ON DELETE SET NULL;


--
-- Name: task_stage_log task_stage_log_to_column_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_stage_log"
    ADD CONSTRAINT "task_stage_log_to_column_id_fkey" FOREIGN KEY ("to_column_id") REFERENCES "company_os"."board_columns"("id");


--
-- Name: task_stage_log task_stage_log_to_sprint_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."task_stage_log"
    ADD CONSTRAINT "task_stage_log_to_sprint_id_fkey" FOREIGN KEY ("to_sprint_id") REFERENCES "company_os"."sprints"("id");


--
-- Name: tasks tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."tasks"
    ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "company_os"."people"("id");


--
-- Name: tasks tasks_board_column_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."tasks"
    ADD CONSTRAINT "tasks_board_column_id_fkey" FOREIGN KEY ("board_column_id") REFERENCES "company_os"."board_columns"("id");


--
-- Name: tasks tasks_board_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."tasks"
    ADD CONSTRAINT "tasks_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "company_os"."boards"("id") ON DELETE CASCADE;


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "company_os"."people"("id");


--
-- Name: tasks tasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."tasks"
    ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "company_os"."tasks"("id") ON DELETE CASCADE;


--
-- Name: tasks tasks_sprint_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."tasks"
    ADD CONSTRAINT "tasks_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "company_os"."sprints"("id");


--
-- Name: tasks tasks_epic_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."tasks"
    ADD CONSTRAINT "tasks_epic_id_fkey" FOREIGN KEY ("epic_id") REFERENCES "company_os"."epics"("id") ON DELETE SET NULL;


--
-- Name: epics epics_board_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."epics"
    ADD CONSTRAINT "epics_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "company_os"."boards"("id") ON DELETE CASCADE;


--
-- Name: team_members team_members_department_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."team_members"
    ADD CONSTRAINT "team_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "company_os"."departments"("id");


--
-- Name: team_members team_members_leave_policy_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."team_members"
    ADD CONSTRAINT "team_members_leave_policy_id_fkey" FOREIGN KEY ("leave_policy_id") REFERENCES "company_os"."leave_policies"("id");


--
-- Name: team_members team_members_manager_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."team_members"
    ADD CONSTRAINT "team_members_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "company_os"."team_members"("id");


--
-- Name: team_members team_members_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."team_members"
    ADD CONSTRAINT "team_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;


--
-- Name: team_members team_members_position_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."team_members"
    ADD CONSTRAINT "team_members_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "company_os"."positions"("id");


--
-- Name: time_off time_off_team_member_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."time_off"
    ADD CONSTRAINT "time_off_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "company_os"."team_members"("id") ON DELETE CASCADE;


--
-- Name: token_purchases token_purchases_company_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."token_purchases"
    ADD CONSTRAINT "token_purchases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id");


--
-- Name: token_purchases token_purchases_order_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."token_purchases"
    ADD CONSTRAINT "token_purchases_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "company_os"."orders"("id");


--
-- Name: token_purchases token_purchases_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."token_purchases"
    ADD CONSTRAINT "token_purchases_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: client_identities client_identities_repo_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."client_identities"
    ADD CONSTRAINT "client_identities_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "htt"."repos"("id") ON DELETE CASCADE;


--
-- Name: delivered_additions delivered_additions_company_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."delivered_additions"
    ADD CONSTRAINT "delivered_additions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE RESTRICT;


--
-- Name: man_hour_entries man_hour_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."man_hour_entries"
    ADD CONSTRAINT "man_hour_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE RESTRICT;


--
-- Name: man_hour_entries man_hour_entries_person_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."man_hour_entries"
    ADD CONSTRAINT "man_hour_entries_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;


--
-- Name: man_hour_entries man_hour_entries_repo_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."man_hour_entries"
    ADD CONSTRAINT "man_hour_entries_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "htt"."repos"("id") ON DELETE SET NULL;


--
-- Name: project_goals project_goals_repo_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."project_goals"
    ADD CONSTRAINT "project_goals_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "htt"."repos"("id") ON DELETE CASCADE;


--
-- Name: project_summaries project_summaries_repo_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."project_summaries"
    ADD CONSTRAINT "project_summaries_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "htt"."repos"("id") ON DELETE CASCADE;


--
-- Name: pull_requests pull_requests_author_person_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."pull_requests"
    ADD CONSTRAINT "pull_requests_author_person_id_fkey" FOREIGN KEY ("author_person_id") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;


--
-- Name: pull_requests pull_requests_repo_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."pull_requests"
    ADD CONSTRAINT "pull_requests_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "htt"."repos"("id") ON DELETE CASCADE;


--
-- Name: repos repos_ai_program_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."repos"
    ADD CONSTRAINT "repos_ai_program_id_fkey" FOREIGN KEY ("ai_program_id") REFERENCES "company_os"."ai_programs"("id") ON DELETE RESTRICT;


--
-- Name: repos repos_company_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."repos"
    ADD CONSTRAINT "repos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE RESTRICT;


--
-- Name: token_allocations token_allocations_company_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."token_allocations"
    ADD CONSTRAINT "token_allocations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE RESTRICT;


--
-- Name: token_entries token_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."token_entries"
    ADD CONSTRAINT "token_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE RESTRICT;


--
-- Name: token_entries token_entries_person_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."token_entries"
    ADD CONSTRAINT "token_entries_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;


--
-- Name: token_entries token_entries_pull_request_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."token_entries"
    ADD CONSTRAINT "token_entries_pull_request_id_fkey" FOREIGN KEY ("pull_request_id") REFERENCES "htt"."pull_requests"("id") ON DELETE SET NULL;


--
-- Name: token_entries token_entries_repo_id_fkey; Type: FK CONSTRAINT; Schema: htt; Owner: -
--

ALTER TABLE ONLY "htt"."token_entries"
    ADD CONSTRAINT "token_entries_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "htt"."repos"("id") ON DELETE SET NULL;


--
-- Name: access_codes; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."access_codes" ENABLE ROW LEVEL SECURITY;

--
-- Name: affiliate_commissions; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."affiliate_commissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: affiliate_payouts; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."affiliate_payouts" ENABLE ROW LEVEL SECURITY;

--
-- Name: affiliates; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."affiliates" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_programs; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."ai_programs" ENABLE ROW LEVEL SECURITY;

--
-- Name: application_stage_log; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."application_stage_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: application_stages; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."application_stages" ENABLE ROW LEVEL SECURITY;

--
-- Name: applications; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."applications" ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_conversations; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."assistant_conversations" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: board_columns; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."board_columns" ENABLE ROW LEVEL SECURITY;

--
-- Name: board_members; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."board_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: boards; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."boards" ENABLE ROW LEVEL SECURITY;

--
-- Name: book_chapters; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."book_chapters" ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."bookings" ENABLE ROW LEVEL SECURITY;

--
-- Name: books; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."books" ENABLE ROW LEVEL SECURITY;

--
-- Name: brand_profiles; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."brand_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: brands; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."brands" ENABLE ROW LEVEL SECURITY;

--
-- Name: call_scorecards; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."call_scorecards" ENABLE ROW LEVEL SECURITY;

--
-- Name: call_transcripts; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."call_transcripts" ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_profile; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."candidate_profile" ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_sensitive; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."candidate_sensitive" ENABLE ROW LEVEL SECURITY;

--
-- Name: candidates; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."candidates" ENABLE ROW LEVEL SECURITY;

--
-- Name: affiliate_commissions chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."affiliate_commissions" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: affiliate_payouts chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."affiliate_payouts" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: affiliates chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."affiliates" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: application_stage_log chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."application_stage_log" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: application_stages chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."application_stages" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: applications chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."applications" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: audit_log chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."audit_log" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: bookings chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."bookings" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: brands chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."brands" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: candidate_profile chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."candidate_profile" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: candidates chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."candidates" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: companies chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."companies" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: company_profile chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."company_profile" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: deals chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."deals" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: departments chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."departments" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: documents chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."documents" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: event_registrations chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."event_registrations" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: events chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."events" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: expenses chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."expenses" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: fx_rates chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."fx_rates" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: holidays chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."holidays" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: ideas chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."ideas" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: inquiries chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."inquiries" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: integration_sources chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."integration_sources" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: interactions chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."interactions" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: interview_interviewers chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."interview_interviewers" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: interview_scorecards chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."interview_scorecards" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: interviews chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."interviews" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: invoices chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."invoices" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: job_requisitions chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."job_requisitions" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: lead chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."lead" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: leave_adjustments chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."leave_adjustments" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: leave_policies chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."leave_policies" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: legal_entities chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."legal_entities" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: lifecycle_transitions chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."lifecycle_transitions" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: meeting_action_items chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."meeting_action_items" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: meeting_associations chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."meeting_associations" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: meeting_participants chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."meeting_participants" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: meetings chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."meetings" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: offers chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."offers" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: onboarding_tasks chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."onboarding_tasks" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: orders chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."orders" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: people chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."people" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: performance_reviews chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."performance_reviews" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: person_companies chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."person_companies" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: person_qualifications chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."person_qualifications" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: pipeline_stages chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."pipeline_stages" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: pipelines chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."pipelines" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: portal_assume_sessions chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."portal_assume_sessions" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: portal_members chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."portal_members" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: positions chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."positions" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: products chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."products" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: scorecard_scores chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."scorecard_scores" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: service_lines chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."service_lines" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: staff_assignments chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."staff_assignments" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: subscriptions chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."subscriptions" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: survey_answers chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."survey_answers" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: survey_fields chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."survey_fields" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: survey_responses chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."survey_responses" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: surveys chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."surveys" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: taggables chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."taggables" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: tags chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."tags" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: team_members chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."team_members" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: time_off chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."time_off" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: vendors chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_reader_select" ON "company_os"."vendors" FOR SELECT TO "chatbot_reader" USING (true);


--
-- Name: affiliate_commissions chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."affiliate_commissions" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: affiliate_payouts chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."affiliate_payouts" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: affiliates chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."affiliates" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: application_stage_log chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."application_stage_log" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: application_stages chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."application_stages" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: applications chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."applications" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: audit_log chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."audit_log" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: bookings chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."bookings" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: brands chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."brands" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: candidate_profile chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."candidate_profile" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: candidates chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."candidates" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: companies chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."companies" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: company_profile chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."company_profile" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: contractor_payments chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."contractor_payments" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: contractor_work_events chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."contractor_work_events" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: contractor_work_requests chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."contractor_work_requests" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: deals chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."deals" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: departments chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."departments" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: documents chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."documents" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: event_registrations chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."event_registrations" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: event_talks chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."event_talks" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: events chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."events" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: expenses chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."expenses" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: fx_rates chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."fx_rates" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: gallery_photos chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."gallery_photos" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: holidays chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."holidays" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: ideas chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."ideas" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: inquiries chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."inquiries" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: integration_sources chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."integration_sources" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: interactions chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."interactions" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: interview_interviewers chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."interview_interviewers" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: interview_scorecards chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."interview_scorecards" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: interviews chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."interviews" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: invoices chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."invoices" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: job_requisitions chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."job_requisitions" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: lead chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."lead" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: leave_adjustments chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."leave_adjustments" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: leave_policies chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."leave_policies" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: legal_entities chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."legal_entities" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: lifecycle_transitions chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."lifecycle_transitions" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: meeting_action_items chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."meeting_action_items" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: meeting_associations chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."meeting_associations" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: meeting_participants chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."meeting_participants" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: meetings chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."meetings" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: offers chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."offers" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: onboarding_tasks chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."onboarding_tasks" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: orders chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."orders" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: people chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."people" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: performance_reviews chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."performance_reviews" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: person_companies chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."person_companies" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: person_qualifications chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."person_qualifications" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: pipeline_stages chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."pipeline_stages" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: pipelines chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."pipelines" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: portal_assume_sessions chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."portal_assume_sessions" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: portal_members chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."portal_members" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: positions chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."positions" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: products chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."products" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: scorecard_scores chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."scorecard_scores" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: service_lines chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."service_lines" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: staff_assignments chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."staff_assignments" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: subscriptions chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."subscriptions" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: survey_answers chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."survey_answers" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: survey_fields chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."survey_fields" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: survey_responses chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."survey_responses" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: surveys chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."surveys" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: taggables chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."taggables" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: tags chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."tags" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: talks chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."talks" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: team_members chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."team_members" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: time_off chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."time_off" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: vendors chatbot_writer_insert; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_insert" ON "company_os"."vendors" FOR INSERT TO "chatbot_writer" WITH CHECK (true);


--
-- Name: affiliate_commissions chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."affiliate_commissions" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: affiliate_payouts chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."affiliate_payouts" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: affiliates chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."affiliates" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: application_stage_log chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."application_stage_log" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: application_stages chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."application_stages" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: applications chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."applications" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: audit_log chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."audit_log" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: bookings chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."bookings" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: brands chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."brands" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: candidate_profile chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."candidate_profile" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: candidates chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."candidates" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: companies chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."companies" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: company_profile chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."company_profile" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: contractor_payments chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."contractor_payments" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: contractor_work_events chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."contractor_work_events" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: contractor_work_requests chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."contractor_work_requests" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: deals chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."deals" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: departments chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."departments" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: documents chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."documents" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: event_registrations chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."event_registrations" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: event_talks chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."event_talks" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: events chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."events" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: expenses chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."expenses" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: fx_rates chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."fx_rates" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: gallery_photos chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."gallery_photos" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: holidays chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."holidays" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: ideas chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."ideas" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: inquiries chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."inquiries" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: integration_sources chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."integration_sources" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: interactions chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."interactions" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: interview_interviewers chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."interview_interviewers" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: interview_scorecards chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."interview_scorecards" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: interviews chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."interviews" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: invoices chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."invoices" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: job_requisitions chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."job_requisitions" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: lead chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."lead" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: leave_adjustments chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."leave_adjustments" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: leave_policies chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."leave_policies" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: legal_entities chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."legal_entities" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: lifecycle_transitions chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."lifecycle_transitions" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: meeting_action_items chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."meeting_action_items" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: meeting_associations chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."meeting_associations" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: meeting_participants chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."meeting_participants" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: meetings chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."meetings" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: offers chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."offers" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: onboarding_tasks chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."onboarding_tasks" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: orders chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."orders" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: people chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."people" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: performance_reviews chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."performance_reviews" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: person_companies chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."person_companies" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: person_qualifications chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."person_qualifications" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: pipeline_stages chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."pipeline_stages" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: pipelines chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."pipelines" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: portal_assume_sessions chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."portal_assume_sessions" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: portal_members chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."portal_members" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: positions chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."positions" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: products chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."products" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: scorecard_scores chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."scorecard_scores" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: service_lines chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."service_lines" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: staff_assignments chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."staff_assignments" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: subscriptions chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."subscriptions" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: survey_answers chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."survey_answers" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: survey_fields chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."survey_fields" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: survey_responses chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."survey_responses" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: surveys chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."surveys" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: taggables chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."taggables" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: tags chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."tags" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: talks chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."talks" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: team_members chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."team_members" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: time_off chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."time_off" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: vendors chatbot_writer_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_select" ON "company_os"."vendors" FOR SELECT TO "chatbot_writer" USING (true);


--
-- Name: affiliate_commissions chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."affiliate_commissions" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: affiliate_payouts chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."affiliate_payouts" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: affiliates chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."affiliates" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: application_stage_log chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."application_stage_log" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: application_stages chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."application_stages" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: applications chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."applications" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: audit_log chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."audit_log" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: bookings chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."bookings" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: brands chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."brands" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: candidate_profile chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."candidate_profile" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: candidates chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."candidates" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: companies chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."companies" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: company_profile chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."company_profile" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: contractor_payments chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."contractor_payments" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: contractor_work_events chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."contractor_work_events" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: contractor_work_requests chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."contractor_work_requests" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: deals chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."deals" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: departments chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."departments" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: documents chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."documents" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: event_registrations chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."event_registrations" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: event_talks chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."event_talks" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: events chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."events" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: expenses chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."expenses" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: fx_rates chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."fx_rates" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: gallery_photos chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."gallery_photos" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: holidays chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."holidays" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: ideas chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."ideas" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: inquiries chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."inquiries" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: integration_sources chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."integration_sources" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: interactions chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."interactions" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: interview_interviewers chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."interview_interviewers" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: interview_scorecards chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."interview_scorecards" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: interviews chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."interviews" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: invoices chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."invoices" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: job_requisitions chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."job_requisitions" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: lead chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."lead" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: leave_adjustments chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."leave_adjustments" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: leave_policies chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."leave_policies" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: legal_entities chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."legal_entities" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: lifecycle_transitions chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."lifecycle_transitions" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: meeting_action_items chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."meeting_action_items" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: meeting_associations chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."meeting_associations" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: meeting_participants chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."meeting_participants" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: meetings chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."meetings" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: offers chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."offers" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: onboarding_tasks chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."onboarding_tasks" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: orders chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."orders" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: people chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."people" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: performance_reviews chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."performance_reviews" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: person_companies chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."person_companies" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: person_qualifications chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."person_qualifications" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: pipeline_stages chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."pipeline_stages" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: pipelines chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."pipelines" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: portal_assume_sessions chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."portal_assume_sessions" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: portal_members chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."portal_members" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: positions chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."positions" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: products chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."products" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: scorecard_scores chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."scorecard_scores" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: service_lines chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."service_lines" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: staff_assignments chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."staff_assignments" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: subscriptions chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."subscriptions" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: survey_answers chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."survey_answers" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: survey_fields chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."survey_fields" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: survey_responses chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."survey_responses" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: surveys chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."surveys" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: taggables chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."taggables" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: tags chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."tags" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: talks chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."talks" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: team_members chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."team_members" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: time_off chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."time_off" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: vendors chatbot_writer_update; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "chatbot_writer_update" ON "company_os"."vendors" FOR UPDATE TO "chatbot_writer" USING (true) WITH CHECK (true);


--
-- Name: capacity_commitments; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."capacity_commitments" ENABLE ROW LEVEL SECURITY;


--
-- Name: capacity_roles; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."capacity_roles" ENABLE ROW LEVEL SECURITY;


--
-- Name: client_backlog_items; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."client_backlog_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_roadmap_groups; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."client_roadmap_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_roadmap_overview; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."client_roadmap_overview" ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_checkins; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."coaching_checkins" ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_commitment_history; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."coaching_commitment_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_commitments; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."coaching_commitments" ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_context; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."coaching_context" ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_goal_comments; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."coaching_goal_comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_ocean_profiles; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."coaching_ocean_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_one_on_ones; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."coaching_one_on_ones" ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_priorities; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."coaching_priorities" ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_profiles; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."coaching_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_talking_points; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."coaching_talking_points" ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_trends; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."coaching_trends" ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."companies" ENABLE ROW LEVEL SECURITY;

--
-- Name: company_github_orgs; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."company_github_orgs" ENABLE ROW LEVEL SECURITY;

--
-- Name: company_information; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."company_information" ENABLE ROW LEVEL SECURITY;

--
-- Name: company_profile; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."company_profile" ENABLE ROW LEVEL SECURITY;

--
-- Name: compensation_sensitive; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."compensation_sensitive" ENABLE ROW LEVEL SECURITY;

--
-- Name: contractor_payments; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."contractor_payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: contractor_work_events; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."contractor_work_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: contractor_work_requests; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."contractor_work_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: deals; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."deals" ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."departments" ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaign_recipients; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."email_campaign_recipients" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaigns; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."email_campaigns" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_events; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."email_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."equipment" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_assignments; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."equipment_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_requests; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."equipment_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: event_agenda_blocks; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."event_agenda_blocks" ENABLE ROW LEVEL SECURITY;

--
-- Name: event_agenda_staff; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."event_agenda_staff" ENABLE ROW LEVEL SECURITY;

--
-- Name: event_pnl_lines; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."event_pnl_lines" ENABLE ROW LEVEL SECURITY;

--
-- Name: event_registrations; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."event_registrations" ENABLE ROW LEVEL SECURITY;

--
-- Name: event_talks; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."event_talks" ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."events" ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."expenses" ENABLE ROW LEVEL SECURITY;

--
-- Name: fx_rates; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."fx_rates" ENABLE ROW LEVEL SECURITY;

--
-- Name: gallery_photo_people; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."gallery_photo_people" ENABLE ROW LEVEL SECURITY;

--
-- Name: gallery_photos; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."gallery_photos" ENABLE ROW LEVEL SECURITY;

--
-- Name: goals; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."goals" ENABLE ROW LEVEL SECURITY;

--
-- Name: holidays; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."holidays" ENABLE ROW LEVEL SECURITY;

--
-- Name: idea_trend_reports; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."idea_trend_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_recaps; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."marketing_recaps" ENABLE ROW LEVEL SECURITY;

--
-- Name: ideas; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."ideas" ENABLE ROW LEVEL SECURITY;

--
-- Name: inquiries; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."inquiries" ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_sources; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."integration_sources" ENABLE ROW LEVEL SECURITY;

--
-- Name: interactions; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."interactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: interview_interviewers; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."interview_interviewers" ENABLE ROW LEVEL SECURITY;

--
-- Name: interview_scorecards; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."interview_scorecards" ENABLE ROW LEVEL SECURITY;

--
-- Name: interviews; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."interviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."invoices" ENABLE ROW LEVEL SECURITY;

--
-- Name: issues; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."issues" ENABLE ROW LEVEL SECURITY;

--
-- Name: job_requisitions; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."job_requisitions" ENABLE ROW LEVEL SECURITY;

--
-- Name: key_results; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."key_results" ENABLE ROW LEVEL SECURITY;

--
-- Name: kr_logs; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."kr_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."lead" ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_adjustments; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."leave_adjustments" ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_policies; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."leave_policies" ENABLE ROW LEVEL SECURITY;

--
-- Name: legal_entities; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."legal_entities" ENABLE ROW LEVEL SECURITY;

--
-- Name: lifecycle_transitions; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."lifecycle_transitions" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_asset_images; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."marketing_asset_images" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_campaigns; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."marketing_campaigns" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_content; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."marketing_content" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_pillars; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."marketing_pillars" ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_action_items; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."meeting_action_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_associations; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."meeting_associations" ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_participants; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."meeting_participants" ENABLE ROW LEVEL SECURITY;

--
-- Name: meetings; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."meetings" ENABLE ROW LEVEL SECURITY;

--
-- Name: objectives; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."objectives" ENABLE ROW LEVEL SECURITY;

--
-- Name: offers; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."offers" ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_plans; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."onboarding_plans" ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_tasks; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."onboarding_tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: people; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."people" ENABLE ROW LEVEL SECURITY;

--
-- Name: people_sensitive; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."people_sensitive" ENABLE ROW LEVEL SECURITY;

--
-- Name: performance_reviews; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."performance_reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: person_companies; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."person_companies" ENABLE ROW LEVEL SECURITY;

--
-- Name: person_git_emails; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."person_git_emails" ENABLE ROW LEVEL SECURITY;

--
-- Name: person_qualifications; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."person_qualifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_stages; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."pipeline_stages" ENABLE ROW LEVEL SECURITY;

--
-- Name: pipelines; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."pipelines" ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_assume_sessions; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."portal_assume_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_members; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."portal_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: positions; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."positions" ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."products" ENABLE ROW LEVEL SECURITY;

--
-- Name: program_documents; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."program_documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: program_plans; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."program_plans" ENABLE ROW LEVEL SECURITY;

--
-- Name: lark_user_connections; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."lark_user_connections" ENABLE ROW LEVEL SECURITY;

--
-- Name: qbo_connection; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."qbo_connection" ENABLE ROW LEVEL SECURITY;

--
-- Name: requisition_loop_steps; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."requisition_loop_steps" ENABLE ROW LEVEL SECURITY;

--
-- Name: requisition_loop_interviewers; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."requisition_loop_interviewers" ENABLE ROW LEVEL SECURITY;


--
-- Name: scorecard_scores; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."scorecard_scores" ENABLE ROW LEVEL SECURITY;

--
-- Name: service_lines; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."service_lines" ENABLE ROW LEVEL SECURITY;

--
-- Name: sprints; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."sprints" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."epics" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_assignments; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."staff_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: strategies; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."strategies" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_answers; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."survey_answers" ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_fields; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."survey_fields" ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_responses; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."survey_responses" ENABLE ROW LEVEL SECURITY;

--
-- Name: surveys; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."surveys" ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_packets; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."sync_packets" ENABLE ROW LEVEL SECURITY;

--
-- Name: taggables; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."taggables" ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."tags" ENABLE ROW LEVEL SECURITY;

--
-- Name: talks; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."talks" ENABLE ROW LEVEL SECURITY;

--
-- Name: task_comments; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."task_comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: task_stage_log; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."task_stage_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: affiliate_commissions team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."affiliate_commissions" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: affiliate_payouts team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."affiliate_payouts" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: affiliates team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."affiliates" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: companies team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."companies" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: company_information team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."company_information" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: company_profile team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."company_profile" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: deals team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."deals" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: departments team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."departments" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: event_registrations team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."event_registrations" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: events team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."events" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: expenses team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."expenses" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: fx_rates team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."fx_rates" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: gallery_photo_people team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."gallery_photo_people" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: gallery_photos team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."gallery_photos" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: holidays team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."holidays" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: ideas team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."ideas" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: inquiries team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."inquiries" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: integration_sources team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."integration_sources" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: interactions team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."interactions" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: invoices team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."invoices" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: lead team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."lead" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: leave_adjustments team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."leave_adjustments" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: leave_policies team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."leave_policies" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: lifecycle_transitions team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."lifecycle_transitions" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: orders team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."orders" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: people team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."people" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: person_companies team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."person_companies" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: pipeline_stages team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."pipeline_stages" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: pipelines team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."pipelines" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: positions team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."positions" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: products team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."products" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: service_lines team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."service_lines" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: staff_assignments team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."staff_assignments" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: subscriptions team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."subscriptions" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: taggables team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."taggables" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: tags team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."tags" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: team_members team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."team_members" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: time_off team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."time_off" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: vendors team_chatbot_reader_select; Type: POLICY; Schema: company_os; Owner: -
--

CREATE POLICY "team_chatbot_reader_select" ON "company_os"."vendors" FOR SELECT TO "team_chatbot_reader" USING (true);


--
-- Name: team_members; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."team_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: time_off; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."time_off" ENABLE ROW LEVEL SECURITY;

--
-- Name: token_purchases; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."token_purchases" ENABLE ROW LEVEL SECURITY;

--
-- Name: vendors; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."vendors" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_identities; Type: ROW SECURITY; Schema: htt; Owner: -
--

ALTER TABLE "htt"."client_identities" ENABLE ROW LEVEL SECURITY;

--
-- Name: man_hour_entries; Type: ROW SECURITY; Schema: htt; Owner: -
--

ALTER TABLE "htt"."delivered_additions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "htt"."man_hour_entries" ENABLE ROW LEVEL SECURITY;

--
-- Name: project_goals; Type: ROW SECURITY; Schema: htt; Owner: -
--

ALTER TABLE "htt"."project_goals" ENABLE ROW LEVEL SECURITY;

--
-- Name: project_summaries; Type: ROW SECURITY; Schema: htt; Owner: -
--

ALTER TABLE "htt"."project_summaries" ENABLE ROW LEVEL SECURITY;

--
-- Name: pull_requests; Type: ROW SECURITY; Schema: htt; Owner: -
--

ALTER TABLE "htt"."pull_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: repos; Type: ROW SECURITY; Schema: htt; Owner: -
--

ALTER TABLE "htt"."repos" ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_runs; Type: ROW SECURITY; Schema: htt; Owner: -
--

ALTER TABLE "htt"."sync_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: token_allocations; Type: ROW SECURITY; Schema: htt; Owner: -
--

ALTER TABLE "htt"."token_allocations" ENABLE ROW LEVEL SECURITY;

--
-- Name: token_entries; Type: ROW SECURITY; Schema: htt; Owner: -
--

ALTER TABLE "htt"."token_entries" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "company_os"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "company_os" TO "service_role";
GRANT USAGE ON SCHEMA "company_os" TO "chatbot_reader";
GRANT USAGE ON SCHEMA "company_os" TO "chatbot_writer";
GRANT USAGE ON SCHEMA "company_os" TO "team_chatbot_reader";


--
-- Name: SCHEMA "htt"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "htt" TO "service_role";
GRANT USAGE ON SCHEMA "htt" TO "supabase_read_only_user";


--
-- Name: FUNCTION "assign_equipment"("p_equipment_id" "uuid", "p_person_id" "uuid", "p_assigned_at" "date", "p_condition_out" "text", "p_note" "text", "p_actor" "text"); Type: ACL; Schema: company_os; Owner: -
--

GRANT ALL ON FUNCTION "company_os"."assign_equipment"("p_equipment_id" "uuid", "p_person_id" "uuid", "p_assigned_at" "date", "p_condition_out" "text", "p_note" "text", "p_actor" "text") TO "service_role";


--
-- Name: FUNCTION "campaign_recipient_stats"("p_campaign_id" "uuid"); Type: ACL; Schema: company_os; Owner: -
--

REVOKE ALL ON FUNCTION "company_os"."campaign_recipient_stats"("p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "company_os"."campaign_recipient_stats"("p_campaign_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "claim_campaign_batch"("p_campaign_id" "uuid", "p_limit" integer, "p_reclaim_after" interval); Type: ACL; Schema: company_os; Owner: -
--

REVOKE ALL ON FUNCTION "company_os"."claim_campaign_batch"("p_campaign_id" "uuid", "p_limit" integer, "p_reclaim_after" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "company_os"."claim_campaign_batch"("p_campaign_id" "uuid", "p_limit" integer, "p_reclaim_after" interval) TO "service_role";


--
-- Name: FUNCTION "claim_tick"("p_routine" "text", "p_tick" "text", "p_mode" "text", "p_host" "text", "p_step_s" integer); Type: ACL; Schema: company_os; Owner: -
--

REVOKE ALL ON FUNCTION "company_os"."claim_tick"("p_routine" "text", "p_tick" "text", "p_mode" "text", "p_host" "text", "p_step_s" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "company_os"."claim_tick"("p_routine" "text", "p_tick" "text", "p_mode" "text", "p_host" "text", "p_step_s" integer) TO "service_role";


--
-- Name: FUNCTION "email_delivery_stats"("p_since" timestamp with time zone, "p_campaign_id" "uuid"); Type: ACL; Schema: company_os; Owner: -
--

REVOKE ALL ON FUNCTION "company_os"."email_delivery_stats"("p_since" timestamp with time zone, "p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "company_os"."email_delivery_stats"("p_since" timestamp with time zone, "p_campaign_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "new_ticket_code"("len" integer); Type: ACL; Schema: company_os; Owner: -
--

REVOKE ALL ON FUNCTION "company_os"."new_ticket_code"("len" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "company_os"."new_ticket_code"("len" integer) TO "service_role";


--
-- Name: FUNCTION "offboard_team_member"("p_team_member_id" "uuid", "p_status" "text", "p_end_date" "date", "p_actor" "text"); Type: ACL; Schema: company_os; Owner: -
--

GRANT ALL ON FUNCTION "company_os"."offboard_team_member"("p_team_member_id" "uuid", "p_status" "text", "p_end_date" "date", "p_actor" "text") TO "service_role";


--
-- Name: FUNCTION "register_for_event"("p_event_id" "uuid", "p_person_id" "uuid", "p_product_id" "uuid", "p_attendee_name" "text", "p_attendee_email" "text", "p_guest_count" integer, "p_hold_for_payment" boolean, "p_order_id" "uuid"); Type: ACL; Schema: company_os; Owner: -
--

REVOKE ALL ON FUNCTION "company_os"."register_for_event"("p_event_id" "uuid", "p_person_id" "uuid", "p_product_id" "uuid", "p_attendee_name" "text", "p_attendee_email" "text", "p_guest_count" integer, "p_hold_for_payment" boolean, "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "company_os"."register_for_event"("p_event_id" "uuid", "p_person_id" "uuid", "p_product_id" "uuid", "p_attendee_name" "text", "p_attendee_email" "text", "p_guest_count" integer, "p_hold_for_payment" boolean, "p_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "return_equipment"("p_equipment_id" "uuid", "p_returned_at" "date", "p_condition_in" "text", "p_note" "text"); Type: ACL; Schema: company_os; Owner: -
--

GRANT ALL ON FUNCTION "company_os"."return_equipment"("p_equipment_id" "uuid", "p_returned_at" "date", "p_condition_in" "text", "p_note" "text") TO "service_role";


--
-- Name: FUNCTION "set_amount_usd_cents"(); Type: ACL; Schema: company_os; Owner: -
--

GRANT ALL ON FUNCTION "company_os"."set_amount_usd_cents"() TO "service_role";


--
-- Name: FUNCTION "append_task_position"("p_board_id" "uuid", "p_column_id" "uuid"); Type: ACL; Schema: company_os; Owner: -
--

GRANT ALL ON FUNCTION "company_os"."append_task_position"("p_board_id" "uuid", "p_column_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "set_deal_positions_in_stage"("p_stage_id" "uuid", "p_ids" "uuid"[]); Type: ACL; Schema: company_os; Owner: -
--

GRANT ALL ON FUNCTION "company_os"."set_deal_positions_in_stage"("p_stage_id" "uuid", "p_ids" "uuid"[]) TO "service_role";

--
-- Name: FUNCTION "merge_company_metadata"("p_company_id" "uuid", "p_patch" "jsonb"); Type: ACL; Schema: company_os; Owner: -
--

REVOKE ALL ON FUNCTION "company_os"."merge_company_metadata"("p_company_id" "uuid", "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "company_os"."merge_company_metadata"("p_company_id" "uuid", "p_patch" "jsonb") TO "service_role";


--
-- Name: FUNCTION "assign_company_metadata_id"("p_key" "text", "p_value" "text", "p_company_id" "uuid"); Type: ACL; Schema: company_os; Owner: -
--

REVOKE ALL ON FUNCTION "company_os"."assign_company_metadata_id"("p_key" "text", "p_value" "text", "p_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "company_os"."assign_company_metadata_id"("p_key" "text", "p_value" "text", "p_company_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "set_deal_positions"("p_ids" "uuid"[], "p_start" integer); Type: ACL; Schema: company_os; Owner: -
--

GRANT ALL ON FUNCTION "company_os"."set_deal_positions"("p_ids" "uuid"[], "p_start" integer) TO "service_role";


--
-- Name: FUNCTION "workshop_attendees_total"("p_year" integer); Type: ACL; Schema: company_os; Owner: -
--

GRANT ALL ON FUNCTION "company_os"."workshop_attendees_total"("p_year" integer) TO "service_role";


--
-- Name: FUNCTION "resolve_contributor"("p_email" "text"); Type: ACL; Schema: htt; Owner: -
--

REVOKE ALL ON FUNCTION "htt"."resolve_contributor"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "htt"."resolve_contributor"("p_email" "text") TO "service_role";


--
-- Name: FUNCTION "resolve_team_member"("p_email" "text"); Type: ACL; Schema: htt; Owner: -
--

REVOKE ALL ON FUNCTION "htt"."resolve_team_member"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "htt"."resolve_team_member"("p_email" "text") TO "service_role";


--
-- Name: FUNCTION "resolve_team_member_by_login"("p_github_login" "text"); Type: ACL; Schema: htt; Owner: -
--

REVOKE ALL ON FUNCTION "htt"."resolve_team_member_by_login"("p_github_login" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "htt"."resolve_team_member_by_login"("p_github_login" "text") TO "service_role";


--
-- Name: FUNCTION "set_updated_at"(); Type: ACL; Schema: htt; Owner: -
--

GRANT ALL ON FUNCTION "htt"."set_updated_at"() TO "service_role";


--
-- Name: TABLE "access_codes"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."access_codes" TO "service_role";


--
-- Name: TABLE "admins"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."admins" TO "service_role";
GRANT SELECT ON TABLE "company_os"."admins" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."admins" TO "chatbot_writer";


--
-- Name: TABLE "affiliate_commissions"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."affiliate_commissions" TO "service_role";
GRANT SELECT ON TABLE "company_os"."affiliate_commissions" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."affiliate_commissions" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."affiliate_commissions" TO "team_chatbot_reader";


--
-- Name: TABLE "affiliate_payouts"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."affiliate_payouts" TO "service_role";
GRANT SELECT ON TABLE "company_os"."affiliate_payouts" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."affiliate_payouts" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."affiliate_payouts" TO "team_chatbot_reader";


--
-- Name: TABLE "affiliates"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."affiliates" TO "service_role";
GRANT SELECT ON TABLE "company_os"."affiliates" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."affiliates" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."affiliates" TO "team_chatbot_reader";


--
-- Name: TABLE "ai_programs"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."ai_programs" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."ai_programs" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."ai_programs" TO "service_role";


--
-- Name: TABLE "application_stage_log"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT ON TABLE "company_os"."application_stage_log" TO "service_role";
GRANT SELECT ON TABLE "company_os"."application_stage_log" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."application_stage_log" TO "chatbot_writer";


--
-- Name: TABLE "application_stages"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."application_stages" TO "service_role";
GRANT SELECT ON TABLE "company_os"."application_stages" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."application_stages" TO "chatbot_writer";


--
-- Name: TABLE "applications"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."applications" TO "service_role";
GRANT SELECT ON TABLE "company_os"."applications" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."applications" TO "chatbot_writer";


--
-- Name: TABLE "assistant_conversations"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."assistant_conversations" TO "service_role";


--
-- Name: TABLE "audit_log"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT ON TABLE "company_os"."audit_log" TO "service_role";
GRANT SELECT ON TABLE "company_os"."audit_log" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."audit_log" TO "chatbot_writer";


--
-- Name: TABLE "board_columns"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."board_columns" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."board_columns" TO "chatbot_writer";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."board_columns" TO "service_role";
GRANT SELECT ON TABLE "company_os"."board_columns" TO "supabase_read_only_user";


--
-- Name: TABLE "board_members"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."board_members" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."board_members" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."board_members" TO "service_role";
GRANT SELECT ON TABLE "company_os"."board_members" TO "supabase_read_only_user";


--
-- Name: TABLE "boards"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."boards" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."boards" TO "chatbot_writer";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."boards" TO "service_role";
GRANT SELECT ON TABLE "company_os"."boards" TO "supabase_read_only_user";


--
-- Name: TABLE "book_chapters"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."book_chapters" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."book_chapters" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."book_chapters" TO "service_role";
GRANT SELECT ON TABLE "company_os"."book_chapters" TO "supabase_read_only_user";


--
-- Name: TABLE "bookings"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."bookings" TO "service_role";
GRANT SELECT ON TABLE "company_os"."bookings" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."bookings" TO "chatbot_writer";


--
-- Name: TABLE "books"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."books" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."books" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."books" TO "service_role";
GRANT SELECT ON TABLE "company_os"."books" TO "supabase_read_only_user";


--
-- Name: TABLE "brand_profiles"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."brand_profiles" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."brand_profiles" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."brand_profiles" TO "service_role";
GRANT SELECT ON TABLE "company_os"."brand_profiles" TO "supabase_read_only_user";


--
-- Name: TABLE "brands"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."brands" TO "service_role";
GRANT SELECT ON TABLE "company_os"."brands" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."brands" TO "chatbot_writer";


--
-- Name: TABLE "call_scorecards"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."call_scorecards" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."call_scorecards" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."call_scorecards" TO "service_role";
GRANT SELECT ON TABLE "company_os"."call_scorecards" TO "team_chatbot_reader";


--
-- Name: TABLE "call_transcripts"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."call_transcripts" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."call_transcripts" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."call_transcripts" TO "service_role";
GRANT SELECT ON TABLE "company_os"."call_transcripts" TO "team_chatbot_reader";


--
-- Name: TABLE "candidate_profile"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."candidate_profile" TO "service_role";
GRANT SELECT ON TABLE "company_os"."candidate_profile" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."candidate_profile" TO "chatbot_writer";


--
-- Name: TABLE "candidate_sensitive"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."candidate_sensitive" TO "service_role";


--
-- Name: TABLE "candidates"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."candidates" TO "service_role";
GRANT SELECT ON TABLE "company_os"."candidates" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."candidates" TO "chatbot_writer";


--
-- Name: TABLE "capacity_commitments"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."capacity_commitments" TO "service_role";


--
-- Name: TABLE "capacity_roles"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."capacity_roles" TO "service_role";


--
-- Name: TABLE "client_backlog_items"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."client_backlog_items" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."client_backlog_items" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."client_backlog_items" TO "service_role";


--
-- Name: TABLE "client_roadmap_groups"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."client_roadmap_groups" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."client_roadmap_groups" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."client_roadmap_groups" TO "service_role";


--
-- Name: TABLE "client_roadmap_overview"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."client_roadmap_overview" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."client_roadmap_overview" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."client_roadmap_overview" TO "service_role";


--
-- Name: TABLE "coaching_checkins"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."coaching_checkins" TO "service_role";


--
-- Name: TABLE "coaching_commitment_history"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT ON TABLE "company_os"."coaching_commitment_history" TO "service_role";


--
-- Name: TABLE "coaching_commitments"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."coaching_commitments" TO "service_role";


--
-- Name: TABLE "coaching_context"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."coaching_context" TO "service_role";


--
-- Name: TABLE "coaching_goal_comments"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT ON TABLE "company_os"."coaching_goal_comments" TO "service_role";


--
-- Name: TABLE "coaching_ocean_profiles"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."coaching_ocean_profiles" TO "service_role";


--
-- Name: TABLE "coaching_one_on_ones"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."coaching_one_on_ones" TO "service_role";


--
-- Name: TABLE "coaching_priorities"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."coaching_priorities" TO "service_role";


--
-- Name: TABLE "coaching_profiles"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."coaching_profiles" TO "service_role";


--
-- Name: TABLE "coaching_talking_points"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."coaching_talking_points" TO "service_role";


--
-- Name: TABLE "coaching_trends"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."coaching_trends" TO "service_role";


--
-- Name: TABLE "companies"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."companies" TO "service_role";
GRANT SELECT ON TABLE "company_os"."companies" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."companies" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."companies" TO "team_chatbot_reader";


--
-- Name: TABLE "company_github_orgs"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."company_github_orgs" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."company_github_orgs" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."company_github_orgs" TO "service_role";
GRANT SELECT ON TABLE "company_os"."company_github_orgs" TO "supabase_read_only_user";


--
-- Name: TABLE "company_information"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."company_information" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."company_information" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."company_information" TO "service_role";
GRANT SELECT ON TABLE "company_os"."company_information" TO "team_chatbot_reader";


--
-- Name: TABLE "company_profile"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."company_profile" TO "service_role";
GRANT SELECT ON TABLE "company_os"."company_profile" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."company_profile" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."company_profile" TO "team_chatbot_reader";


--
-- Name: TABLE "compensation_sensitive"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."compensation_sensitive" TO "service_role";


--
-- Name: TABLE "contractor_payments"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."contractor_payments" TO "chatbot_reader";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."contractor_payments" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."contractor_payments" TO "chatbot_writer";


--
-- Name: TABLE "contractor_work_events"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."contractor_work_events" TO "chatbot_reader";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."contractor_work_events" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."contractor_work_events" TO "chatbot_writer";


--
-- Name: TABLE "contractor_work_requests"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."contractor_work_requests" TO "chatbot_reader";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."contractor_work_requests" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."contractor_work_requests" TO "chatbot_writer";


--
-- Name: TABLE "core_values"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."core_values" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."core_values" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."core_values" TO "service_role";
GRANT SELECT ON TABLE "company_os"."core_values" TO "team_chatbot_reader";


--
-- Name: TABLE "departments"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."departments" TO "service_role";
GRANT SELECT ON TABLE "company_os"."departments" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."departments" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."departments" TO "team_chatbot_reader";


--
-- Name: TABLE "leave_policies"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."leave_policies" TO "service_role";
GRANT SELECT ON TABLE "company_os"."leave_policies" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."leave_policies" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."leave_policies" TO "team_chatbot_reader";


--
-- Name: TABLE "people"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."people" TO "service_role";
GRANT SELECT ON TABLE "company_os"."people" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."people" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."people" TO "team_chatbot_reader";


--
-- Name: TABLE "positions"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."positions" TO "service_role";
GRANT SELECT ON TABLE "company_os"."positions" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."positions" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."positions" TO "team_chatbot_reader";


--
-- Name: TABLE "team_members"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."team_members" TO "service_role";
GRANT SELECT ON TABLE "company_os"."team_members" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."team_members" TO "chatbot_writer";


--
-- Name: COLUMN "team_members"."id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("id") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."person_id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("person_id") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."department_id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("department_id") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."position_id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("position_id") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."manager_id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("manager_id") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."employee_number"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("employee_number") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."employment_type"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("employment_type") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."work_location"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("work_location") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."status"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("status") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."start_date"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("start_date") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."end_date"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("end_date") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."created_at"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("created_at") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."updated_at"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("updated_at") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."leave_policy_id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("leave_policy_id") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."employment_stage"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("employment_stage") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: COLUMN "team_members"."probation_ends_on"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("probation_ends_on") ON TABLE "company_os"."team_members" TO "team_chatbot_reader";


--
-- Name: TABLE "team_directory"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."team_directory" TO "service_role";
GRANT SELECT ON TABLE "company_os"."team_directory" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."team_directory" TO "chatbot_writer";


--
-- Name: TABLE "current_team_members"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."current_team_members" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."current_team_members" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."current_team_members" TO "service_role";


--
-- Name: TABLE "deals"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."deals" TO "service_role";
GRANT SELECT ON TABLE "company_os"."deals" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."deals" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."deals" TO "team_chatbot_reader";


--
-- Name: TABLE "documents"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."documents" TO "service_role";
GRANT SELECT ON TABLE "company_os"."documents" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."documents" TO "chatbot_writer";


--
-- Name: TABLE "email_campaign_recipients"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."email_campaign_recipients" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."email_campaign_recipients" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."email_campaign_recipients" TO "service_role";
GRANT SELECT ON TABLE "company_os"."email_campaign_recipients" TO "supabase_read_only_user";


--
-- Name: TABLE "email_campaigns"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."email_campaigns" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."email_campaigns" TO "chatbot_writer";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."email_campaigns" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."email_audiences" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."email_series" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."email_agents" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."email_agent_skills" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."email_messages" TO "service_role";
GRANT SELECT ON TABLE "company_os"."email_campaigns" TO "supabase_read_only_user";


--
-- Name: TABLE "email_events"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."email_events" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."email_events" TO "chatbot_writer";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."email_events" TO "service_role";
GRANT SELECT ON TABLE "company_os"."email_events" TO "supabase_read_only_user";


--
-- Name: SEQUENCE "equipment_asset_tag_seq"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE "company_os"."equipment_asset_tag_seq" TO "chatbot_writer";
GRANT SELECT,USAGE ON SEQUENCE "company_os"."equipment_asset_tag_seq" TO "service_role";


--
-- Name: TABLE "equipment"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."equipment" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."equipment" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."equipment" TO "service_role";


--
-- Name: TABLE "equipment_assignments"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."equipment_assignments" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."equipment_assignments" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."equipment_assignments" TO "service_role";


--
-- Name: TABLE "equipment_requests"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."equipment_requests" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."equipment_requests" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."equipment_requests" TO "service_role";


--
-- Name: TABLE "event_agenda_blocks"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."event_agenda_blocks" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."event_agenda_blocks" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."event_agenda_blocks" TO "service_role";


--
-- Name: TABLE "event_agenda_staff"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."event_agenda_staff" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."event_agenda_staff" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."event_agenda_staff" TO "service_role";


--
-- Name: TABLE "event_pnl_lines"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."event_pnl_lines" TO "service_role";


--
-- Name: TABLE "event_registrations"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."event_registrations" TO "service_role";
GRANT SELECT ON TABLE "company_os"."event_registrations" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."event_registrations" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."event_registrations" TO "team_chatbot_reader";


--
-- Name: TABLE "event_talks"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."event_talks" TO "chatbot_reader";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."event_talks" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."event_talks" TO "chatbot_writer";


--
-- Name: TABLE "events"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."events" TO "service_role";
GRANT SELECT ON TABLE "company_os"."events" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."events" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."events" TO "team_chatbot_reader";


--
-- Name: TABLE "expenses"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."expenses" TO "service_role";
GRANT SELECT ON TABLE "company_os"."expenses" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."expenses" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."expenses" TO "team_chatbot_reader";


--
-- Name: TABLE "fx_rates"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."fx_rates" TO "service_role";
GRANT SELECT ON TABLE "company_os"."fx_rates" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."fx_rates" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."fx_rates" TO "team_chatbot_reader";


--
-- Name: TABLE "gallery_photo_people"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."gallery_photo_people" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."gallery_photo_people" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."gallery_photo_people" TO "service_role";
GRANT SELECT ON TABLE "company_os"."gallery_photo_people" TO "team_chatbot_reader";


--
-- Name: TABLE "gallery_photos"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."gallery_photos" TO "chatbot_reader";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."gallery_photos" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."gallery_photos" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."gallery_photos" TO "team_chatbot_reader";


--
-- Name: TABLE "goals"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."goals" TO "service_role";


--
-- Name: TABLE "holidays"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."holidays" TO "service_role";
GRANT SELECT ON TABLE "company_os"."holidays" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."holidays" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."holidays" TO "team_chatbot_reader";


--
-- Name: TABLE "idea_trend_reports"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."idea_trend_reports" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."idea_trend_reports" TO "chatbot_writer";
GRANT SELECT,INSERT ON TABLE "company_os"."idea_trend_reports" TO "service_role";


--
-- Name: TABLE "marketing_recaps"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."marketing_recaps" TO "service_role";


--
-- Name: TABLE "ideas"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."ideas" TO "service_role";
GRANT SELECT ON TABLE "company_os"."ideas" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."ideas" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."ideas" TO "team_chatbot_reader";


--
-- Name: TABLE "inquiries"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."inquiries" TO "service_role";
GRANT SELECT ON TABLE "company_os"."inquiries" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."inquiries" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."inquiries" TO "team_chatbot_reader";


--
-- Name: TABLE "integration_sources"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."integration_sources" TO "service_role";
GRANT SELECT ON TABLE "company_os"."integration_sources" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."integration_sources" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."integration_sources" TO "team_chatbot_reader";


--
-- Name: TABLE "interactions"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."interactions" TO "service_role";
GRANT INSERT,UPDATE ON TABLE "company_os"."interactions" TO "chatbot_writer";


--
-- Name: COLUMN "interactions"."id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("id") ON TABLE "company_os"."interactions" TO "chatbot_reader";
GRANT SELECT("id") ON TABLE "company_os"."interactions" TO "chatbot_writer";
GRANT SELECT("id") ON TABLE "company_os"."interactions" TO "team_chatbot_reader";


--
-- Name: COLUMN "interactions"."kind"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("kind") ON TABLE "company_os"."interactions" TO "chatbot_reader";
GRANT SELECT("kind") ON TABLE "company_os"."interactions" TO "chatbot_writer";
GRANT SELECT("kind") ON TABLE "company_os"."interactions" TO "team_chatbot_reader";


--
-- Name: COLUMN "interactions"."subject"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("subject") ON TABLE "company_os"."interactions" TO "chatbot_reader";
GRANT SELECT("subject") ON TABLE "company_os"."interactions" TO "chatbot_writer";
GRANT SELECT("subject") ON TABLE "company_os"."interactions" TO "team_chatbot_reader";


--
-- Name: COLUMN "interactions"."occurred_at"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("occurred_at") ON TABLE "company_os"."interactions" TO "chatbot_reader";
GRANT SELECT("occurred_at") ON TABLE "company_os"."interactions" TO "chatbot_writer";
GRANT SELECT("occurred_at") ON TABLE "company_os"."interactions" TO "team_chatbot_reader";


--
-- Name: COLUMN "interactions"."owner_id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("owner_id") ON TABLE "company_os"."interactions" TO "chatbot_reader";
GRANT SELECT("owner_id") ON TABLE "company_os"."interactions" TO "chatbot_writer";
GRANT SELECT("owner_id") ON TABLE "company_os"."interactions" TO "team_chatbot_reader";


--
-- Name: COLUMN "interactions"."person_id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("person_id") ON TABLE "company_os"."interactions" TO "chatbot_reader";
GRANT SELECT("person_id") ON TABLE "company_os"."interactions" TO "chatbot_writer";
GRANT SELECT("person_id") ON TABLE "company_os"."interactions" TO "team_chatbot_reader";


--
-- Name: COLUMN "interactions"."company_id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("company_id") ON TABLE "company_os"."interactions" TO "chatbot_reader";
GRANT SELECT("company_id") ON TABLE "company_os"."interactions" TO "chatbot_writer";
GRANT SELECT("company_id") ON TABLE "company_os"."interactions" TO "team_chatbot_reader";


--
-- Name: COLUMN "interactions"."subject_type"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("subject_type") ON TABLE "company_os"."interactions" TO "chatbot_reader";
GRANT SELECT("subject_type") ON TABLE "company_os"."interactions" TO "chatbot_writer";
GRANT SELECT("subject_type") ON TABLE "company_os"."interactions" TO "team_chatbot_reader";


--
-- Name: COLUMN "interactions"."subject_id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("subject_id") ON TABLE "company_os"."interactions" TO "chatbot_reader";
GRANT SELECT("subject_id") ON TABLE "company_os"."interactions" TO "chatbot_writer";
GRANT SELECT("subject_id") ON TABLE "company_os"."interactions" TO "team_chatbot_reader";


--
-- Name: COLUMN "interactions"."metadata"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("metadata") ON TABLE "company_os"."interactions" TO "chatbot_reader";
GRANT SELECT("metadata") ON TABLE "company_os"."interactions" TO "chatbot_writer";
GRANT SELECT("metadata") ON TABLE "company_os"."interactions" TO "team_chatbot_reader";


--
-- Name: COLUMN "interactions"."created_at"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("created_at") ON TABLE "company_os"."interactions" TO "chatbot_reader";
GRANT SELECT("created_at") ON TABLE "company_os"."interactions" TO "chatbot_writer";
GRANT SELECT("created_at") ON TABLE "company_os"."interactions" TO "team_chatbot_reader";


--
-- Name: TABLE "interview_interviewers"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."interview_interviewers" TO "service_role";
GRANT SELECT ON TABLE "company_os"."interview_interviewers" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."interview_interviewers" TO "chatbot_writer";


--
-- Name: TABLE "interview_scorecards"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."interview_scorecards" TO "service_role";
GRANT SELECT ON TABLE "company_os"."interview_scorecards" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."interview_scorecards" TO "chatbot_writer";


--
-- Name: TABLE "interviews"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."interviews" TO "service_role";
GRANT SELECT ON TABLE "company_os"."interviews" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."interviews" TO "chatbot_writer";


--
-- Name: TABLE "invoices"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."invoices" TO "service_role";
GRANT SELECT ON TABLE "company_os"."invoices" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."invoices" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."invoices" TO "team_chatbot_reader";


--
-- Name: TABLE "issues"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."issues" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."issues" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."issues" TO "service_role";
GRANT SELECT ON TABLE "company_os"."issues" TO "team_chatbot_reader";


--
-- Name: TABLE "job_requisitions"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."job_requisitions" TO "service_role";
GRANT SELECT ON TABLE "company_os"."job_requisitions" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."job_requisitions" TO "chatbot_writer";


--
-- Name: TABLE "key_results"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."key_results" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."key_results" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."key_results" TO "service_role";
GRANT SELECT ON TABLE "company_os"."key_results" TO "team_chatbot_reader";


--
-- Name: TABLE "kr_logs"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."kr_logs" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."kr_logs" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."kr_logs" TO "service_role";
GRANT SELECT ON TABLE "company_os"."kr_logs" TO "team_chatbot_reader";


--
-- Name: TABLE "lead"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."lead" TO "service_role";
GRANT SELECT ON TABLE "company_os"."lead" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."lead" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."lead" TO "team_chatbot_reader";


--
-- Name: TABLE "leave_adjustments"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."leave_adjustments" TO "service_role";
GRANT SELECT ON TABLE "company_os"."leave_adjustments" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."leave_adjustments" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."leave_adjustments" TO "team_chatbot_reader";


--
-- Name: TABLE "legal_entities"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."legal_entities" TO "service_role";
GRANT SELECT ON TABLE "company_os"."legal_entities" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."legal_entities" TO "chatbot_writer";


--
-- Name: TABLE "lifecycle_transitions"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."lifecycle_transitions" TO "service_role";
GRANT SELECT ON TABLE "company_os"."lifecycle_transitions" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."lifecycle_transitions" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."lifecycle_transitions" TO "team_chatbot_reader";


--
-- Name: TABLE "marketing_asset_images"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."marketing_asset_images" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."marketing_asset_images" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."marketing_asset_images" TO "service_role";
GRANT SELECT ON TABLE "company_os"."marketing_asset_images" TO "supabase_read_only_user";


--
-- Name: TABLE "marketing_campaigns"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."marketing_campaigns" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."marketing_campaigns" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."marketing_campaigns" TO "service_role";
GRANT SELECT ON TABLE "company_os"."marketing_campaigns" TO "supabase_read_only_user";


--
-- Name: TABLE "marketing_content"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."marketing_content" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."marketing_content" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."marketing_content" TO "service_role";
GRANT SELECT ON TABLE "company_os"."marketing_content" TO "supabase_read_only_user";


--
-- Name: TABLE "marketing_pillars"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."marketing_pillars" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."marketing_pillars" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."marketing_pillars" TO "service_role";
GRANT SELECT ON TABLE "company_os"."marketing_pillars" TO "supabase_read_only_user";


--
-- Name: TABLE "meeting_action_items"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."meeting_action_items" TO "service_role";
GRANT SELECT ON TABLE "company_os"."meeting_action_items" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."meeting_action_items" TO "chatbot_writer";


--
-- Name: TABLE "meeting_associations"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."meeting_associations" TO "service_role";
GRANT SELECT ON TABLE "company_os"."meeting_associations" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."meeting_associations" TO "chatbot_writer";


--
-- Name: TABLE "meeting_participants"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."meeting_participants" TO "service_role";
GRANT SELECT ON TABLE "company_os"."meeting_participants" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."meeting_participants" TO "chatbot_writer";


--
-- Name: TABLE "meetings"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."meetings" TO "service_role";
GRANT SELECT ON TABLE "company_os"."meetings" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."meetings" TO "chatbot_writer";


--
-- Name: TABLE "objectives"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."objectives" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."objectives" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."objectives" TO "service_role";
GRANT SELECT ON TABLE "company_os"."objectives" TO "team_chatbot_reader";


--
-- Name: TABLE "offers"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."offers" TO "service_role";
GRANT SELECT ON TABLE "company_os"."offers" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."offers" TO "chatbot_writer";


--
-- Name: TABLE "onboarding_plans"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."onboarding_plans" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."onboarding_plans" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."onboarding_plans" TO "service_role";


--
-- Name: TABLE "onboarding_tasks"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."onboarding_tasks" TO "service_role";
GRANT SELECT ON TABLE "company_os"."onboarding_tasks" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."onboarding_tasks" TO "chatbot_writer";


--
-- Name: TABLE "orders"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."orders" TO "service_role";
GRANT SELECT ON TABLE "company_os"."orders" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."orders" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."orders" TO "team_chatbot_reader";


--
-- Name: TABLE "people_sensitive"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."people_sensitive" TO "service_role";


--
-- Name: TABLE "people_with_deals"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."people_with_deals" TO "service_role";
GRANT SELECT ON TABLE "company_os"."people_with_deals" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."people_with_deals" TO "chatbot_writer";


--
-- Name: TABLE "performance_reviews"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."performance_reviews" TO "service_role";


--
-- Name: TABLE "person_companies"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."person_companies" TO "service_role";
GRANT SELECT ON TABLE "company_os"."person_companies" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."person_companies" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."person_companies" TO "team_chatbot_reader";


--
-- Name: TABLE "person_git_emails"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."person_git_emails" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."person_git_emails" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."person_git_emails" TO "service_role";
GRANT SELECT ON TABLE "company_os"."person_git_emails" TO "supabase_read_only_user";


--
-- Name: TABLE "person_qualifications"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."person_qualifications" TO "service_role";
GRANT SELECT ON TABLE "company_os"."person_qualifications" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."person_qualifications" TO "chatbot_writer";


--
-- Name: TABLE "pipeline_stages"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."pipeline_stages" TO "service_role";
GRANT SELECT ON TABLE "company_os"."pipeline_stages" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."pipeline_stages" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."pipeline_stages" TO "team_chatbot_reader";


--
-- Name: TABLE "pipelines"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."pipelines" TO "service_role";
GRANT SELECT ON TABLE "company_os"."pipelines" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."pipelines" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."pipelines" TO "team_chatbot_reader";


--
-- Name: TABLE "portal_assume_sessions"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."portal_assume_sessions" TO "service_role";
GRANT SELECT ON TABLE "company_os"."portal_assume_sessions" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."portal_assume_sessions" TO "chatbot_writer";


--
-- Name: TABLE "portal_members"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."portal_members" TO "service_role";
GRANT SELECT ON TABLE "company_os"."portal_members" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."portal_members" TO "chatbot_writer";


--
-- Name: TABLE "products"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."products" TO "service_role";
GRANT SELECT ON TABLE "company_os"."products" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."products" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."products" TO "team_chatbot_reader";


--
-- Name: TABLE "program_documents"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."program_documents" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."program_documents" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."program_documents" TO "service_role";


--
-- Name: TABLE "program_plans"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."program_plans" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."program_plans" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."program_plans" TO "service_role";


--
-- Name: TABLE "lark_user_connections"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."lark_user_connections" TO "service_role";


--
-- Name: TABLE "qbo_connection"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."qbo_connection" TO "service_role";


--
-- Name: TABLE "requisition_loop_steps"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."requisition_loop_steps" TO "service_role";

--
-- Name: TABLE "requisition_loop_interviewers"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."requisition_loop_interviewers" TO "service_role";



--
-- Name: TABLE "scorecard_scores"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."scorecard_scores" TO "service_role";
GRANT SELECT ON TABLE "company_os"."scorecard_scores" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."scorecard_scores" TO "chatbot_writer";


--
-- Name: TABLE "service_lines"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."service_lines" TO "service_role";
GRANT SELECT ON TABLE "company_os"."service_lines" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."service_lines" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."service_lines" TO "team_chatbot_reader";


--
-- Name: TABLE "sprints"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."sprints" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."sprints" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."sprints" TO "service_role";
GRANT SELECT ON TABLE "company_os"."sprints" TO "supabase_read_only_user";


--
-- Name: TABLE "staff_assignments"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."staff_assignments" TO "service_role";
GRANT SELECT ON TABLE "company_os"."staff_assignments" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."staff_assignments" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."staff_assignments" TO "team_chatbot_reader";


--
-- Name: TABLE "strategies"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."strategies" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."strategies" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."strategies" TO "service_role";
GRANT SELECT ON TABLE "company_os"."strategies" TO "team_chatbot_reader";


--
-- Name: TABLE "subscriptions"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."subscriptions" TO "service_role";
GRANT SELECT ON TABLE "company_os"."subscriptions" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."subscriptions" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."subscriptions" TO "team_chatbot_reader";


--
-- Name: TABLE "survey_answers"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."survey_answers" TO "service_role";
GRANT SELECT ON TABLE "company_os"."survey_answers" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."survey_answers" TO "chatbot_writer";


--
-- Name: TABLE "survey_fields"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."survey_fields" TO "service_role";
GRANT SELECT ON TABLE "company_os"."survey_fields" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."survey_fields" TO "chatbot_writer";


--
-- Name: TABLE "survey_list"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."survey_list" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."survey_list" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."survey_list" TO "service_role";


--
-- Name: TABLE "survey_responses"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."survey_responses" TO "service_role";
GRANT SELECT ON TABLE "company_os"."survey_responses" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."survey_responses" TO "chatbot_writer";


--
-- Name: TABLE "surveys"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."surveys" TO "service_role";
GRANT SELECT ON TABLE "company_os"."surveys" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."surveys" TO "chatbot_writer";


--
-- Name: TABLE "sync_packets"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."sync_packets" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."sync_packets" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."sync_packets" TO "service_role";
GRANT SELECT ON TABLE "company_os"."sync_packets" TO "team_chatbot_reader";


--
-- Name: TABLE "taggables"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."taggables" TO "service_role";
GRANT SELECT ON TABLE "company_os"."taggables" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."taggables" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."taggables" TO "team_chatbot_reader";


--
-- Name: TABLE "tags"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."tags" TO "service_role";
GRANT SELECT ON TABLE "company_os"."tags" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."tags" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."tags" TO "team_chatbot_reader";


--
-- Name: TABLE "talks"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."talks" TO "chatbot_reader";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."talks" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."talks" TO "chatbot_writer";


--
-- Name: TABLE "task_comments"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."task_comments" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."task_comments" TO "chatbot_writer";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."task_comments" TO "service_role";
GRANT SELECT ON TABLE "company_os"."task_comments" TO "supabase_read_only_user";


--
-- Name: TABLE "task_stage_log"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."task_stage_log" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."task_stage_log" TO "chatbot_writer";
GRANT SELECT,INSERT ON TABLE "company_os"."task_stage_log" TO "service_role";
GRANT SELECT ON TABLE "company_os"."task_stage_log" TO "supabase_read_only_user";


--
-- Name: TABLE "deal_stage_log"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."deal_stage_log" TO "chatbot_reader";
GRANT SELECT,INSERT ON TABLE "company_os"."deal_stage_log" TO "service_role";
GRANT SELECT ON TABLE "company_os"."deal_stage_log" TO "supabase_read_only_user";


--
-- Name: TABLE "tasks"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."tasks" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."tasks" TO "chatbot_writer";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."tasks" TO "service_role";
GRANT SELECT ON TABLE "company_os"."tasks" TO "supabase_read_only_user";


--
-- Name: TABLE "time_off"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."time_off" TO "service_role";
GRANT SELECT ON TABLE "company_os"."time_off" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."time_off" TO "chatbot_writer";


--
-- Name: COLUMN "time_off"."id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("id") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."team_member_id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("team_member_id") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."leave_type"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("leave_type") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."status"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("status") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."start_date"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("start_date") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."end_date"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("end_date") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."is_half_day"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("is_half_day") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."hours"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("hours") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."approved_at"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("approved_at") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."created_at"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("created_at") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."updated_at"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("updated_at") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."external_source"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("external_source") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."external_id"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("external_id") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."days"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("days") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: COLUMN "time_off"."requested_at"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT("requested_at") ON TABLE "company_os"."time_off" TO "team_chatbot_reader";


--
-- Name: TABLE "token_purchases"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT ON TABLE "company_os"."token_purchases" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."token_purchases" TO "chatbot_writer";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."token_purchases" TO "service_role";


--
-- Name: TABLE "vendors"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "company_os"."vendors" TO "service_role";
GRANT SELECT ON TABLE "company_os"."vendors" TO "chatbot_reader";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."vendors" TO "chatbot_writer";
GRANT SELECT ON TABLE "company_os"."vendors" TO "team_chatbot_reader";


--
-- Name: TABLE "client_identities"; Type: ACL; Schema: htt; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "htt"."client_identities" TO "service_role";
GRANT SELECT ON TABLE "htt"."client_identities" TO "supabase_read_only_user";


--
-- Name: TABLE "man_hour_entries"; Type: ACL; Schema: htt; Owner: -
--

GRANT SELECT,INSERT ON TABLE "htt"."delivered_additions" TO "service_role";
GRANT SELECT ON TABLE "htt"."delivered_additions" TO "supabase_read_only_user";
GRANT SELECT,USAGE ON SEQUENCE "htt"."delivered_additions_seq_seq" TO "service_role";


GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "htt"."man_hour_entries" TO "service_role";
GRANT SELECT ON TABLE "htt"."man_hour_entries" TO "supabase_read_only_user";


--
-- Name: TABLE "project_goals"; Type: ACL; Schema: htt; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "htt"."project_goals" TO "service_role";
GRANT SELECT ON TABLE "htt"."project_goals" TO "supabase_read_only_user";


--
-- Name: SEQUENCE "project_goals_seq_seq"; Type: ACL; Schema: htt; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE "htt"."project_goals_seq_seq" TO "service_role";


--
-- Name: TABLE "project_summaries"; Type: ACL; Schema: htt; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "htt"."project_summaries" TO "service_role";
GRANT SELECT ON TABLE "htt"."project_summaries" TO "supabase_read_only_user";


--
-- Name: TABLE "pull_requests"; Type: ACL; Schema: htt; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "htt"."pull_requests" TO "service_role";
GRANT SELECT ON TABLE "htt"."pull_requests" TO "supabase_read_only_user";


--
-- Name: TABLE "repos"; Type: ACL; Schema: htt; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "htt"."repos" TO "service_role";
GRANT SELECT ON TABLE "htt"."repos" TO "supabase_read_only_user";


--
-- Name: TABLE "sync_runs"; Type: ACL; Schema: htt; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "htt"."sync_runs" TO "service_role";
GRANT SELECT ON TABLE "htt"."sync_runs" TO "supabase_read_only_user";


--
-- Name: TABLE "token_allocations"; Type: ACL; Schema: htt; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "htt"."token_allocations" TO "service_role";
GRANT SELECT ON TABLE "htt"."token_allocations" TO "supabase_read_only_user";


--
-- Name: SEQUENCE "token_allocations_seq_seq"; Type: ACL; Schema: htt; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE "htt"."token_allocations_seq_seq" TO "service_role";


--
-- Name: TABLE "token_entries"; Type: ACL; Schema: htt; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "htt"."token_entries" TO "service_role";
GRANT SELECT ON TABLE "htt"."token_entries" TO "supabase_read_only_user";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: company_os; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "company_os" GRANT SELECT,USAGE ON SEQUENCES TO "chatbot_writer";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: company_os; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "company_os" GRANT SELECT ON TABLES TO "chatbot_reader";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "company_os" GRANT SELECT,INSERT,UPDATE ON TABLES TO "chatbot_writer";


--
-- PostgreSQL database dump complete
--

\unrestrict cqXJ73dt0Qr7HbA24BUFRRY9ENvzwozpbfMEdaDocYuX3QVAAp8Ordaa34J7kWf

--
-- Revenue hub v2 (20260913170000_revenue_hub_v2.sql): targets, nightly
-- snapshots, the latest-stage view and the two aggregate functions.
--

CREATE TABLE "company_os"."revenue_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metric" "text" NOT NULL,
    "period_kind" "text" DEFAULT 'month'::"text" NOT NULL,
    "period_start" "date" NOT NULL,
    "amount" bigint NOT NULL,
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "revenue_targets_amount_check" CHECK (("amount" >= 0)),
    CONSTRAINT "revenue_targets_period_kind_check" CHECK (("period_kind" = ANY (ARRAY['month'::"text", 'quarter'::"text", 'year'::"text"])))
);

COMMENT ON TABLE "company_os"."revenue_targets" IS 'One company-level target for one metric in one period.';

CREATE TABLE "company_os"."revenue_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "taken_on" "date" NOT NULL,
    "open_deals" integer DEFAULT 0 NOT NULL,
    "open_usd_cents" bigint DEFAULT 0 NOT NULL,
    "open_weighted_usd_cents" bigint DEFAULT 0 NOT NULL,
    "won_mtd_usd_cents" bigint DEFAULT 0 NOT NULL,
    "receivable_cents" bigint DEFAULT 0 NOT NULL,
    "overdue_cents" bigint DEFAULT 0 NOT NULL,
    "inquiries_30d" integer DEFAULT 0 NOT NULL,
    "by_stage" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cash_90d_cents" bigint DEFAULT 0 NOT NULL
);

COMMENT ON TABLE "company_os"."revenue_snapshots" IS 'One nightly reading of the revenue figures, so the hub can chart them over time.';

CREATE VIEW "company_os"."deal_stage_current" AS
 SELECT DISTINCT ON ("deal_stage_log"."deal_id") "deal_stage_log"."deal_id",
    "deal_stage_log"."to_stage_id",
    "deal_stage_log"."moved_at"
   FROM "company_os"."deal_stage_log"
  ORDER BY "deal_stage_log"."deal_id", "deal_stage_log"."moved_at" DESC;

CREATE FUNCTION "company_os"."interactions_by_month"("p_months" integer DEFAULT 12) RETURNS TABLE("month" "text", "kind" "text", "n" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  select to_char(date_trunc('month', occurred_at), 'YYYY-MM') as month, kind, count(*) as n
  from company_os.interactions
  where occurred_at >= date_trunc('month', now()) - make_interval(months => p_months - 1)
  group by 1, 2
  order by 1, 2
$$;

CREATE FUNCTION "company_os"."deal_stage_velocity"("p_since" timestamp with time zone DEFAULT ("now"() - '365 days'::interval)) RETURNS TABLE("stage_id" "uuid", "entered" bigint, "exited" bigint, "advanced" bigint, "won" bigint, "lost" bigint, "avg_days" numeric, "median_days" numeric)
    LANGUAGE "sql" STABLE
    AS $$
  with hops as (
    select l.to_stage_id as stage_id,
           l.moved_at as entered_at,
           lead(l.moved_at) over (partition by l.deal_id order by l.moved_at) as exited_at,
           lead(l.to_stage_id) over (partition by l.deal_id order by l.moved_at) as next_stage_id
    from company_os.deal_stage_log l
    where l.to_stage_id is not null and l.moved_at >= p_since
  ), judged as (
    select h.stage_id, h.entered_at, h.exited_at,
           extract(epoch from (h.exited_at - h.entered_at)) / 86400.0 as days,
           ns.is_won as to_won, ns.is_lost as to_lost,
           (ns.position > s.position and not ns.is_won and not ns.is_lost) as to_forward
    from hops h
    join company_os.pipeline_stages s on s.id = h.stage_id
    left join company_os.pipeline_stages ns on ns.id = h.next_stage_id
  )
  select stage_id,
         count(*) as entered,
         count(exited_at) as exited,
         count(*) filter (where to_forward) as advanced,
         count(*) filter (where to_won) as won,
         count(*) filter (where to_lost) as lost,
         round(avg(days) filter (where exited_at is not null), 1) as avg_days,
         round(percentile_cont(0.5) within group (order by days) filter (where exited_at is not null)::numeric, 1) as median_days
  from judged
  group by stage_id
$$;

ALTER TABLE ONLY "company_os"."revenue_targets"
    ADD CONSTRAINT "revenue_targets_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "company_os"."revenue_targets"
    ADD CONSTRAINT "revenue_targets_metric_period_kind_period_start_key" UNIQUE ("metric", "period_kind", "period_start");

ALTER TABLE ONLY "company_os"."revenue_snapshots"
    ADD CONSTRAINT "revenue_snapshots_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "company_os"."revenue_snapshots"
    ADD CONSTRAINT "revenue_snapshots_taken_on_key" UNIQUE ("taken_on");

CREATE UNIQUE INDEX "marketing_campaigns_utm_campaign_key" ON "company_os"."marketing_campaigns" USING "btree" ("utm_campaign") WHERE ("utm_campaign" IS NOT NULL);

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "company_os"."revenue_targets" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."revenue_snapshots" TO "service_role";
GRANT SELECT ON TABLE "company_os"."deal_stage_current" TO "service_role";
GRANT ALL ON FUNCTION "company_os"."interactions_by_month"("p_months" integer) TO "service_role";
GRANT ALL ON FUNCTION "company_os"."deal_stage_velocity"("p_since" timestamp with time zone) TO "service_role";

--
-- Account health and renewal (20260925110000_account_health.sql): one live
-- renewal per client account, and one nightly health reading per account.
--

CREATE TABLE "company_os"."renewals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "renews_on" "date" NOT NULL,
    "term_months" integer,
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "note" "text",
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "renewals_term_months_check" CHECK (("term_months" > 0)),
    CONSTRAINT "renewals_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'renewed'::"text", 'churned'::"text", 'lapsed'::"text"])))
);

COMMENT ON TABLE "company_os"."renewals" IS 'One row is: one renewal date of one client account — when its current agreement comes up for renewal, and how that renewal went. [transactional · Revenue documents | tier 3 support | active]';

CREATE TABLE "company_os"."account_health_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "taken_on" "date" NOT NULL,
    "signals" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "score" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "account_health_snapshots_score_check" CHECK ((("score" >= 0) AND ("score" <= 100)))
);

COMMENT ON TABLE "company_os"."account_health_snapshots" IS 'One row is: one nightly health reading of one client account. [other · Logs, audit & telemetry | tier 3 support | active]';

ALTER TABLE ONLY "company_os"."renewals"
    ADD CONSTRAINT "renewals_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "company_os"."renewals"
    ADD CONSTRAINT "renewals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "renewals_live_company_key" ON "company_os"."renewals" USING "btree" ("company_id") WHERE ("archived_at" IS NULL);

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "company_os"."renewals" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();

ALTER TABLE ONLY "company_os"."account_health_snapshots"
    ADD CONSTRAINT "account_health_snapshots_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "company_os"."account_health_snapshots"
    ADD CONSTRAINT "account_health_snapshots_company_id_taken_on_key" UNIQUE ("company_id", "taken_on");

ALTER TABLE ONLY "company_os"."account_health_snapshots"
    ADD CONSTRAINT "account_health_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_os"."companies"("id") ON DELETE CASCADE;

CREATE INDEX "account_health_snapshots_taken_on_idx" ON "company_os"."account_health_snapshots" USING "btree" ("taken_on" DESC);

ALTER TABLE "company_os"."renewals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_os"."account_health_snapshots" ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "company_os"."renewals" TO "service_role";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "company_os"."account_health_snapshots" TO "service_role";
--
-- S.3: the inbox tables' foreign keys, added here rather than inline because
-- the tables they reference get their primary keys only above this point.
ALTER TABLE ONLY "company_os"."notification_prefs"
    ADD CONSTRAINT "notification_prefs_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "company_os"."notifications"
    ADD CONSTRAINT "notifications_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "company_os"."notification_reads"
    ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "company_os"."notifications"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "company_os"."notification_reads"
    ADD CONSTRAINT "notification_reads_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id") ON DELETE CASCADE;

ALTER TABLE "company_os"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_os"."notification_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_os"."notification_prefs" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "company_os"."notifications" TO "service_role";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "company_os"."notification_reads" TO "service_role";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "company_os"."notification_prefs" TO "service_role";

-- S.5: the approvals table's indexes and foreign keys, after every key exists.
CREATE UNIQUE INDEX "approvals_one_pending_per_subject" ON "company_os"."approvals" USING "btree" ("subject_type", "subject_id") WHERE ("state" = 'pending'::"text");
CREATE INDEX "approvals_pending_by_approver" ON "company_os"."approvals" USING "btree" ("approver_person_id") WHERE ("state" = 'pending'::"text");
ALTER TABLE ONLY "company_os"."approvals"
    ADD CONSTRAINT "approvals_approver_person_id_fkey" FOREIGN KEY ("approver_person_id") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "company_os"."approvals"
    ADD CONSTRAINT "approvals_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "company_os"."approvals"
    ADD CONSTRAINT "approvals_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "company_os"."people"("id") ON DELETE SET NULL;

ALTER TABLE "company_os"."approvals" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "company_os"."approvals" TO "service_role";

-- O.1: payroll history, locked down like compensation_sensitive.
create table if not exists company_os.payroll_runs_sensitive (
  id               uuid primary key default gen_random_uuid(),
  legal_entity_id  uuid not null references company_os.legal_entities(id),
  period           date not null check (period = date_trunc('month', period)::date),
  status           text not null default 'paid' check (status in ('draft', 'approved', 'paid')),
  is_estimate      boolean not null default false,
  working_days     numeric(4,1),
  source_file      text,
  imported_at      timestamptz,
  imported_by      text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz,
  unique (legal_entity_id, period)
);

create table if not exists company_os.payroll_lines_sensitive (
  id                      uuid primary key default gen_random_uuid(),
  payroll_run_id          uuid not null references company_os.payroll_runs_sensitive(id),
  team_member_id          uuid not null references company_os.team_members(id),
  position                text,
  on_probation            boolean not null default false,
  dependents              smallint not null default 0,
  contract_salary_vnd     bigint,
  days_worked             numeric(5,2),
  gross_salary_vnd        bigint,
  lunch_allowance_vnd     bigint not null default 0,
  internet_allowance_vnd  bigint not null default 0,
  phone_allowance_vnd     bigint not null default 0,
  other_allowance_vnd     bigint not null default 0,
  bonus_vnd               bigint not null default 0,
  overtime_vnd            bigint not null default 0,
  overtime_hours          numeric(6,2) not null default 0,
  total_income_vnd        bigint,
  insurance_base_vnd      bigint,
  employee_si_vnd         bigint not null default 0,
  employee_hi_vnd         bigint not null default 0,
  employee_ui_vnd         bigint not null default 0,
  self_deduction_vnd      bigint not null default 0,
  family_deduction_vnd    bigint not null default 0,
  taxable_income_vnd      bigint,
  pit_vnd                 bigint not null default 0,
  net_salary_vnd          bigint,
  employer_si_vnd         bigint not null default 0,
  employer_hi_vnd         bigint not null default 0,
  employer_ui_vnd         bigint not null default 0,
  other_receivable_vnd    bigint not null default 0,
  other_payable_vnd       bigint not null default 0,
  paid_vnd                bigint,
  unpaid_leave_days       numeric(4,1) not null default 0,
  annual_leave_days       numeric(4,1) not null default 0,
  adjustments             jsonb not null default '[]'::jsonb check (jsonb_typeof(adjustments) = 'array'),
  source_row              integer,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (payroll_run_id, team_member_id)
);

create index if not exists payroll_lines_sensitive_member_idx
  on company_os.payroll_lines_sensitive (team_member_id);

alter table company_os.payroll_runs_sensitive enable row level security;
alter table company_os.payroll_lines_sensitive enable row level security;

grant select, insert, update, delete on company_os.payroll_runs_sensitive to service_role;
grant select, insert, update, delete on company_os.payroll_lines_sensitive to service_role;
revoke all on company_os.payroll_runs_sensitive from public, anon, authenticated;
revoke all on company_os.payroll_lines_sensitive from public, anon, authenticated;

--
-- 20261003140000_survey_assignments (hand-applied): one survey assigned to one
-- person, open until they answer it. The survey engine is org's, which is
-- portable, so a fork gets the table.
--

create table if not exists company_os.survey_assignments (
  id               uuid primary key default gen_random_uuid(),
  survey_id        uuid not null references company_os.surveys(id) on delete cascade,
  person_id        uuid not null references company_os.people(id) on delete cascade,
  cohort_slug      text,
  assigned_by      text not null,
  assigned_at      timestamptz not null default now(),
  due_on           date,
  completed_at     timestamptz,
  response_id      uuid references company_os.survey_responses(id) on delete set null,
  last_reminded_at timestamptz,
  reminder_count   integer not null default 0,
  constraint survey_assignments_survey_person_cohort_key unique nulls not distinct (survey_id, person_id, cohort_slug)
);

create index if not exists survey_assignments_open_person_idx
  on company_os.survey_assignments (person_id) where completed_at is null;

alter table company_os.survey_assignments enable row level security;

grant select, insert, update, delete on company_os.survey_assignments to service_role;
revoke all on company_os.survey_assignments from public, anon, authenticated;

--
-- 20260929090000_capability_pulse_session_views (hand-applied): the capability
-- pulse per response and per session, over survey_responses, survey_answers and
-- events. The survey engine is org's, which is portable, so a fork gets the views.
--

create or replace view company_os.capability_pulse_responses
  with (security_invoker = true) as
 SELECT r.id AS response_id,
    r.submitted_at,
        CASE
            WHEN r.survey_id = 'fe61e04c-e376-46df-b303-2ffdbba6058d'::uuid THEN 'pulse'::text
            ELSE 'session_rating'::text
        END AS source,
    r.metadata ->> 'source'::text AS channel,
    r.metadata ->> 'module'::text AS module,
        CASE
            WHEN r.survey_id = 'fe61e04c-e376-46df-b303-2ffdbba6058d'::uuid THEN 'cohort:'::text || COALESCE(r.cohort_slug, 'none'::text)
            ELSE 'item:'::text || COALESCE(r.metadata ->> 'item_id'::text, r.id::text)
        END AS session_key,
        CASE
            WHEN (r.metadata ->> 'module'::text) = 'coaching'::text THEN COALESCE(r.metadata ->> 'item_title'::text, 'Coaching'::text) || COALESCE((' ('::text || replace(r.cohort_slug, 'coaching-'::text, ''::text)) || ')'::text, ''::text)
            ELSE COALESCE(NULLIF(r.metadata ->> 'item_title'::text, ''::text), NULLIF(r.metadata ->> 'session'::text, ''::text), ( SELECT e.title
               FROM company_os.events e
              WHERE e.slug = r.cohort_slug
              ORDER BY e.starts_at DESC
             LIMIT 1), r.cohort_slug, '(no session)'::text)
        END AS session_title,
    r.cohort_slug,
    r.respondent_kind,
    r.respondent_name,
    r.respondent_email,
    ans.pulse_capable,
    ans.pulse_loved,
    ans.pulse_improve,
    ans.sr_apply_this_week,
    ans.sr_ready_to_lead,
    ans.sr_note,
    ans.sr_quote_ok
   FROM company_os.survey_responses r
     LEFT JOIN LATERAL ( SELECT max(x.num) FILTER (WHERE x.field_id = 'b75ede35-8a66-43f0-9232-4069c12e36e8'::uuid) AS pulse_capable,
            max(x.value) FILTER (WHERE x.field_id = 'd03ef9cc-e3ed-45e3-b31f-9060d6a17543'::uuid) AS pulse_loved,
            max(x.value) FILTER (WHERE x.field_id = '34801bcb-14d1-42b0-92cd-27e8d814dadb'::uuid) AS pulse_improve,
            max(x.num) FILTER (WHERE x.field_id = 'a1b2c3d4-0000-4000-8000-000000010401'::uuid) AS sr_apply_this_week,
            max(x.num) FILTER (WHERE x.field_id = 'a1b2c3d4-0000-4000-8000-000000010402'::uuid) AS sr_ready_to_lead,
            max(x.value) FILTER (WHERE x.field_id = 'a1b2c3d4-0000-4000-8000-000000010403'::uuid) AS sr_note,
            bool_or(x.value = 'Yes'::text) FILTER (WHERE x.field_id = 'a1b2c3d4-0000-4000-8000-000000010404'::uuid) AS sr_quote_ok
           FROM ( SELECT a.field_id,
                    a.value,
                    COALESCE(
                        CASE
                            WHEN jsonb_typeof(a.value_json) = 'number'::text THEN (a.value_json #>> '{}'::text[])::numeric
                            ELSE NULL::numeric
                        END,
                        CASE
                            WHEN a.value ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'::text THEN TRIM(BOTH FROM a.value)::numeric
                            ELSE NULL::numeric
                        END) AS num
                   FROM company_os.survey_answers a
                  WHERE a.response_id = r.id) x) ans ON true
  WHERE r.survey_id = ANY (ARRAY['fe61e04c-e376-46df-b303-2ffdbba6058d'::uuid, 'a1b2c3d4-0000-4000-8000-000000000104'::uuid]);

create or replace view company_os.capability_pulse_sessions
  with (security_invoker = true) as
 SELECT capability_pulse_responses.session_key,
    min(capability_pulse_responses.session_title) AS session_title,
    string_agg(DISTINCT capability_pulse_responses.source, ', '::text) AS sources,
    string_agg(DISTINCT COALESCE(capability_pulse_responses.module, capability_pulse_responses.channel), ', '::text) AS kind,
    min(capability_pulse_responses.cohort_slug) AS cohort_slug,
    count(*)::integer AS responses,
    min(capability_pulse_responses.submitted_at) AS first_response_at,
    max(capability_pulse_responses.submitted_at) AS last_response_at,
    round(avg(capability_pulse_responses.pulse_capable), 2) AS avg_pulse_capable,
    round(avg(capability_pulse_responses.sr_apply_this_week), 2) AS avg_sr_apply_this_week,
    round(avg(capability_pulse_responses.sr_ready_to_lead), 2) AS avg_sr_ready_to_lead,
    round((COALESCE(sum(capability_pulse_responses.pulse_capable), 0::numeric) + COALESCE(sum(capability_pulse_responses.sr_apply_this_week), 0::numeric) + COALESCE(sum(capability_pulse_responses.sr_ready_to_lead), 0::numeric)) / NULLIF(count(capability_pulse_responses.pulse_capable) + count(capability_pulse_responses.sr_apply_this_week) + count(capability_pulse_responses.sr_ready_to_lead), 0)::numeric, 2) AS avg_score,
    count(*) FILTER (WHERE capability_pulse_responses.sr_quote_ok)::integer AS quote_ok_count
   FROM company_os.capability_pulse_responses
  GROUP BY capability_pulse_responses.session_key;


-- 20261005140000 (W.154): a card's deliverables, a file in the card-attachments
-- bucket or a link, deleted with its card and archived rather than deleted.
create table if not exists company_os.task_attachments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references company_os.tasks (id) on delete cascade,
  kind          text not null check (kind in ('file', 'link')),
  storage_path  text unique,
  filename      text,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  width         integer check (width is null or width > 0),
  height        integer check (height is null or height > 0),
  url           text check (url is null or url ~* '^https?://'),
  title         text,
  uploaded_by   uuid references company_os.people (id) on delete set null,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  archived_at   timestamptz,
  archived_by   uuid references company_os.people (id) on delete set null,
  constraint task_attachments_kind_shape check (
    (kind = 'file' and storage_path is not null and filename is not null and url is null)
    or (kind = 'link' and url is not null and storage_path is null and filename is null and confirmed_at is not null)
  )
);
create index if not exists task_attachments_live_by_task_idx
  on company_os.task_attachments (task_id, created_at)
  where archived_at is null and confirmed_at is not null;
create index if not exists task_attachments_unconfirmed_idx
  on company_os.task_attachments (created_at)
  where confirmed_at is null;
create index if not exists task_attachments_archived_idx
  on company_os.task_attachments (archived_at)
  where archived_at is not null;
alter table company_os.task_attachments enable row level security;
grant select, insert, update, delete on company_os.task_attachments to service_role;
revoke all on company_os.task_attachments from public, anon, authenticated;

-- 20261006150000 (AC.2): the access tables (ADR 0013). Roles granted or implied,
-- which permissions each holds, and who holds which granted role; append-only,
-- no end dates. Seeded with the ten roles that reproduce today's access.
create table if not exists company_os.access_roles (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique check (key ~ '^[a-z][a-z0-9-]*$'),
  name         text not null check (length(trim(name)) > 0),
  description  text not null check (length(trim(description)) > 0),
  kind         text not null check (kind in ('granted', 'implied')),
  created_at   timestamptz not null default now(),
  archived_at  timestamptz,
  archived_by  uuid references company_os.people (id) on delete set null
);

create table if not exists company_os.access_role_permissions (
  id          uuid primary key default gen_random_uuid(),
  role_id     uuid not null references company_os.access_roles (id) on delete restrict,
  permission  text not null check (permission ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*(\.(view|manage))?$'),
  scope       text not null check (scope in ('own', 'team', 'clients', 'all')),
  created_at  timestamptz not null default now(),
  created_by  uuid references company_os.people (id) on delete set null,
  revoked_at  timestamptz,
  revoked_by  uuid references company_os.people (id) on delete set null
);
-- A role holds a permission at most once at a time; revoked pairs are history.
create unique index if not exists access_role_permissions_live_uniq
  on company_os.access_role_permissions (role_id, permission)
  where revoked_at is null;

create table if not exists company_os.access_role_assignments (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references company_os.people (id) on delete restrict,
  role_id        uuid not null references company_os.access_roles (id) on delete restrict,
  granted_by     uuid references company_os.people (id) on delete set null,
  reason         text not null check (length(trim(reason)) > 0),
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_by     uuid references company_os.people (id) on delete set null,
  revoke_reason  text,
  -- A revoke always says why, and a reason is only ever written by a revoke.
  constraint access_role_assignments_revoke_shape check ((revoked_at is null) = (revoke_reason is null))
);
-- A person holds a role at most once at a time; revoked grants are history.
create unique index if not exists access_role_assignments_live_uniq
  on company_os.access_role_assignments (person_id, role_id)
  where revoked_at is null;

alter table company_os.access_roles enable row level security;
grant select, insert, update, delete on company_os.access_roles to service_role;
revoke all on company_os.access_roles from public, anon, authenticated;
alter table company_os.access_role_permissions enable row level security;
grant select, insert, update, delete on company_os.access_role_permissions to service_role;
revoke all on company_os.access_role_permissions from public, anon, authenticated;
alter table company_os.access_role_assignments enable row level security;
grant select, insert, update, delete on company_os.access_role_assignments to service_role;
revoke all on company_os.access_role_assignments from public, anon, authenticated;

-- The ten roles that reproduce today's access. Implied roles follow a fact the
-- resolver reads; granted ones are assigned by a person (until AC.20, Admin and
-- Super Admin come from company_os.admins, and Revenue and Finance from
-- team_members.permissions).
insert into company_os.access_roles (key, name, description, kind) values
  ('team-member',    'Team member',    'On the team full-time, part-time or as an intern: what every team member sees.', 'implied'),
  ('contractor',     'Contractor',     'On the team on a contract: onboarded like anyone, starting from a narrower view.', 'implied'),
  ('manager',        'Manager',        'Has at least one person reporting to them, and sees that team''s records.', 'implied'),
  ('coach',          'Coach',          'Coaches at least one person, and sees their coaching.', 'implied'),
  ('hiring-manager', 'Hiring manager', 'Owns at least one open requisition, and runs its hiring.', 'implied'),
  ('client-user',    'Client user',    'A member of a client company in the portal, seeing that company''s work.', 'implied'),
  ('admin',          'Admin',          'Runs the Admin view.', 'granted'),
  ('super-admin',    'Super Admin',    'An admin who may also see pay, personal records and recruiting.', 'granted'),
  ('revenue',        'Revenue',        'Works in the Revenue module: the CRM, commerce and marketing.', 'granted'),
  ('finance',        'Finance',        'Works in the Finance module: payroll and payments.', 'granted')
on conflict (key) do nothing;


-- 20261006170000 (AC.4): each declared permission's default holders (ADR 0013).
insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, v.permission, v.scope
from (values
  ('admin', 'boards.manage', 'all'),
  ('admin', 'boards.open', 'all'),
  ('admin', 'boards.plan', 'all'),
  ('admin', 'campaigns.marketing', 'all'),
  ('admin', 'client-programs.roadmaps', 'all'),
  ('admin', 'company-os.clients', 'all'),
  ('admin', 'company-os.commerce', 'all'),
  ('admin', 'company-os.operations', 'all'),
  ('admin', 'company-os.settings', 'all'),
  ('admin', 'crm.billing', 'all'),
  ('admin', 'crm.calls', 'all'),
  ('admin', 'crm.contacts', 'all'),
  ('admin', 'crm.pipeline', 'all'),
  ('admin', 'ideas.manage', 'all'),
  ('admin', 'library.manage', 'all'),
  ('admin', 'onboarding.manage', 'all'),
  ('admin', 'org.company', 'all'),
  ('admin', 'org.operations', 'all'),
  ('admin', 'org.people', 'all'),
  ('admin', 'retreats.events', 'all'),
  ('admin', 'retreats.manage', 'all'),
  ('admin', 'surface.admin', 'all'),
  ('admin', 'team.company-manage', 'all'),
  ('admin', 'team.reviews', 'all'),
  ('admin', 'time-off.manage', 'all'),
  ('client-user', 'surface.portal', 'all'),
  ('coach', 'coaching.roster', 'team'),
  ('contractor', 'coaching.mine', 'own'),
  ('contractor', 'coaching.roster', 'own'),
  ('contractor', 'coaching.sessions', 'all'),
  ('contractor', 'onboarding.mine', 'own'),
  ('contractor', 'surface.team', 'all'),
  ('contractor', 'team.benefits', 'all'),
  ('contractor', 'team.clients', 'clients'),
  ('contractor', 'team.company', 'all'),
  ('contractor', 'team.directory', 'all'),
  ('contractor', 'team.ideas', 'all'),
  ('contractor', 'team.interviews', 'own'),
  ('contractor', 'team.performance', 'own'),
  ('contractor', 'team.vendors', 'all'),
  ('contractor', 'time-off.approve', 'own'),
  ('contractor', 'time-off.mine', 'own'),
  ('hiring-manager', 'team.hiring', 'all'),
  ('manager', 'team.performance', 'team'),
  ('manager', 'time-off.approve', 'team'),
  ('revenue', 'campaigns.marketing', 'all'),
  ('revenue', 'company-os.commerce', 'all'),
  ('revenue', 'crm.billing', 'all'),
  ('revenue', 'crm.calls', 'all'),
  ('revenue', 'crm.pipeline', 'all'),
  ('revenue', 'retreats.events', 'all'),
  ('super-admin', 'access.manage', 'all'),
  ('super-admin', 'company-os.agents', 'all'),
  ('super-admin', 'hiring.ats', 'all'),
  ('team-member', 'coaching.mine', 'own'),
  ('team-member', 'coaching.roster', 'own'),
  ('team-member', 'coaching.sessions', 'all'),
  ('team-member', 'onboarding.mine', 'own'),
  ('team-member', 'surface.team', 'all'),
  ('team-member', 'team.benefits', 'all'),
  ('team-member', 'team.clients', 'clients'),
  ('team-member', 'team.company', 'all'),
  ('team-member', 'team.directory', 'all'),
  ('team-member', 'team.ideas', 'all'),
  ('team-member', 'team.interviews', 'own'),
  ('team-member', 'team.performance', 'own'),
  ('team-member', 'team.vendors', 'all'),
  ('team-member', 'time-off.approve', 'own'),
  ('team-member', 'time-off.mine', 'own')
) as v(role_key, permission, scope)
join company_os.access_roles r on r.key = v.role_key and r.archived_at is null
where not exists (
  select 1 from company_os.access_role_permissions p
  where p.role_id = r.id and p.permission = v.permission
);


-- 20261007000000 (AC.8, AC.12, AC.16, AC.19): the roles and holder rows the code merged since the default holders (expand).
-- 1. The new roles.
insert into company_os.access_roles (key, name, description, kind) values
  ('approver',               'Approver',               'Has a request waiting on their decision.', 'implied'),
  ('client-team',            'Client team',            'Assigned to at least one client, and sees those clients'' work.', 'implied'),
  ('company',                'Company',                'Opens the company pages a contractor does not get by default: who''s who, the goals and strategy, the ideas feed, the vendors and the group coaching.', 'granted'),
  ('reimbursement-approver', 'Reimbursement approver', 'Decides the team''s reimbursement claims: approves or declines what people submit.', 'granted'),
  ('reimbursement-payer',    'Reimbursement payer',    'Pays approved reimbursement claims and records that they were paid.', 'granted')
on conflict (key) do nothing;

-- 2. The pairs the declarations add.
insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, v.permission, v.scope
from (values
  ('admin',          'access.explain',     'all'),
  ('approver',       'time-off.approve',   'own'),
  ('client-team',    'team.clients',       'clients'),
  ('coach',          'access.explain',     'all'),
  ('company',        'coaching.sessions',  'all'),
  ('company',        'team.company',       'all'),
  ('company',        'team.directory',     'all'),
  ('company',        'team.ideas',         'all'),
  ('company',        'team.vendors',       'all'),
  ('contractor',     'team.culture',       'all'),
  ('finance',        'access.explain',     'all'),
  ('hiring-manager', 'access.explain',     'all'),
  ('manager',        'access.explain',     'all'),
  ('manager',        'coaching.roster',    'team'),
  ('manager',        'onboarding.reports', 'team'),
  ('revenue',        'access.explain',     'all'),
  ('super-admin',    'crm.agreements',     'all'),
  ('team-member',    'access.explain',     'all'),
  ('team-member',    'team.culture',       'all')
) as v(role_key, permission, scope)
join company_os.access_roles r on r.key = v.role_key and r.archived_at is null
where not exists (
  select 1 from company_os.access_role_permissions p
  where p.role_id = r.id and p.permission = v.permission
);

-- 20261007010000 (AC.20): folds company_os.admins into Admin and Super Admin grants; a fork has no admins rows,
-- so it adds nothing to this dump.

-- 20261007020000 (AC.8, AC.19): the contract half; revokes the pairs the declarations no longer name.
-- The pairs the declarations no longer name: revoked, never deleted.
update company_os.access_role_permissions p
set revoked_at = now()
from company_os.access_roles r, (values
  ('contractor',  'coaching.roster'),
  ('contractor',  'coaching.sessions'),
  ('contractor',  'team.benefits'),
  ('contractor',  'team.clients'),
  ('contractor',  'team.company'),
  ('contractor',  'team.directory'),
  ('contractor',  'team.ideas'),
  ('contractor',  'team.vendors'),
  ('contractor',  'time-off.approve'),
  ('team-member', 'coaching.roster'),
  ('team-member', 'team.clients'),
  ('team-member', 'time-off.approve')
) as v(role_key, permission)
where r.key = v.role_key and p.role_id = r.id and p.permission = v.permission and p.revoked_at is null
  and not exists (
    select 1 from company_os.access_role_permissions earlier
    where earlier.role_id = p.role_id and earlier.permission = p.permission and earlier.revoked_at is not null
  );

-- 20261007120000 (RB schema, hand-applied): the Reimbursements tables, their
-- retention guards and approvals.approver_permission. Reimbursements is portable.
-- The revoke from the chat agents' roles is left out, as those roles are Edge8's
-- own; the reimbursement-receipts bucket is in 00-prereqs.sql.
alter table company_os.approvals add column if not exists approver_permission text;

-- 1. Payment runs and payments first, because claims and files point at them.
create table if not exists company_os.reimbursement_payment_runs (
  id            uuid primary key default gen_random_uuid(),
  run_date      date not null unique,
  cutoff_at     timestamptz not null,
  built_at      timestamptz not null default now(),
  status        text not null default 'open' check (status in ('open', 'paid')),
  claims_count  integer not null default 0 check (claims_count >= 0),
  people_count  integer not null default 0 check (people_count >= 0),
  total_vnd     bigint not null default 0 check (total_vnd >= 0),
  notified_at   timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists company_os.reimbursement_payments (
  id                    uuid primary key default gen_random_uuid(),
  run_id                uuid not null references company_os.reimbursement_payment_runs (id) on delete restrict,
  person_id             uuid not null references company_os.people (id) on delete restrict,
  amount_vnd            bigint not null check (amount_vnd >= 0),
  paid_vnd              bigint check (paid_vnd is null or paid_vnd >= 0),
  status                text not null default 'to_pay' check (status in ('to_pay', 'paid')),
  paid_at               timestamptz,
  paid_by               uuid references company_os.people (id) on delete set null,
  bank_receipt_file_id  uuid,
  bank_name_snapshot    text,
  bank_account_last4    text check (bank_account_last4 is null or bank_account_last4 ~ '^[0-9]{1,4}$'),
  created_at            timestamptz not null default now(),
  unique (run_id, person_id),
  -- Paid means a receipt, an amount sent and a time; to_pay means none of them.
  constraint reimbursement_payments_paid_shape check (
    (status = 'paid' and paid_at is not null and paid_vnd is not null and bank_receipt_file_id is not null)
    or (status = 'to_pay' and paid_at is null)
  )
);

-- 2. Claims.
create table if not exists company_os.reimbursement_claims (
  id                  uuid primary key default gen_random_uuid(),
  person_id           uuid not null references company_os.people (id) on delete restrict,
  team_member_id      uuid not null references company_os.team_members (id) on delete restrict,
  title               text not null check (length(trim(title)) > 0),
  trip_event_id       uuid references company_os.events (id) on delete set null,
  status              text not null default 'draft'
                        check (status in ('draft', 'submitted', 'checked', 'sent_back', 'rejected', 'approved', 'in_run', 'paid')),
  submitted_at        timestamptz,
  checked_at          timestamptz,
  checked_by          uuid references company_os.people (id) on delete set null,
  approved_at         timestamptz,
  approved_by         uuid references company_os.people (id) on delete set null,
  approved_total_vnd  bigint check (approved_total_vnd is null or approved_total_vnd >= 0),
  in_run_at           timestamptz,
  paid_at             timestamptz,
  payment_run_id      uuid references company_os.reimbursement_payment_runs (id) on delete restrict,
  payment_id          uuid references company_os.reimbursement_payments (id) on delete restrict,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- My claims.
create index if not exists reimbursement_claims_person_idx
  on company_os.reimbursement_claims (person_id, created_at desc);
-- The queues and the run's cut-off read.
create index if not exists reimbursement_claims_status_idx
  on company_os.reimbursement_claims (status, approved_at);
-- A trip's cost.
create index if not exists reimbursement_claims_trip_idx
  on company_os.reimbursement_claims (trip_event_id) where trip_event_id is not null;
create index if not exists reimbursement_claims_run_idx
  on company_os.reimbursement_claims (payment_run_id) where payment_run_id is not null;

-- 3. Claim items.
create table if not exists company_os.reimbursement_claim_items (
  id                    uuid primary key default gen_random_uuid(),
  claim_id              uuid not null references company_os.reimbursement_claims (id) on delete cascade,
  position              integer not null default 0,
  description           text,
  seller                text,
  bought_on             date,
  category              text not null
                          check (category in ('transport', 'flights', 'accommodation', 'meals_travel', 'client_entertainment',
                                              'software', 'equipment', 'training_events', 'other')),
  bought_in_vietnam     boolean not null,
  amount_cents          bigint not null check (amount_cents >= 0),
  currency              text not null check (currency ~ '^[a-z]{3}$'),
  amount_vnd            bigint check (amount_vnd is null or amount_vnd >= 0),
  fx_rate               numeric check (fx_rate is null or fx_rate > 0),
  fx_source             text not null default 'none' check (fx_source in ('none', 'techcombank', 'vietcombank', 'manual', 'card')),
  fx_as_of              date,
  charged_vnd           bigint check (charged_vnd is null or charged_vnd >= 0),
  lost_receipt_note     text,
  ai_reading            jsonb,
  ai_flags              text[] not null default '{}'::text[]
                          check (ai_flags <@ array['buyer_not_organisation', 'buyer_tax_code_differs', 'unreadable',
                                                   'possible_duplicate', 'older_than_90_days']::text[]),
  duplicate_of_item_id  uuid references company_os.reimbursement_claim_items (id) on delete set null,
  declined_at           timestamptz,
  declined_by           uuid references company_os.people (id) on delete set null,
  decline_reason        text,
  rebill                boolean not null default false,
  rebill_company_id     uuid references company_os.companies (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- "Other" needs words; a lost receipt is an excuse only abroad; a declined line carries its reason.
  constraint reimbursement_claim_items_other_described check (category <> 'other' or length(trim(coalesce(description, ''))) > 0),
  constraint reimbursement_claim_items_lost_receipt_abroad check (lost_receipt_note is null or not bought_in_vietnam),
  constraint reimbursement_claim_items_declined_shape check ((declined_at is null) = (decline_reason is null))
);
create index if not exists reimbursement_claim_items_claim_idx
  on company_os.reimbursement_claim_items (claim_id, position);

-- 4. Files.
create table if not exists company_os.reimbursement_files (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('receipt', 'red_invoice', 'bank_receipt', 'bank_deduction')),
  claim_item_id  uuid references company_os.reimbursement_claim_items (id) on delete cascade,
  payment_id     uuid references company_os.reimbursement_payments (id) on delete restrict,
  storage_path   text not null unique,
  filename       text not null,
  mime_type      text,
  size_bytes     bigint check (size_bytes is null or size_bytes >= 0),
  sha256         text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  page_count     integer check (page_count is null or page_count > 0),
  uploaded_by    uuid references company_os.people (id) on delete set null,
  confirmed_at   timestamptz,
  created_at     timestamptz not null default now(),
  -- A bank receipt hangs off a payment; a receipt or red invoice off a claim item. Never both.
  constraint reimbursement_files_owner_shape check (
    (kind = 'bank_receipt' and payment_id is not null and claim_item_id is null)
    or (kind <> 'bank_receipt' and claim_item_id is not null and payment_id is null)
  )
);
create index if not exists reimbursement_files_item_idx
  on company_os.reimbursement_files (claim_item_id) where claim_item_id is not null;
create index if not exists reimbursement_files_payment_idx
  on company_os.reimbursement_files (payment_id) where payment_id is not null;
-- Duplicate detection.
create index if not exists reimbursement_files_sha_idx
  on company_os.reimbursement_files (sha256) where sha256 is not null;
-- The sweep's read: uploads that never finished.
create index if not exists reimbursement_files_unconfirmed_idx
  on company_os.reimbursement_files (created_at) where confirmed_at is null;

-- The payment's receipt, now that files exist.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reimbursement_payments_bank_receipt_fkey'
                 and conrelid = 'company_os.reimbursement_payments'::regclass) then
    alter table company_os.reimbursement_payments
      add constraint reimbursement_payments_bank_receipt_fkey
      foreign key (bank_receipt_file_id) references company_os.reimbursement_files (id) on delete restrict;
  end if;
end $$;

-- 5. Claim history.
create table if not exists company_os.reimbursement_claim_events (
  id                 uuid primary key default gen_random_uuid(),
  claim_id           uuid not null references company_os.reimbursement_claims (id) on delete cascade,
  from_status        text check (from_status is null or from_status in ('draft', 'submitted', 'checked', 'sent_back', 'rejected', 'approved', 'in_run', 'paid')),
  to_status          text not null check (to_status in ('draft', 'submitted', 'checked', 'sent_back', 'rejected', 'approved', 'in_run', 'paid')),
  -- Restrict, not set null: set null is an UPDATE, which the append-only guard refuses,
  -- so deleting a person who acted on a claim is refused by the key instead (db-review).
  actor_person_id    uuid references company_os.people (id) on delete restrict,
  reason             text,
  declined_item_ids  uuid[] not null default '{}'::uuid[],
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists reimbursement_claim_events_claim_idx
  on company_os.reimbursement_claim_events (claim_id, created_at);

-- 6. VND rates.
create table if not exists company_os.reimbursement_fx_rates (
  rate_date   date not null,
  currency    text not null check (currency ~ '^[a-z]{3}$'),
  source      text not null check (source in ('techcombank', 'vietcombank', 'manual')),
  rate_vnd    numeric not null check (rate_vnd > 0),
  fetched_at  timestamptz not null default now(),
  entered_by  uuid references company_os.people (id) on delete set null,
  primary key (rate_date, currency, source)
);

-- 7. Lockdown, as every company_os table the app writes.
do $$
declare
  t text;
begin
  foreach t in array array['reimbursement_payment_runs', 'reimbursement_payments', 'reimbursement_claims',
                           'reimbursement_claim_items', 'reimbursement_files', 'reimbursement_claim_events',
                           'reimbursement_fx_rates'] loop
    execute format('alter table company_os.%I enable row level security', t);
    execute format('grant select, insert, update, delete on company_os.%I to service_role', t);
    execute format('revoke all on company_os.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- 8. Guards. One function per table, named for it, reading only its own row and
-- (for items and files) the parent claim. The 2026-09-26 incident was one
-- function shared by two tables; none is shared here.

-- A claim may be deleted only as a draft that was never submitted.
create or replace function company_os.reimbursement_claims_guard_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' or old.submitted_at is not null then
    raise exception 'A claim that was ever submitted is kept (10-year retention); claim % is %.', old.id, old.status
      using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists reimbursement_claims_guard_delete on company_os.reimbursement_claims;
create trigger reimbursement_claims_guard_delete
  before delete on company_os.reimbursement_claims
  for each row execute function company_os.reimbursement_claims_guard_delete();

-- An item may be deleted only while its claim is editable (draft or sent back),
-- or when its claim is already gone (the cascade of a deletable draft).
create or replace function company_os.reimbursement_claim_items_guard_delete()
returns trigger language plpgsql set search_path = '' as $$
declare
  s text;
begin
  select c.status into s from company_os.reimbursement_claims c where c.id = old.claim_id;
  if s is not null and s not in ('draft', 'sent_back') then
    raise exception 'Items of a % claim are kept (10-year retention).', s using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists reimbursement_claim_items_guard_delete on company_os.reimbursement_claim_items;
create trigger reimbursement_claim_items_guard_delete
  before delete on company_os.reimbursement_claim_items
  for each row execute function company_os.reimbursement_claim_items_guard_delete();

-- A checked claim's receipts are frozen (20261010030000, A.34): once a claim
-- leaves draft, submitted and sent back, its receipts cannot be added to, and
-- an update may change only the re-read columns, updated_at, and a reference
-- to a person or company that was deleted. Raises P0R01.
create or replace function company_os.reimbursement_claim_items_freeze()
returns trigger language plpgsql set search_path = '' as $$
declare
  open_statuses constant text[] := array['draft', 'submitted', 'sent_back'];
  rereadable constant text[] := array['ai_reading', 'ai_flags', 'duplicate_of_item_id', 'updated_at'];
  nulled_by_delete constant text[] := array['declined_by', 'removed_by', 'rebill_company_id'];
  st text;
  old_st text;
  before_row jsonb;
  after_row jsonb;
  k text;
begin
  select c.status into st from company_os.reimbursement_claims c where c.id = new.claim_id for share;

  if tg_op = 'UPDATE' and old.claim_id is distinct from new.claim_id then
    select c.status into old_st from company_os.reimbursement_claims c where c.id = old.claim_id for share;
    if old_st is not null and not (old_st = any (open_statuses)) then
      raise exception 'Receipt % is on claim % (%), and a checked claim''s receipts are frozen.', old.id, old.claim_id, old_st
        using errcode = 'P0R01';
    end if;
  end if;

  -- A missing claim is the foreign key's to refuse, not this trigger's.
  if st is null or st = any (open_statuses) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Claim % is %: a checked claim''s receipts are frozen, so none can be added.', new.claim_id, st
      using errcode = 'P0R01';
  end if;

  before_row := to_jsonb(old) - rereadable;
  after_row := to_jsonb(new) - rereadable;
  for k in select jsonb_object_keys(after_row) loop
    if (after_row -> k) is distinct from (before_row -> k) then
      -- The ON DELETE SET NULL of a deleted person or company: the row it named
      -- is already gone when the cascade's update reaches this trigger.
      if k = any (nulled_by_delete) and (after_row -> k) = 'null'::jsonb and (
        (k = 'declined_by' and not exists (select 1 from company_os.people p where p.id = old.declined_by))
        or (k = 'removed_by' and not exists (select 1 from company_os.people p where p.id = old.removed_by))
        or (k = 'rebill_company_id' and not exists (select 1 from company_os.companies c where c.id = old.rebill_company_id))
      ) then
        continue;
      end if;
      raise exception 'Claim % is %: a checked claim''s receipts are frozen (% cannot change).', new.claim_id, st, k
        using errcode = 'P0R01';
    end if;
  end loop;
  return new;
end;
$$;

comment on function company_os.reimbursement_claim_items_freeze() is
  'A.34: once a claim leaves draft, submitted and sent back, its receipts cannot be added to, and an update may change only the re-read columns, updated_at, and a reference to a person or company that was deleted (the ON DELETE SET NULL). Raises P0R01.';

drop trigger if exists reimbursement_claim_items_freeze on company_os.reimbursement_claim_items;
create trigger reimbursement_claim_items_freeze
  before insert or update on company_os.reimbursement_claim_items
  for each row execute function company_os.reimbursement_claim_items_freeze();

-- A bank receipt is never deleted. A receipt or red invoice only while its
-- claim is editable, or when its item or claim is already gone (a cascade).
create or replace function company_os.reimbursement_files_guard_delete()
returns trigger language plpgsql set search_path = '' as $$
declare
  s text;
begin
  if old.kind = 'bank_receipt' then
    raise exception 'A bank receipt is kept (10-year retention).' using errcode = 'P0001';
  end if;
  select c.status into s
  from company_os.reimbursement_claim_items i
  join company_os.reimbursement_claims c on c.id = i.claim_id
  where i.id = old.claim_item_id;
  if s is not null and s not in ('draft', 'sent_back') then
    raise exception 'Documents of a % claim are kept (10-year retention).', s using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists reimbursement_files_guard_delete on company_os.reimbursement_files;
create trigger reimbursement_files_guard_delete
  before delete on company_os.reimbursement_files
  for each row execute function company_os.reimbursement_files_guard_delete();

-- History is append-only: no update ever, and a delete only when its claim is
-- already gone (the cascade of a deletable draft).
create or replace function company_os.reimbursement_claim_events_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Claim history is append-only.' using errcode = 'P0001';
  end if;
  if exists (select 1 from company_os.reimbursement_claims c where c.id = old.claim_id) then
    raise exception 'Claim history is append-only.' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists reimbursement_claim_events_guard on company_os.reimbursement_claim_events;
create trigger reimbursement_claim_events_guard
  before update or delete on company_os.reimbursement_claim_events
  for each row execute function company_os.reimbursement_claim_events_guard();

-- The house updated_at stamp.
drop trigger if exists reimbursement_claims_updated_at on company_os.reimbursement_claims;
create trigger reimbursement_claims_updated_at
  before update on company_os.reimbursement_claims
  for each row execute function company_os.handle_updated_at();
drop trigger if exists reimbursement_claim_items_updated_at on company_os.reimbursement_claim_items;
create trigger reimbursement_claim_items_updated_at
  before update on company_os.reimbursement_claim_items
  for each row execute function company_os.handle_updated_at();

-- 20261007200000 (reimbursements access rows, part 1, hand-applied).
-- 1. The Employer role, empty.
insert into company_os.access_roles (key, name, description, kind) values
  ('employer', 'Employer', 'The employer: may check and approve any claim, their own included.', 'granted')
on conflict (key) do nothing;

-- 2. Submit claims and see your own.
insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, v.permission, v.scope
from (values
  ('contractor',  'reimbursements.mine', 'own'),
  ('team-member', 'reimbursements.mine', 'own')
) as v(role_key, permission, scope)
join company_os.access_roles r on r.key = v.role_key and r.archived_at is null
where not exists (
  select 1 from company_os.access_role_permissions p
  where p.role_id = r.id and p.permission = v.permission
);

-- 20261007230000 (ID.2.5, hand-applied): idea reactions and builds, and three
-- inbox kinds. Ideas is portable; the revoke from the chat agents' roles is left out.
-- 1. Reactions.
create table if not exists company_os.idea_reactions (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references company_os.ideas (id) on delete restrict,
  person_id   uuid not null references company_os.people (id) on delete cascade,
  kind        text not null check (kind in ('admire', 'me_too', 'skip', 'held', 'trying', 'unstuck')),
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references company_os.people (id) on delete set null
);
-- One live reaction of each kind per person per idea; archived ones stay as history.
create unique index if not exists idea_reactions_live_key
  on company_os.idea_reactions (idea_id, person_id, kind) where archived_at is null;
-- What I have answered (the deck), and what came back on my ideas.
create index if not exists idea_reactions_person_idx
  on company_os.idea_reactions (person_id, created_at desc);
create index if not exists idea_reactions_idea_idx
  on company_os.idea_reactions (idea_id) where archived_at is null;

-- 2. Builds.
create table if not exists company_os.idea_builds (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references company_os.ideas (id) on delete restrict,
  person_id   uuid not null references company_os.people (id) on delete cascade,
  body        text not null check (length(btrim(body)) between 1 and 500),
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references company_os.people (id) on delete set null
);
create index if not exists idea_builds_idea_idx
  on company_os.idea_builds (idea_id, created_at) where archived_at is null;

-- 3. Lockdown: service role only.
do $$
declare
  t text;
begin
  foreach t in array array['idea_reactions', 'idea_builds'] loop
    execute format('alter table company_os.%I enable row level security', t);
    execute format('grant select, insert, update, delete on company_os.%I to service_role', t);
    execute format('revoke all on company_os.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- 4. Three inbox kinds, the eight that exist kept as they are.
alter table company_os.notifications drop constraint if exists notifications_kind_check;
alter table company_os.notifications add constraint notifications_kind_check check (kind in (
  'card.completed', 'card.set_aside', 'subtask.done', 'leave.approved', 'leave.withdrawn',
  'hire.made', 'deal.won', 'invoice.paid',
  'idea.reacted', 'idea.built', 'idea.picked_up'
));

-- 20261008010000 (reimbursements kinds and access rows part 2, hand-applied).
-- 1. The inbox kinds.
alter table company_os.notifications drop constraint if exists notifications_kind_check;
alter table company_os.notifications add constraint notifications_kind_check check (kind in (
  'card.completed', 'card.set_aside', 'subtask.done', 'leave.approved', 'leave.withdrawn',
  'hire.made', 'deal.won', 'invoice.paid',
  'idea.reacted', 'idea.built', 'idea.picked_up',
  'claim.decided', 'claim.paid'
));
alter table company_os.notification_prefs drop constraint if exists notification_prefs_kind_check;
alter table company_os.notification_prefs add constraint notification_prefs_kind_check check (kind in (
  'card.completed', 'card.set_aside', 'subtask.done', 'leave.approved', 'leave.withdrawn',
  'hire.made', 'deal.won', 'invoice.paid',
  'idea.reacted', 'idea.built', 'idea.picked_up',
  'claim.decided', 'claim.paid'
));

-- 2. The access rows.
insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, v.permission, v.scope
from (values
  ('admin',                  'reimbursements.view',       'all'),
  ('employer',               'reimbursements.check',      'all'),
  ('employer',               'reimbursements.decide-own', 'all'),
  ('finance',                'reimbursements.check',      'all'),
  ('reimbursement-approver', 'reimbursements.approve',    'all'),
  ('reimbursement-payer',    'reimbursements.pay',        'all')
) as v(role_key, permission, scope)
join company_os.access_roles r on r.key = v.role_key and r.archived_at is null
where not exists (
  select 1 from company_os.access_role_permissions p
  where p.role_id = r.id and p.permission = v.permission
);

-- 20261008090000 (reimbursements retention and audit read, hand-applied).
-- 1a. The markers.
alter table company_os.reimbursement_claim_items
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references company_os.people (id) on delete set null,
  add column if not exists remove_reason text;
alter table company_os.reimbursement_files
  add column if not exists replaced_at timestamptz,
  add column if not exists replaced_by uuid references company_os.people (id) on delete set null;

-- 1b. An item may be deleted only while its claim is a never-submitted draft,
-- or when its claim is already gone (the cascade of deleting such a draft).
create or replace function company_os.reimbursement_claim_items_guard_delete()
returns trigger language plpgsql set search_path = '' as $$
declare
  s text;
  sub timestamptz;
begin
  select c.status, c.submitted_at into s, sub from company_os.reimbursement_claims c where c.id = old.claim_id;
  if s is not null and (s <> 'draft' or sub is not null) then
    raise exception 'Items of a claim that was ever submitted are kept (10-year retention); mark the item removed instead.' using errcode = 'P0001';
  end if;
  return old;
end $$;

-- 1c. A bank receipt is never deleted. A receipt or red invoice only while its
-- claim is a never-submitted draft, or when its item or claim is already gone.
create or replace function company_os.reimbursement_files_guard_delete()
returns trigger language plpgsql set search_path = '' as $$
declare
  s text;
  sub timestamptz;
begin
  if old.kind = 'bank_receipt' then
    raise exception 'A bank receipt is kept (10-year retention).' using errcode = 'P0001';
  end if;
  -- An upload never confirmed was never a document of the claim: it is never
  -- shown, and the sweep and an abandoned upload must be able to remove its row.
  if old.confirmed_at is null then
    return old;
  end if;
  select c.status, c.submitted_at into s, sub
  from company_os.reimbursement_claim_items i
  join company_os.reimbursement_claims c on c.id = i.claim_id
  where i.id = old.claim_item_id;
  if s is not null and (s <> 'draft' or sub is not null) then
    raise exception 'Documents of a claim that was ever submitted are kept (10-year retention); mark it replaced instead.' using errcode = 'P0001';
  end if;
  return old;
end $$;

-- 2. A read is an audit operation.
alter table company_os.audit_log drop constraint if exists audit_log_operation_check;
alter table company_os.audit_log add constraint audit_log_operation_check check (operation in (
  'insert', 'update', 'delete', 'archive', 'restore', 'bulk_update', 'bulk_archive', 'bulk_delete', 'read'
));

-- 20261008120000 (legal entity registration details, hand-applied).
-- 1. The registration details.
alter table company_os.legal_entities
  add column if not exists registration_number text,
  add column if not exists registered_address text,
  add column if not exists legal_representative_person_id uuid references company_os.people (id) on delete set null,
  add column if not exists jurisdiction text,
  add column if not exists incorporated_on date;

-- 2. Who may change what.
insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, v.permission, 'all'
from (values
  ('super-admin', 'org.legal-entities'),
  ('super-admin', 'org.legal-registration'),
  ('finance',     'org.legal-registration')
) as v(role_key, permission)
join company_os.access_roles r on r.key = v.role_key and r.archived_at is null
where not exists (
  select 1 from company_os.access_role_permissions p
  where p.role_id = r.id and p.permission = v.permission
);

-- 20261008190000 (ID.2.13: inbox kind idea.shipped, hand-applied).
alter table company_os.notifications drop constraint if exists notifications_kind_check;
alter table company_os.notifications add constraint notifications_kind_check check (kind in (
  'card.completed', 'card.set_aside', 'subtask.done', 'leave.approved', 'leave.withdrawn',
  'hire.made', 'deal.won', 'invoice.paid',
  'idea.reacted', 'idea.built', 'idea.picked_up',
  'claim.decided', 'claim.paid',
  'idea.shipped'
));
alter table company_os.notification_prefs drop constraint if exists notification_prefs_kind_check;
alter table company_os.notification_prefs add constraint notification_prefs_kind_check check (kind in (
  'card.completed', 'card.set_aside', 'subtask.done', 'leave.approved', 'leave.withdrawn',
  'hire.made', 'deal.won', 'invoice.paid',
  'idea.reacted', 'idea.built', 'idea.picked_up',
  'claim.decided', 'claim.paid',
  'idea.shipped'
));

-- 20261008210000 (reimbursements: ai_flags may say not_a_red_invoice, hand-applied).
alter table company_os.reimbursement_claim_items drop constraint if exists reimbursement_claim_items_ai_flags_check;
alter table company_os.reimbursement_claim_items add constraint reimbursement_claim_items_ai_flags_check check (ai_flags <@ array[
  'buyer_not_organisation', 'buyer_tax_code_differs', 'unreadable', 'possible_duplicate', 'older_than_90_days',
  'not_a_red_invoice'
]::text[]);

-- 20261009120000 (Y.7, hand-applied): company_os.routine_config, the routine
-- kill switch withRoutineRun reads on every tick. A kernel table, and the kernel
-- ships to the fork. The revoke from the chat agents' roles is left out, as
-- those roles are Edge8's own.
create table if not exists company_os.routine_config (
  routine_id    text primary key,
  mode          text not null default 'live' check (mode in ('live', 'paused')),
  paused_reason text,
  updated_by    uuid references company_os.people (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint routine_config_paused_says_why check (mode <> 'paused' or length(btrim(coalesce(paused_reason, ''))) > 0)
);
alter table company_os.routine_config enable row level security;
grant select, insert, update, delete on company_os.routine_config to service_role;
comment on table company_os.routine_config is 'One row is: one scheduled routine''s switch — live or paused, and why it was paused; a routine with no row is live. [other · System config & plumbing | tier 3 support | active]';

-- 20261009130000 (Y.36) captures set_amount_usd_cents, normalize_meeting_type,
-- meetings_normalize_type_tg and their four triggers into a migration; this dump
-- already carried all of them, so nothing is applied here for it.

-- 20261009140000 (Y.86, hand-applied): company_os.event_deliveries, one row per
-- subscriber run of an event. A kernel table: the kernel's event bus writes it,
-- and the kernel ships to the fork. The revoke from the chat agents' roles is
-- left out, as those roles are Edge8's own.
create table if not exists company_os.event_deliveries (
  id            uuid primary key default gen_random_uuid(),
  event_name    text not null,
  event_id      uuid not null,
  subscriber    text not null,
  ok            boolean not null,
  error         text,
  duration_ms   integer,
  delivered_at  timestamptz not null default now()
);
create index if not exists event_deliveries_delivered_idx on company_os.event_deliveries (delivered_at);
create index if not exists event_deliveries_event_idx on company_os.event_deliveries (event_id);
alter table company_os.event_deliveries enable row level security;
grant select, insert on company_os.event_deliveries to service_role;
comment on table company_os.event_deliveries is 'One row is: one subscriber''s run of one published event — which event, which entity, whether it succeeded and why not; never the payload. [other · Logs, audit & telemetry | tier 3 support | active]';

-- 20261009150000 (Y.41) captures the two unique indexes on meetings
-- (source, external_id) into a migration; this dump already carried both, so
-- nothing is applied here for it.

-- 20261009160000 (Z.1): company_os.automation_effects and claim_effect, added to
-- this dump by hand. A kernel table: the kernel's effect ledger writes it, and
-- the kernel ships to the fork. The revoke from the chat agents' roles is left
-- out, as those roles are Edge8's own.
create table if not exists company_os.automation_effects (
  id           uuid primary key default gen_random_uuid(),
  key          text not null,
  routine_id   text not null,
  run_id       uuid references company_os.routine_runs (id) on delete set null,
  kind         text not null check (kind in ('lark', 'publish', 'webhook')),
  status       text not null check (status in ('claimed', 'done', 'released', 'unknown')),
  attempt      integer not null default 1,
  claimed_at   timestamptz not null default now(),
  done_at      timestamptz,
  provider_ref text,
  detail       jsonb
);

create unique index if not exists automation_effects_key on company_os.automation_effects (key);
create index if not exists automation_effects_run_idx on company_os.automation_effects (run_id);
create index if not exists automation_effects_claimed_idx on company_os.automation_effects (claimed_at) where status = 'claimed';

alter table company_os.automation_effects enable row level security;

grant select, insert, update on company_os.automation_effects to service_role;

-- The claim, called with .rpc('claim_effect', ...) for the same reason as
-- claim_tick: an insert that does nothing on conflict cannot say through
-- PostgREST whether it took the key. A new key is claimed; a released key is
-- claimed again with the attempt counted; a claimed, done or unknown key
-- returns no row, which the caller reads as "do not act".
create or replace function company_os.claim_effect(p_key text, p_routine text, p_run uuid, p_kind text)
returns table (id uuid, attempt integer)
language sql
security definer
set search_path = ''
as $$
  insert into company_os.automation_effects (key, routine_id, run_id, kind, status)
  values (p_key, p_routine, p_run, p_kind, 'claimed')
  on conflict (key) do update
    set status = 'claimed',
        attempt = company_os.automation_effects.attempt + 1,
        claimed_at = now(),
        run_id = excluded.run_id,
        routine_id = excluded.routine_id
    where company_os.automation_effects.status = 'released'
  returning company_os.automation_effects.id, company_os.automation_effects.attempt;
$$;

revoke all on function company_os.claim_effect(text, text, uuid, text) from public;
grant execute on function company_os.claim_effect(text, text, uuid, text) to service_role;

-- 20261009180000 (Z.17, hand-applied): shadow mode for routines. routine_config
-- may say 'shadow', and automation_effects records what a shadow run would have
-- done (status 'shadow', key 'shadow:<key>', a required summary). Both are
-- kernel tables, and the kernel ships to the fork.
alter table company_os.routine_config drop constraint if exists routine_config_mode_check;
alter table company_os.routine_config add constraint routine_config_mode_check
  check (mode in ('live', 'paused', 'shadow'));
comment on table company_os.routine_config is 'One row is: one scheduled routine''s switch — live, shadow or paused, and why it was paused; a routine with no row is live. [other · System config & plumbing | tier 3 support | active]';

alter table company_os.automation_effects
  add column if not exists summary text;
alter table company_os.automation_effects drop constraint if exists automation_effects_status_check;
alter table company_os.automation_effects add constraint automation_effects_status_check
  check (status in ('claimed', 'done', 'released', 'unknown', 'shadow'));
alter table company_os.automation_effects drop constraint if exists automation_effects_shadow_key;
alter table company_os.automation_effects add constraint automation_effects_shadow_key
  check ((status = 'shadow') = (key like 'shadow:%'));
alter table company_os.automation_effects drop constraint if exists automation_effects_shadow_says_what;
alter table company_os.automation_effects add constraint automation_effects_shadow_says_what
  check (status <> 'shadow' or length(btrim(coalesce(summary, ''))) > 0);
alter table company_os.automation_effects drop constraint if exists automation_effects_summary_length;
alter table company_os.automation_effects add constraint automation_effects_summary_length
  check (summary is null or length(summary) <= 500);

-- 20261009190000 (Z.12, hand-applied): company_os.client_status_reports, one
-- client company's weekly status report per ISO week, and the access rows for
-- its two atoms. client-programs is portable and ships in the minimal
-- deployment. The revoke from the chat agents' roles is left out, as those
-- roles are Edge8's own.
create table if not exists company_os.client_status_reports (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company_os.companies (id),
  week        text not null check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  step        text not null default 'gather' check (step in (
                'gather', 'draft', 'check', 'ask', 'ready', 'release',
                'released', 'rejected', 'superseded', 'stopped')),
  started_at  timestamptz not null default now(),
  facts       jsonb,
  ai_draft    jsonb,
  body_html   text,
  version     text,
  edited_by   uuid references company_os.people (id) on delete set null,
  edited_at   timestamptz,
  error       text,
  released_at timestamptz,
  released_by uuid references company_os.people (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint client_status_reports_company_week_key unique (company_id, week),
  constraint client_status_reports_released_is_whole check (
    (step = 'released') = (released_at is not null)
    and (step <> 'released' or (body_html is not null and version is not null))
  ),
  constraint client_status_reports_stopped_says_why check (
    step <> 'stopped' or length(btrim(coalesce(error, ''))) > 0
  )
);
create index if not exists client_status_reports_due_idx
  on company_os.client_status_reports (step)
  where step in ('gather', 'draft', 'check', 'ask', 'release');
alter table company_os.client_status_reports enable row level security;
grant select, insert, update on company_os.client_status_reports to service_role;
revoke all on company_os.client_status_reports from anon, authenticated;
comment on table company_os.client_status_reports is 'One row is: one client company''s weekly status report for one ISO week — the facts it was drafted from, the page the client would see, where its run is, and whether a person released it to the client''s portal. [transactional · Client delivery & work | tier 3 support | active]';

insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, v.permission, 'all'
from (values
  ('client-programs.status'),
  ('client-programs.status-release')
) as v(permission)
join company_os.access_roles r on r.key = 'admin' and r.archived_at is null
where not exists (
  select 1 from company_os.access_role_permissions p
  where p.role_id = r.id and p.permission = v.permission
);

with seeded as (
  insert into company_os.access_roles (key, name, description, kind)
  values ('client-status-approver', 'Client status approver', 'Reads each client''s weekly status draft and releases it to the client''s portal.', 'granted')
  on conflict (key) do nothing
  returning id
)
insert into company_os.access_role_permissions (role_id, permission, scope)
select seeded.id, v.permission, 'all'
from seeded, (values
  ('client-programs.status'),
  ('client-programs.status-release')
) as v(permission);

-- 20261009220000 (Z.11, hand-applied): company_os.inquiry_triage, the run record
-- of the inquiry-to-lead chain, and company_os.find_or_create_company_by_host,
-- the one way the chain adds a company. crm is portable and ships to the fork.
-- The revoke from the chat agents' roles is left out, as those roles are
-- Edge8's own.
create table if not exists company_os.inquiry_triage (
  inquiry_id             uuid primary key references company_os.inquiries (id) on delete cascade,
  mode                   text not null check (mode in ('live', 'shadow')),
  step                   text not null default 'qualify' check (step in ('qualify', 'file', 'notify', 'done', 'stopped')),
  started_at             timestamptz not null default now(),
  error                  text,
  verdict                text check (verdict in ('sales', 'not_sales', 'spam', 'needs_a_person')),
  not_sales_kind         text check (not_sales_kind in ('job_seeker', 'vendor', 'support', 'partnership', 'other')),
  fit                    smallint check (fit between 0 and 5),
  reasons                text[],
  gpct_suggested         jsonb,
  injection_suspected    boolean not null default false,
  company_match          uuid references company_os.companies (id) on delete set null,
  company_id             uuid references company_os.companies (id) on delete set null,
  company_created        boolean,
  possible_duplicate_ids uuid[],
  customer_deal_id       uuid references company_os.deals (id) on delete set null,
  routed                 text check (routed in ('queued', 'held_spam', 'kept_on_board', 'customer_owner', 'fallback')),
  would_route            text check (would_route in ('queued', 'held_spam', 'kept_on_board', 'customer_owner', 'fallback')),
  prompt_version         text,
  notice                 text check (notice is null or length(notice) <= 500),
  qualified_at           timestamptz,
  filed_at               timestamptz,
  notified_at            timestamptz,
  review                 text check (review in ('accepted', 'corrected')),
  corrected_verdict      text check (corrected_verdict in ('sales', 'not_sales', 'spam', 'needs_a_person')),
  corrected_fit          smallint check (corrected_fit between 0 and 5),
  reviewed_by            uuid references company_os.people (id) on delete set null,
  reviewed_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint inquiry_triage_stopped_says_why check (
    step <> 'stopped' or length(btrim(coalesce(error, ''))) > 0
  ),
  constraint inquiry_triage_review_is_whole check (
    (review is null) = (reviewed_at is null)
    and (coalesce(review = 'corrected', false) or (corrected_verdict is null and corrected_fit is null))
  ),
  constraint inquiry_triage_kind_needs_not_sales check (
    not_sales_kind is null or verdict is not distinct from 'not_sales'
  ),
  constraint inquiry_triage_three_reasons check (
    reasons is null or cardinality(reasons) <= 3
  )
);

-- The driver's due list: only the steps it advances.
create index if not exists inquiry_triage_due_idx
  on company_os.inquiry_triage (step)
  where step in ('qualify', 'file', 'notify');

-- updated_at follows every update, as on companies, so no writer can forget it.
drop trigger if exists set_inquiry_triage_updated_at on company_os.inquiry_triage;
create trigger set_inquiry_triage_updated_at
  before update on company_os.inquiry_triage
  for each row execute function company_os.handle_updated_at();

alter table company_os.inquiry_triage enable row level security;

grant select, insert, update on company_os.inquiry_triage to service_role;
revoke all on company_os.inquiry_triage from anon, authenticated;

-- Part 2: the company finder.

create or replace function company_os.find_or_create_company_by_host(p_host text, p_name text, p_create boolean)
returns table (company_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host text := lower(regexp_replace(regexp_replace(regexp_replace(btrim(coalesce(p_host, '')),
    '^[a-z][a-z0-9+.-]*://', '', 'i'), '[/?#:].*$', ''), '^www\.', '', 'i'));
  v_id uuid;
begin
  -- A plain host name only: labels of letters, digits and hyphens, at least
  -- one dot. Anything else matches nothing and creates nothing.
  if v_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' or length(v_host) > 253 then
    return;
  end if;

  -- Serialises every call for this host until the caller's transaction ends,
  -- so two concurrent calls for one new host create one company.
  perform pg_advisory_xact_lock(hashtext('company:' || v_host));

  select c.id into v_id
  from company_os.companies c
  where c.archived_at is null
    and c.website_url is not null
    and lower(regexp_replace(regexp_replace(regexp_replace(btrim(c.website_url::text),
          '^[a-z][a-z0-9+.-]*://', '', 'i'), '[/?#:].*$', ''), '^www\.', '', 'i')) = v_host
  order by c.created_at, c.id
  limit 1;

  if v_id is not null then
    company_id := v_id;
    created := false;
    return next;
    return;
  end if;

  if not coalesce(p_create, false) then
    return;
  end if;

  insert into company_os.companies (name, website_url, lifecycle_stage, metadata)
  values (
    coalesce(nullif(left(btrim(coalesce(p_name, '')), 200), ''), v_host),
    'https://' || v_host,
    'none',
    jsonb_build_object('created_by', 'inquiry-to-lead')
  )
  returning id into v_id;

  company_id := v_id;
  created := true;
  return next;
end;
$$;

revoke all on function company_os.find_or_create_company_by_host(text, text, boolean) from public;
revoke all on function company_os.find_or_create_company_by_host(text, text, boolean) from anon, authenticated;
grant execute on function company_os.find_or_create_company_by_host(text, text, boolean) to service_role;

comment on function company_os.find_or_create_company_by_host(text, text, boolean) is
  'Z.11: the live company whose website_url host equals p_host (scheme, www. and path ignored), or, when none exists and p_create, a new one named p_name with website_url https://<host>; returns (company_id, created), or no row. Serialised per host by an advisory lock, so concurrent calls create one company. Called only through kernel/identity/writes.ts.';

-- Part 3 and the new table's comments, generated from docs/db/data-dictionary.md
-- via scripts/data-dictionary/generate.mjs.
comment on table company_os.inquiry_triage is 'One row is: one inquiry''s run through the inquiry-to-lead chain — where the run is, what the qualifier model read in the visitor''s message, where the chain filed it, and whether a person corrected the read. [transactional · Pipeline activity | tier 2 stage engine | active]';
comment on column company_os.inquiry_triage.inquiry_id is 'The inquiry this run is for; primary key, so one run per inquiry, and the row goes when the inquiry does.';
comment on column company_os.inquiry_triage.mode is 'How the run was opened, fixed at intake from the chain''s switch. live: the contact route left promotion and the Operations line to the chain. shadow: the route took the path it takes with the chain off, and the chain only records what it would have done. Valid values: [live, shadow]';
comment on column company_os.inquiry_triage.step is 'Where the run is (ADR 0015). qualify, file and notify are advanced by the lead driver; done is finished; stopped carries its error until a person presses Read again. Valid values: [qualify, file, notify, done, stopped]';
comment on column company_os.inquiry_triage.started_at is 'The run''s epoch, part of every step''s tick key and of the fence on every step''s write; reset by Read again, so a restarted run gets fresh ticks and an old step cannot write over it.';
comment on column company_os.inquiry_triage.error is 'Why the last step failed or the run stopped; required when step is stopped, cleared by Read again.';
comment on column company_os.inquiry_triage.verdict is 'The qualifier''s read of the inquiry. sales: someone who may buy; not_sales: a job seeker, vendor, support request or partnership pitch; spam: held off the queue; needs_a_person: not read (the model failed three times, its output was unusable, or the message carried an instruction aimed at the model), so the inquiry took the path it takes with the chain off. Null until the qualify step passes. Valid values: [sales, not_sales, spam, needs_a_person]';
comment on column company_os.inquiry_triage.not_sales_kind is 'For a not_sales verdict, which kind, for the board''s chip; null otherwise. Valid values: [job_seeker, vendor, support, partnership, other]';
comment on column company_os.inquiry_triage.fit is 'The qualifier''s fit from 0 to 5 against the fit the contact page states; shown on the Leads card, never used to order the queue.';
comment on column company_os.inquiry_triage.reasons is 'Up to three short reasons for the verdict and fit, each at most 140 characters, with links, email addresses and phone numbers stripped.';
comment on column company_os.inquiry_triage.gpct_suggested is 'The qualifier''s suggested answers to the six qualification questions (goal, plan, challenge, timeline, budget, authority), drawn only from what the visitor wrote, "Not stated" otherwise; a suggestion until a person presses Use these and Save.';
comment on column company_os.inquiry_triage.injection_suspected is 'True when the visitor''s message carried a deterministic marker of an instruction aimed at a model; the verdict is then forced to needs_a_person.';
comment on column company_os.inquiry_triage.company_match is 'The live company the qualify step matched by email domain or unique exact name, before anything was linked; null when none matched.';
comment on column company_os.inquiry_triage.company_id is 'The company the file step linked the person to (found or created); null when nothing was linked.';
comment on column company_os.inquiry_triage.company_created is 'True when the file step created company_id for this inquiry (find_or_create_company_by_host); null when nothing was linked.';
comment on column company_os.inquiry_triage.possible_duplicate_ids is 'Other people who may be the same person (same name at the same company domain), for the Leads card''s links; never merged automatically.';
comment on column company_os.inquiry_triage.customer_deal_id is 'The open or won deal that made the sender a current client; the line names its owner instead of queueing a lead.';
comment on column company_os.inquiry_triage.routed is 'Where the file step put the inquiry. queued: promoted to the SDR queue; held_spam: status spam, off the queue; kept_on_board: left on the Inquiries board, labelled; customer_owner: a current client, named to the deal owner; fallback: the chain-off path (needs_a_person). Valid values: [queued, held_spam, kept_on_board, customer_owner, fallback]';
comment on column company_os.inquiry_triage.would_route is 'For a shadow run only, where a live run would have filed the inquiry; compared with what a person did. Valid values: [queued, held_spam, kept_on_board, customer_owner, fallback]';
comment on column company_os.inquiry_triage.prompt_version is 'The lead-qualify prompt version the verdict came from.';
comment on column company_os.inquiry_triage.notice is 'The one-line Operations message the notify step posted, or in shadow would have posted; a template with no message body; null for a spam hold, which posts nothing.';
comment on column company_os.inquiry_triage.qualified_at is 'When the qualify step wrote the verdict.';
comment on column company_os.inquiry_triage.filed_at is 'When the file step finished.';
comment on column company_os.inquiry_triage.notified_at is 'When the notify step finished (posted, recorded in shadow, or nothing to post).';
comment on column company_os.inquiry_triage.review is 'A person''s answer to the qualifier''s read. accepted: it was right; corrected: corrected_verdict and corrected_fit say what it should have been. Null until someone answers. Valid values: [accepted, corrected]';
comment on column company_os.inquiry_triage.corrected_verdict is 'The verdict a person says was right; set only with review corrected. Valid values: [sales, not_sales, spam, needs_a_person]';
comment on column company_os.inquiry_triage.corrected_fit is 'The fit from 0 to 5 a person says was right; set only with review corrected.';
comment on column company_os.inquiry_triage.reviewed_by is 'The person who answered review.';
comment on column company_os.inquiry_triage.reviewed_at is 'When review was answered.';
comment on column company_os.inquiry_triage.created_at is 'When the contact route opened the run.';
comment on column company_os.inquiry_triage.updated_at is 'When the row last changed, stamped by the set_inquiry_triage_updated_at trigger (company_os.handle_updated_at), as on companies.';
comment on table company_os.person_qualifications is 'One row is: one person''s sales qualification answers (goal, plan, challenge, timeline, budget, authority) as a person working the SDR queue recorded them. [master · People & org structure | tier 3 support | active]';

-- 20261009210000 (Z.10, hand-applied): company_os.proposal_drafts, one
-- proposal the proposal chain drafted from one sales call, and the Revenue
-- approver role holding crm.proposal-approve. crm is portable and ships in
-- the minimal deployment. The revoke from the chat agents' roles is left
-- out, as those roles are Edge8's own.
create table if not exists company_os.proposal_drafts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company_os.companies (id),
  meeting_id    uuid references company_os.meetings (id) on delete set null,
  deal_id       uuid references company_os.deals (id) on delete set null,
  mode          text not null check (mode in ('shadow', 'live')),
  step          text not null default 'gather' check (step in (
                  'gather', 'extract', 'draft', 'ask', 'ready', 'publish',
                  'record', 'done', 'rejected', 'stopped', 'shadow-done')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  error         text,
  inputs        jsonb,
  screen        jsonb,
  facts         jsonb,
  crm_patch     jsonb,
  crm_applied   jsonb,
  ai_sections   jsonb,
  sections      jsonb,
  amount_cents  bigint,
  currency      text,
  line_items    jsonb,
  slug          text,
  html          text,
  lint          jsonb,
  version       text,
  published_url text,
  published_at  timestamptz,
  requested_by  uuid references company_os.people (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint proposal_drafts_company_meeting_key unique (company_id, meeting_id),
  constraint proposal_drafts_slug_key unique (slug),
  constraint proposal_drafts_stopped_says_why check (
    step <> 'stopped' or length(btrim(coalesce(error, ''))) > 0
  ),
  constraint proposal_drafts_published_is_whole check (
    (published_at is null) = (published_url is null)
    and (published_url is null or (html is not null and version is not null and slug is not null))
  ),
  constraint proposal_drafts_mode_steps check (
    (step <> 'shadow-done' or mode = 'shadow')
    and (step not in ('ask', 'ready', 'publish', 'record', 'done') or mode = 'live')
  ),
  constraint proposal_drafts_amount_shape check (
    (amount_cents is null or amount_cents >= 0)
    and (currency is null or currency ~ '^[a-z]{3}$')
    and (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  )
);
-- The driver's due list: only the steps it advances.
create index if not exists proposal_drafts_due_idx
  on company_os.proposal_drafts (step)
  where step in ('gather', 'extract', 'draft', 'ask', 'publish', 'record');
alter table company_os.proposal_drafts enable row level security;
grant select, insert, update on company_os.proposal_drafts to service_role;
revoke all on company_os.proposal_drafts from anon, authenticated;
comment on table company_os.proposal_drafts is 'One row is: one proposal the proposal chain drafted from one sales call (company and meeting) — the facts it was drafted from, the sections the client would read, where its run is, and whether it was approved and published. [transactional · Revenue documents | tier 3 support | active]';

with seeded as (
  insert into company_os.access_roles (key, name, description, kind)
  values ('revenue-approver', 'Revenue approver', 'Reads each proposal the proposal chain drafts from a sales call and approves or rejects publishing it to the client''s portal.', 'granted')
  on conflict (key) do nothing
  returning id
)
insert into company_os.access_role_permissions (role_id, permission, scope)
select seeded.id, 'crm.proposal-approve', 'all'
from seeded;

-- 20261009200000 (Z.9, hand-applied): the hiring chain. applications and
-- job_requisitions gain their run state (the columns are written into the two
-- CREATE TABLE blocks above, so the select check sees them; the add column
-- lines below are no-ops on this dump), candidate_messages and
-- hiring_shortlists (hiring is portable), the kernel's event_outbox, the
-- record_application_decision RPC, and the access rows for hiring.approve. The
-- revoke from the chat agents' roles is left out, as those roles are Edge8's
-- own; anon and authenticated get nothing on the new tables.
-- Part 1: run state.

alter table company_os.applications
  add column if not exists chain_step text,
  add column if not exists chain_started_at timestamptz,
  add column if not exists chain_error text,
  add column if not exists chain_proposal jsonb,
  add column if not exists ai_screen_flags jsonb;

alter table company_os.applications drop constraint if exists applications_chain_step_check;
alter table company_os.applications add constraint applications_chain_step_check
  check (chain_step is null or chain_step in (
    'screen', 'triage', 'draft-invite', 'draft-decline', 'message-ready', 'send',
    'interviewing', 'ask-decision', 'decision-ready', 'decide', 'closed'));

alter table company_os.applications drop constraint if exists applications_chain_proposal_check;
alter table company_os.applications add constraint applications_chain_proposal_check
  check (chain_proposal is null or jsonb_typeof(chain_proposal) = 'object');

alter table company_os.applications drop constraint if exists applications_ai_screen_flags_check;
alter table company_os.applications add constraint applications_ai_screen_flags_check
  check (ai_screen_flags is null or jsonb_typeof(ai_screen_flags) = 'array');

alter table company_os.job_requisitions
  add column if not exists chain_step text,
  add column if not exists chain_started_at timestamptz,
  add column if not exists chain_error text;

alter table company_os.job_requisitions drop constraint if exists job_requisitions_chain_step_check;
alter table company_os.job_requisitions add constraint job_requisitions_chain_step_check
  check (chain_step is null or chain_step in (
    'ask-open', 'open-ready', 'open', 'collecting', 'shortlist', 'shortlist-ready',
    'apply-shortlist', 'closed'));

-- The driver's due lists: only the steps it advances.
create index if not exists applications_chain_due on company_os.applications (chain_step)
  where chain_step in ('screen', 'draft-invite', 'draft-decline', 'send', 'ask-decision', 'decide');
create index if not exists job_requisitions_chain_due on company_os.job_requisitions (chain_step)
  where chain_step in ('ask-open', 'open', 'collecting', 'shortlist', 'apply-shortlist');

-- Part 2: candidate messages.

create table if not exists company_os.candidate_messages (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references company_os.applications (id) on delete cascade,
  person_id       uuid references company_os.people (id) on delete set null,
  kind            text not null check (kind in ('invite', 'decline', 'decision_hire', 'decision_reject')),
  stage_id        uuid references company_os.application_stages (id) on delete set null,
  mode            text not null default 'live' check (mode in ('shadow', 'live')),
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'sending', 'sent', 'withdrawn', 'failed')),
  to_email        text not null check (btrim(to_email) <> ''),
  subject         text not null check (btrim(subject) <> ''),
  body_md         text not null check (btrim(body_md) <> ''),
  drafted_body_md text not null,
  version         text not null,
  send_key        text not null check (send_key like 'hiring:msg:%'),
  provider_ref    text,
  run_tick        text,
  error           text,
  approved_by     uuid references company_os.people (id) on delete set null,
  approved_at     timestamptz,
  claimed_at      timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint candidate_messages_shadow_never_sends check (
    mode = 'live' or status in ('pending', 'withdrawn')
  ),
  constraint candidate_messages_approved_says_when check (
    status not in ('approved', 'sending', 'sent') or approved_at is not null
  ),
  constraint candidate_messages_sent_says_when check (
    (status = 'sent') = (sent_at is not null)
  )
);

-- One live message in flight per key: a retried draft finds its row, and a
-- key already sending or sent cannot be claimed again.
create unique index if not exists candidate_messages_one_live_per_key
  on company_os.candidate_messages (send_key)
  where mode = 'live' and status in ('pending', 'approved', 'sending', 'sent');
create index if not exists candidate_messages_application_idx
  on company_os.candidate_messages (application_id);

alter table company_os.candidate_messages enable row level security;

grant select, insert, update on company_os.candidate_messages to service_role;

-- Part 3: shortlists.

create table if not exists company_os.hiring_shortlists (
  id                 uuid primary key default gen_random_uuid(),
  job_requisition_id uuid not null references company_os.job_requisitions (id) on delete cascade,
  round              integer not null check (round > 0),
  mode               text not null default 'live' check (mode in ('shadow', 'live')),
  status             text not null default 'proposed'
                       check (status in ('proposed', 'approved', 'rejected', 'withdrawn', 'applied')),
  items              jsonb not null check (jsonb_typeof(items) = 'array'),
  version            text not null,
  created_at         timestamptz not null default now(),
  decided_at         timestamptz,
  constraint hiring_shortlists_round_key unique (job_requisition_id, round, mode),
  constraint hiring_shortlists_shadow_never_decided check (
    mode = 'live' or status in ('proposed', 'withdrawn')
  )
);

-- One live shortlist waiting on the approver per requisition.
create unique index if not exists hiring_shortlists_one_proposed
  on company_os.hiring_shortlists (job_requisition_id)
  where mode = 'live' and status = 'proposed';

alter table company_os.hiring_shortlists enable row level security;

grant select, insert, update on company_os.hiring_shortlists to service_role;

-- Part 4: the event outbox.

create table if not exists company_os.event_outbox (
  id           uuid primary key default gen_random_uuid(),
  event_name   text not null check (btrim(event_name) <> ''),
  dedupe_key   text not null check (btrim(dedupe_key) <> ''),
  payload      jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  attempts     integer not null default 0,
  published_at timestamptz,
  last_error   text,
  constraint event_outbox_event_key unique (event_name, dedupe_key)
);

create index if not exists event_outbox_pending_idx
  on company_os.event_outbox (created_at)
  where published_at is null;

alter table company_os.event_outbox enable row level security;

grant select, insert, update on company_os.event_outbox to service_role;

revoke all on company_os.candidate_messages from anon, authenticated;
revoke all on company_os.hiring_shortlists from anon, authenticated;
revoke all on company_os.event_outbox from anon, authenticated;
comment on table company_os.candidate_messages is 'One row is: one email the hiring chain drafted for one candidate on one application — an interview invitation, a decline, or a hire or rejection decision — from draft through a person''s approval to send. [transactional · People operations | tier 3 support | active]';
comment on table company_os.hiring_shortlists is 'One row is: one shortlist the hiring chain proposed for one requisition in one round — each screened application in an advance, decline or hold lane — decided once by the approver. [transactional · People operations | tier 3 support | active]';
comment on table company_os.event_outbox is 'One row is: one bus event a database transaction recorded, waiting to be published (or published) after that transaction committed. [other · System config & plumbing | tier 3 support | active]';

-- Part 5: the decision.

create or replace function company_os.record_application_decision(
  p_application uuid,
  p_outcome text,
  p_reason text,
  p_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_stage_from uuid;
  v_requisition uuid;
  v_candidate uuid;
  v_person uuid;
  v_stage_to uuid;
  v_mover uuid;
  v_manager uuid;
begin
  if p_outcome is null or p_outcome not in ('hired', 'rejected') then
    raise exception 'record_application_decision: outcome must be hired or rejected, not %', coalesce(p_outcome, 'null')
      using errcode = '22023';
  end if;

  select a.status, a.current_stage_id, a.job_requisition_id, a.candidate_id, a.person_id
    into v_status, v_stage_from, v_requisition, v_candidate, v_person
    from company_os.applications a
   where a.id = p_application
     for update;
  if not found then
    raise exception 'record_application_decision: no application %', p_application
      using errcode = 'P0002';
  end if;

  -- The fence: a decision already recorded is not recorded again, so a retry
  -- after a lost reply changes nothing and announces nothing.
  if v_status in ('hired', 'rejected') then
    return false;
  end if;

  select s.id into v_stage_to
    from company_os.application_stages s
   where s.job_requisition_id = v_requisition and s.stage_kind = p_outcome
   order by s.position
   limit 1;

  update company_os.applications
     set status = p_outcome,
         decided_at = now(),
         rejection_reason = case
           when p_outcome = 'rejected' then nullif(btrim(coalesce(p_reason, '')), '')
           else rejection_reason
         end,
         current_stage_id = coalesce(v_stage_to, current_stage_id)
   where id = p_application;

  if v_stage_to is not null and v_stage_to is distinct from v_stage_from then
    -- application_stage_log.moved_by names a team_members row; the approver is
    -- a person, so their current employment row stands in (null when none).
    select tm.id into v_mover
      from company_os.team_members tm
     where p_by is not null and tm.person_id = p_by
     order by tm.end_date desc nulls first
     limit 1;
    insert into company_os.application_stage_log (application_id, from_stage_id, to_stage_id, moved_by, note)
    values (p_application, v_stage_from, v_stage_to, v_mover, 'Decision approved: ' || p_outcome);
  end if;

  if p_outcome = 'hired' then
    select r.hiring_manager_id into v_manager
      from company_os.job_requisitions r
     where r.id = v_requisition;
    insert into company_os.event_outbox (event_name, dedupe_key, payload)
    values (
      'candidate.hired',
      p_application::text,
      jsonb_build_object(
        'applicationId', p_application,
        'jobRequisitionId', v_requisition,
        'candidateId', v_candidate,
        'personId', v_person,
        'hiringManagerId', v_manager,
        'actorPersonId', p_by
      )
    )
    on conflict (event_name, dedupe_key) do nothing;
  end if;

  return true;
end;
$$;

revoke all on function company_os.record_application_decision(uuid, text, text, uuid) from public;
grant execute on function company_os.record_application_decision(uuid, text, text, uuid) to service_role;

-- Part 6: access rows.

-- 6a. Super Admin holds hiring.approve, the atom every hiring approval is
-- addressed to, so nothing waits on nobody.
insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, 'hiring.approve', 'all'
from company_os.access_roles r
where r.key = 'super-admin'
  and r.archived_at is null
  and not exists (
    select 1 from company_os.access_role_permissions p
    where p.role_id = r.id and p.permission = 'hiring.approve'
  );

-- 6b. The Hiring approver role, seeded with its atoms only if no role ever had
-- its key: the Admin view, the recruiting pages the approver decides on, and
-- the approval itself.
with seeded as (
  insert into company_os.access_roles (key, name, description, kind)
  values ('hiring-approver', 'Hiring approver', 'Approves opening a requisition, each shortlist, each hire or rejection and every message to a candidate, in the Admin view.', 'granted')
  on conflict (key) do nothing
  returning id
)
insert into company_os.access_role_permissions (role_id, permission, scope)
select seeded.id, v.permission, 'all'
from seeded, (values
  ('surface.admin'),
  ('hiring.ats'),
  ('hiring.approve')
) as v(permission);


-- 20261009230000 (Z.13, hand-applied): company_os.meeting_followups, one
-- client meeting's meeting-to-actions run; the chain's columns and once-index
-- on company_os.meeting_action_items; one card per action item on
-- company_os.tasks; and the meeting-actions routine set to shadow. The revoke
-- from the chat agents' roles is left out, as those roles are Edge8's own.
-- 1. The run's own row, one per meeting.

create table if not exists company_os.meeting_followups (
  id                 uuid primary key default gen_random_uuid(),
  meeting_id         uuid not null references company_os.meetings (id) on delete cascade,
  mode               text not null default 'live' check (mode in ('shadow', 'live')),
  step               text not null default 'gather' check (step in (
                       'gather', 'extract', 'draft', 'ask', 'ready', 'send',
                       'sent', 'rejected', 'expired', 'shadowed', 'skipped', 'stopped')),
  started_at         timestamptz not null default now(),
  error              text,
  skip_reason        text,
  transcript_sha256  text,
  contact_ids        uuid[] not null default '{}',
  commitments        text[] not null default '{}',
  ai_subject         text,
  ai_body_md         text,
  subject            text,
  body_md            text,
  to_person_ids      uuid[] not null default '{}',
  version            text,
  approver_person_id uuid references company_os.people (id) on delete set null,
  shadow_verdict     text check (shadow_verdict in ('would_send', 'would_not')),
  send_claimed_at    timestamptz,
  sent_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint meeting_followups_meeting_id_key unique (meeting_id),
  constraint meeting_followups_stopped_says_why check (
    step <> 'stopped' or length(btrim(coalesce(error, ''))) > 0
  ),
  constraint meeting_followups_skipped_says_why check (
    step <> 'skipped' or length(btrim(coalesce(skip_reason, ''))) > 0
  ),
  constraint meeting_followups_sent_is_whole check (
    (step = 'sent') = (sent_at is not null)
  ),
  constraint meeting_followups_shadow_never_sends check (
    mode <> 'shadow' or step not in ('ask', 'ready', 'send', 'sent')
  ),
  constraint meeting_followups_verdict_on_shadow check (
    shadow_verdict is null or step = 'shadowed'
  )
);

-- The driver's due list: the steps it advances, and ready for the expiry sweep.
create index if not exists meeting_followups_due_idx
  on company_os.meeting_followups (step)
  where step in ('gather', 'extract', 'draft', 'ask', 'ready', 'send');

drop trigger if exists meeting_followups_updated_at on company_os.meeting_followups;
create trigger meeting_followups_updated_at
  before update on company_os.meeting_followups
  for each row execute function company_os.handle_updated_at();

alter table company_os.meeting_followups enable row level security;

grant select, insert, update on company_os.meeting_followups to service_role;
revoke all on company_os.meeting_followups from anon, authenticated;


-- 2. What the chain knows about each action item.

alter table company_os.meeting_action_items
  add column if not exists origin      text,
  add column if not exists owner_side  text check (owner_side in ('edge8', 'client', 'unclear')),
  add column if not exists owner_name  text,
  add column if not exists evidence    text,
  add column if not exists file_state  text check (file_state in ('proposed', 'to_file', 'filed', 'needs_board', 'client', 'dismissed')),
  add column if not exists file_note   text,
  add column if not exists task_id     uuid references company_os.tasks (id) on delete set null,
  add column if not exists shadow_mark text check (shadow_mark in ('useful', 'not_useful'));

-- The columns above are also in the dumped CREATE TABLE (so the overlay's
-- column check sees them), where the add column is skipped; tasks is created
-- after this table in the dump, so the card link's foreign key is added here.
alter table company_os.meeting_action_items drop constraint if exists meeting_action_items_task_id_fkey;
alter table company_os.meeting_action_items add constraint meeting_action_items_task_id_fkey
  foreign key (task_id) references company_os.tasks (id) on delete set null;

alter table company_os.meeting_action_items drop constraint if exists meeting_action_items_chain_has_state;
alter table company_os.meeting_action_items add constraint meeting_action_items_chain_has_state
  check ((origin is not distinct from 'meeting-actions') = (file_state is not null));

create unique index if not exists meeting_action_items_chain_once
  on company_os.meeting_action_items (meeting_id, position)
  where origin = 'meeting-actions';

-- 3. One card per action item.

create unique index if not exists tasks_meeting_action_once
  on company_os.tasks (subject_id)
  where subject_type = 'meeting_action_item';

-- 4. The chain starts in shadow.

insert into company_os.routine_config (routine_id, mode)
values ('/api/cron/meeting-actions/', 'shadow')
on conflict (routine_id) do nothing;

-- Comments generated from docs/db/data-dictionary.md via scripts/data-dictionary/generate.mjs.
comment on table company_os.meeting_action_items is 'One row is: one action item captured from a meeting. [transactional · Client delivery & work | tier 3 support | active]';
comment on column company_os.meeting_action_items.origin is 'Which flow wrote the row: meeting-actions for the Z.13 chain; null for the coaching ingest and older rows. A row has a file_state exactly when origin is meeting-actions.';
comment on column company_os.meeting_action_items.owner_side is 'Who the meeting said owns the action. Valid values: [edge8, client, unclear]';
comment on column company_os.meeting_action_items.owner_name is 'The owner''s name as the meeting said it, matched only against the names the chain supplied to the model; the card''s assignee is resolved from it by exact folded name, never fuzzily.';
comment on column company_os.meeting_action_items.evidence is 'The verbatim transcript line the action was taken from; the chain drops an item whose evidence is not in the transcript.';
comment on column company_os.meeting_action_items.file_state is 'Where the chain''s row is on its way to a card. to_file waits for the boards filer; filed has its task_id; needs_board waits for a person to pick a board; client is the client''s own action, listed in the follow-up and never carded; proposed is a shadow run''s item, never filed; dismissed was set aside by a person. Valid values: [proposed, to_file, filed, needs_board, client, dismissed]';
comment on column company_os.meeting_action_items.file_note is 'Why the row was not filed or not assigned as asked (several boards, no board, no board member by that name), in a sentence.';
comment on column company_os.meeting_action_items.task_id is 'The Workboard card the row was filed as; null until filed, and again if the card is deleted.';
comment on column company_os.meeting_action_items.shadow_mark is 'A person''s verdict on a shadow run''s proposed item, the chain''s precision measure before it goes live. Valid values: [useful, not_useful]';
comment on table company_os.meeting_followups is 'One row is: one client meeting''s meeting-to-actions run — where it is, the follow-up email the model drafted and the copy a person approves, who approves it, and whether it was sent. [transactional · Client delivery & work | tier 3 support | active]';
comment on column company_os.meeting_followups.id is 'Primary key.';
comment on column company_os.meeting_followups.meeting_id is 'The client meeting the run is for; unique, so one run and one follow-up per meeting. Deleted with the meeting.';
comment on column company_os.meeting_followups.mode is 'The mode the run opened in, from the meeting-actions routine''s switch (Z.17). A shadow run proposes its items and closes shadowed after the draft: it never files, asks or sends, and a later switch to live does not change it. Valid values: [shadow, live]';
comment on column company_os.meeting_followups.step is 'Where the run is (ADR 0015). gather, extract, draft, ask and send are advanced by the crm driver; ready waits on the approver; sent, rejected, expired, shadowed, skipped and stopped are final until a person retries. Valid values: [gather, extract, draft, ask, ready, send, sent, rejected, expired, shadowed, skipped, stopped]';
comment on column company_os.meeting_followups.started_at is 'The run''s epoch, part of every step''s tick key; reset by Retry, so a retried step is a new tick.';
comment on column company_os.meeting_followups.error is 'Why the run stopped (the driver''s give-up reason after three failed attempts); required when step is stopped.';
comment on column company_os.meeting_followups.skip_reason is 'Why the run closed without doing anything (no transcript, the meeting archived); required when step is skipped.';
comment on column company_os.meeting_followups.transcript_sha256 is 'The SHA-256 of the transcript the run read, so a later reader can tell whether the transcript changed after the run.';
comment on column company_os.meeting_followups.contact_ids is 'The company''s contacts (people ids) with an email that the run gathered, the only people the follow-up may be sent to.';
comment on column company_os.meeting_followups.commitments is 'Any price, date or scope Edge8 stated in the meeting, as the extractor quoted it, shown beside the draft for the approver to check.';
comment on column company_os.meeting_followups.ai_subject is 'The model''s draft subject, exactly as returned; never edited.';
comment on column company_os.meeting_followups.ai_body_md is 'The model''s draft body in Markdown, exactly as returned; never edited, so the distance to what was sent stays on record.';
comment on column company_os.meeting_followups.subject is 'The subject the approver reads, edits and approves.';
comment on column company_os.meeting_followups.body_md is 'The body in Markdown the approver reads, edits and approves.';
comment on column company_os.meeting_followups.to_person_ids is 'The recipients (people ids), always a subset of contact_ids; matched to the attendees by exact folded name, or ticked by the approver.';
comment on column company_os.meeting_followups.version is 'The content hash of from, to, subject and body that the open approval names; the send goes ahead only when the approved version equals it.';
comment on column company_os.meeting_followups.approver_person_id is 'The person asked to approve: the meeting''s owner when one resolves and holds crm.calls; null when any holder of crm.calls may.';
comment on column company_os.meeting_followups.shadow_verdict is 'A person''s verdict on a shadow run''s draft: had it been live, would they have sent it. Valid values: [would_send, would_not]';
comment on column company_os.meeting_followups.send_claimed_at is 'When the send step claimed the send; set before the email goes, cleared if it fails, so two attempts never send twice.';
comment on column company_os.meeting_followups.sent_at is 'When the follow-up was sent; set exactly when step is sent.';
comment on column company_os.meeting_followups.created_at is 'When the driver or a person opened the run.';
comment on column company_os.meeting_followups.updated_at is 'When the row last changed, stamped by the house trigger.';

-- 20261009200500 (Z.9, hand-applied): the hiring chain's switch set to shadow,
-- because hiring is portable and a fork's chain must start in shadow too.
insert into company_os.routine_config (routine_id, mode)
values ('/api/cron/hiring-chain/', 'shadow')
on conflict (routine_id) do nothing;

-- 20261009235000 (Z.10, Z.11, seeded for forks): the proposal chain's and the
-- inquiry-to-lead chain's switches set to shadow, because crm is portable and a
-- fork's chains must start in shadow too.
insert into company_os.routine_config (routine_id, mode)
values
  ('/api/cron/proposal-chain/', 'shadow'),
  ('/api/cron/inquiry-to-lead/', 'shadow')
on conflict (routine_id) do nothing;

-- 20261009235500 (Z.7, hand-applied): company_os.notification_queue, the
-- notification router's queue of notices held through quiet hours or waiting
-- for the morning digest. A kernel table, and the kernel ships to the fork.
-- The revoke from the chat agents' roles is left out, as those roles are
-- Edge8's own.
create table if not exists company_os.notification_queue (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (btrim(kind) <> ''),
  channel       text not null check (channel in ('lark_dm', 'lark_chat', 'email')),
  recipient     text not null check (btrim(recipient) <> ''),
  person_id     uuid references company_os.people (id) on delete set null,
  subject       text not null check (btrim(subject) <> ''),
  message       jsonb not null check (jsonb_typeof(message) = 'object'),
  urgency       text not null default 'normal' check (urgency in ('normal', 'urgent')),
  reason        text not null check (reason in ('digest', 'held')),
  dedupe_key    text not null check (btrim(dedupe_key) <> ''),
  deliver_after timestamptz not null,
  status        text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'failed')),
  attempts      integer not null default 0 check (attempts >= 0),
  sent_at       timestamptz,
  carried_by    text,
  error         text,
  created_at    timestamptz not null default now(),
  constraint notification_queue_dedupe_key unique (dedupe_key),
  constraint notification_queue_sent_says_when check ((status = 'sent') = (sent_at is not null))
);

create index if not exists notification_queue_due_idx
  on company_os.notification_queue (deliver_after)
  where status = 'queued';

alter table company_os.notification_queue enable row level security;

grant select, insert, update on company_os.notification_queue to service_role;

comment on table company_os.notification_queue is 'One row is: one notice the notification router did not send at once, either held through quiet hours or waiting for its recipient''s morning digest, and what became of it. [other · System config & plumbing | tier 3 support | active]';
comment on column company_os.notification_queue.id is 'Primary key.';
comment on column company_os.notification_queue.kind is 'The router kind that queued it (the registry in kernel/messaging/router.ts), e.g. ops.qbo-token-expiring.';
comment on column company_os.notification_queue.channel is 'Valid values: [lark_dm, lark_chat, email]. How it is delivered: a Lark direct message, a post to a Lark group chat, or an email.';
comment on column company_os.notification_queue.recipient is 'Who receives it: an email address for lark_dm and email, or the chat''s name (ops, revenue, product, eo, coaching) for lark_chat.';
comment on column company_os.notification_queue.person_id is 'The recipient''s person, referencing people.id, when the address resolves to one; null for a group chat or an address with no person.';
comment on column company_os.notification_queue.subject is 'One line saying what the notice is about; the digest lists it, and the log''s subject comes from it.';
comment on column company_os.notification_queue.message is 'The notice itself as JSON: {"text": "..."} for a text message or {"card": {...}} for a Lark card.';
comment on column company_os.notification_queue.urgency is 'Valid values: [normal, urgent]. What the caller asked for; an urgent notice is never held for quiet hours.';
comment on column company_os.notification_queue.reason is 'Valid values: [digest, held]. digest when its kind is delivered in the morning digest; held when an immediate kind landed in quiet hours.';
comment on column company_os.notification_queue.dedupe_key is 'The caller''s idempotency key for the notice; unique, so the same notice queued twice is one row. A held row is sent under this key in automation_effects.';
comment on column company_os.notification_queue.deliver_after is 'The earliest moment it may be sent: the start of the next working window for a held row, the next working morning for a digest row.';
comment on column company_os.notification_queue.status is 'Valid values: [queued, sent, skipped, failed]. queued until the flush handles it; sent when it was delivered; skipped when delivery was declined on purpose (the recipient opted out of Lark DMs, or the chat is not configured); failed when the flush gave up after repeated failures.';
comment on column company_os.notification_queue.attempts is 'How many times the flush has tried to send it.';
comment on column company_os.notification_queue.sent_at is 'When it was delivered; set exactly when status is sent.';
comment on column company_os.notification_queue.carried_by is 'The automation_effects key of the send that delivered it: its own dedupe key for a held row, the digest''s key (messaging:digest:<recipient>:<date>) for a digest row.';
comment on column company_os.notification_queue.error is 'Why the last attempt failed or was skipped; null otherwise.';
comment on column company_os.notification_queue.created_at is 'When notify() queued it.';

-- 20261010020000: Admin holds the two Settings → Agents atoms (company-os.agents,
-- company-os.routine-control) as well as Super Admin, looked up by role key.
insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, v.permission, 'all'
from company_os.access_roles r,
     (values ('company-os.agents'), ('company-os.routine-control')) as v(permission)
where r.key = 'admin'
  and not exists (
    select 1 from company_os.access_role_permissions p
    where p.role_id = r.id and p.permission = v.permission
  );

-- 20261010040000: the client-team role reads and edits its own clients' weekly
-- status (client-programs.status and .status-release at scope clients).
insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, v.permission, 'clients'
from company_os.access_roles r,
     (values ('client-programs.status'), ('client-programs.status-release')) as v(permission)
where r.key = 'client-team'
  and not exists (
    select 1 from company_os.access_role_permissions p
    where p.role_id = r.id and p.permission = v.permission
  );

-- 20261010050000: the chat write role loses the chain-owned columns of applications and
-- meeting_action_items, and all writes to routine_runs (skipped where the role does not exist).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'chatbot_writer') then
    revoke insert, update on company_os.applications from chatbot_writer;
    grant insert (candidate_id, job_requisition_id, current_stage_id, source, source_detail,
                  referrer_person_id, applied_at, rating, metadata, created_at, updated_at,
                  resume_assessment, person_id, resume_document_id, cover_letter, answers,
                  archived_at, hr_assessment)
      on company_os.applications to chatbot_writer;
    grant update (candidate_id, job_requisition_id, current_stage_id, source, source_detail,
                  referrer_person_id, applied_at, rating, metadata, updated_at,
                  resume_assessment, person_id, resume_document_id, cover_letter, answers,
                  archived_at, hr_assessment)
      on company_os.applications to chatbot_writer;
    revoke insert, update on company_os.meeting_action_items from chatbot_writer;
    grant insert (meeting_id, title, detail, assignee_id, due_date, status, position,
                  created_at, updated_at, origin, owner_side, owner_name, evidence)
      on company_os.meeting_action_items to chatbot_writer;
    grant update (title, detail, assignee_id, due_date, status, position, updated_at,
                  origin, owner_side, owner_name, evidence)
      on company_os.meeting_action_items to chatbot_writer;
    revoke insert, update on company_os.routine_runs from chatbot_writer;
  end if;
end $$;

-- 20261010120000 (TH.1.8: kudos and the inbox kind kudos.received, hand-applied).
create table if not exists company_os.kudos (
  id             uuid primary key default gen_random_uuid(),
  from_person_id uuid not null references company_os.people (id) on delete cascade,
  to_person_id   uuid not null references company_os.people (id) on delete cascade,
  body           text not null check (length(btrim(body)) between 1 and 280),
  given_on       date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  created_at     timestamptz not null default now(),
  archived_at    timestamptz,
  archived_by    uuid references company_os.people (id) on delete set null,
  constraint kudos_not_to_self check (from_person_id <> to_person_id)
);
create index if not exists kudos_board_idx
  on company_os.kudos (given_on desc, created_at desc) where archived_at is null;
create index if not exists kudos_to_person_idx
  on company_os.kudos (to_person_id, created_at desc) where archived_at is null;
alter table company_os.kudos enable row level security;
grant select, insert, update, delete on company_os.kudos to service_role;
revoke all on company_os.kudos from public, anon, authenticated;
alter table company_os.notifications drop constraint if exists notifications_kind_check;
alter table company_os.notifications add constraint notifications_kind_check check (kind in (
  'card.completed', 'card.set_aside', 'subtask.done', 'leave.approved', 'leave.withdrawn',
  'hire.made', 'deal.won', 'invoice.paid',
  'idea.reacted', 'idea.built', 'idea.picked_up',
  'claim.decided', 'claim.paid',
  'idea.shipped',
  'kudos.received'
));
alter table company_os.notification_prefs drop constraint if exists notification_prefs_kind_check;
alter table company_os.notification_prefs add constraint notification_prefs_kind_check check (kind in (
  'card.completed', 'card.set_aside', 'subtask.done', 'leave.approved', 'leave.withdrawn',
  'hire.made', 'deal.won', 'invoice.paid',
  'idea.reacted', 'idea.built', 'idea.picked_up',
  'claim.decided', 'claim.paid',
  'idea.shipped',
  'kudos.received'
));

-- 20261010160001: drop the duplicate of uq_meetings_source_external.
drop index if exists company_os.idx_meetings_source_external;
