-- fork-schema-upgrade: 20261103091843 -> 20261104005624
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261103091843 (then 02-rebrand.sql) to version 20261104005624.
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

ALTER TABLE "company_os"."reimbursement_claim_events"
  DROP CONSTRAINT "reimbursement_claim_events_from_status_check";

ALTER TABLE "company_os"."reimbursement_claim_events"
  DROP CONSTRAINT "reimbursement_claim_events_to_status_check";

ALTER TABLE "company_os"."reimbursement_claims"
  DROP CONSTRAINT "reimbursement_claims_status_check";

CREATE TABLE "company_os"."reimbursement_advance_events" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "advance_id"      uuid                     NOT NULL,
  "move"            text                     NOT NULL,
  "from_status"     text,
  "to_status"       text                     NOT NULL,
  "actor_person_id" uuid,
  "reason"          text,
  "metadata"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reimbursement_advance_events_from_status_check"
    CHECK
    (((from_status IS NULL) OR (from_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'sent_back'::text, 'rejected'::text, 'cancelled'::text, 'approved'::text,
    'paid_out'::text, 'to_return'::text, 'settled'::text])))),
  CONSTRAINT "reimbursement_advance_events_move_check"
    CHECK
    ((move = ANY (ARRAY['create'::text, 'submit'::text, 'withdraw'::text, 'cancel'::text, 'approve'::text, 'send_back'::text, 'reject'::text, 'pay_out'::text, 'close'::text,
    'return_unspent'::text, 'confirm_return'::text]))),
  CONSTRAINT "reimbursement_advance_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "reimbursement_advance_events_to_status_check"
    CHECK
    ((to_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'sent_back'::text, 'rejected'::text, 'cancelled'::text, 'approved'::text, 'paid_out'::text, 'to_return'::text,
    'settled'::text])))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."reimbursement_advance_events" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."reimbursement_advance_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."reimbursement_advance_files" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "advance_id"   uuid                     NOT NULL,
  "kind"         text                     NOT NULL,
  "storage_path" text                     NOT NULL,
  "filename"     text                     NOT NULL,
  "mime_type"    text,
  "size_bytes"   bigint,
  "sha256"       text,
  "uploaded_by"  uuid,
  "confirmed_at" timestamp with time zone,
  "replaced_at"  timestamp with time zone,
  "replaced_by"  uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reimbursement_advance_files_id_advance_key" UNIQUE (id, advance_id),
  CONSTRAINT "reimbursement_advance_files_kind_check" CHECK ((kind = ANY (ARRAY['evidence'::text, 'bank_receipt'::text]))),
  CONSTRAINT "reimbursement_advance_files_pkey" PRIMARY KEY (id),
  CONSTRAINT "reimbursement_advance_files_sha256_check" CHECK (((sha256 IS NULL) OR (sha256 ~ '^[0-9a-f]{64}$'::text))),
  CONSTRAINT "reimbursement_advance_files_size_bytes_check" CHECK (((size_bytes IS NULL) OR (size_bytes >= 0))),
  CONSTRAINT "reimbursement_advance_files_storage_path_key" UNIQUE (storage_path)
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."reimbursement_advance_files" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."reimbursement_advance_files"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."reimbursement_advance_transfers" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "advance_id"           uuid                     NOT NULL,
  "direction"            text                     NOT NULL,
  "amount_vnd"           bigint                   NOT NULL,
  "transferred_on"       date                     NOT NULL,
  "request_key"          uuid                     NOT NULL,
  "recorded_by"          uuid                     NOT NULL,
  "recorded_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "bank_name_snapshot"   text,
  "bank_account_last4"   text,
  "bank_receipt_file_id" uuid,
  CONSTRAINT "reimbursement_advance_transfers_amount_vnd_check" CHECK ((amount_vnd > 0)),
  CONSTRAINT "reimbursement_advance_transfers_bank_account_last4_check" CHECK (((bank_account_last4 IS NULL) OR (bank_account_last4 ~ '^[0-9]{1,4}$'::text))),
  CONSTRAINT "reimbursement_advance_transfers_direction_check" CHECK ((direction = ANY (ARRAY['out'::text, 'in'::text]))),
  CONSTRAINT "reimbursement_advance_transfers_out_receipt" CHECK (((direction <> 'out'::text) OR (bank_receipt_file_id IS NOT NULL))),
  CONSTRAINT "reimbursement_advance_transfers_pkey" PRIMARY KEY (id),
  CONSTRAINT "reimbursement_advance_transfers_request_key" UNIQUE (advance_id, request_key)
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."reimbursement_advance_transfers" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."reimbursement_advance_transfers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "company_os"."reimbursement_advances" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "ref_no"           bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "person_id"        uuid                     NOT NULL,
  "team_member_id"   uuid                     NOT NULL,
  "purpose"          text                     NOT NULL,
  "trip_event_id"    uuid,
  "amount_vnd"       bigint                   NOT NULL,
  "spend_ends_on"    date                     NOT NULL,
  "settle_by"        date,
  "status"           text                     NOT NULL DEFAULT 'draft'::text,
  "submitted_at"     timestamp with time zone,
  "decided_at"       timestamp with time zone,
  "decided_by"       uuid,
  "paid_out_at"      timestamp with time zone,
  "settled_at"       timestamp with time zone,
  "spent_vnd"        bigint,
  "balance_vnd"      bigint,
  "settled_claim_id" uuid,
  "reminded_at"      timestamp with time zone,
  "overdue_told_at"  timestamp with time zone,
  "metadata"         jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reimbursement_advances_amount_vnd_check" CHECK ((amount_vnd > 0)),
  CONSTRAINT "reimbursement_advances_balance_shape" CHECK ((((spent_vnd IS NULL) = (balance_vnd IS NULL)) AND ((balance_vnd IS NULL) OR (balance_vnd = (spent_vnd - amount_vnd))))),
  CONSTRAINT "reimbursement_advances_decided_shape"
    CHECK (((status <> ALL (ARRAY['sent_back'::text, 'rejected'::text, 'approved'::text, 'paid_out'::text, 'to_return'::text, 'settled'::text])) OR (decided_at IS NOT NULL))),
  CONSTRAINT "reimbursement_advances_id_person_key" UNIQUE (id, person_id),
  CONSTRAINT "reimbursement_advances_pkey" PRIMARY KEY (id),
  CONSTRAINT "reimbursement_advances_purpose_check" CHECK ((length(TRIM(BOTH FROM purpose)) > 0)),
  CONSTRAINT "reimbursement_advances_ref_no_key" UNIQUE (ref_no),
  CONSTRAINT "reimbursement_advances_spent_vnd_check" CHECK (((spent_vnd IS NULL) OR (spent_vnd >= 0))),
  CONSTRAINT "reimbursement_advances_status_check"
    CHECK
    ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'sent_back'::text, 'rejected'::text, 'cancelled'::text, 'approved'::text, 'paid_out'::text, 'to_return'::text,
    'settled'::text]))),
  CONSTRAINT "reimbursement_advances_status_shape"
    CHECK
    ((((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'sent_back'::text, 'rejected'::text, 'cancelled'::text, 'approved'::text])) AND (paid_out_at IS NULL) AND (settle_by
    IS NULL) AND (spent_vnd IS NULL) AND (settled_at IS NULL) AND (settled_claim_id IS NULL)) OR ((status = 'paid_out'::text) AND (paid_out_at IS NOT NULL) AND (settle_by IS
    NOT NULL) AND (spent_vnd IS NULL) AND (settled_at IS NULL) AND (settled_claim_id IS NULL)) OR ((status = 'to_return'::text) AND (paid_out_at IS NOT NULL) AND (settle_by IS
    NOT NULL) AND (spent_vnd IS NOT NULL) AND (balance_vnd < 0) AND (settled_at IS NULL)) OR ((status = 'settled'::text) AND (paid_out_at IS NOT NULL) AND (settle_by IS
    NOT NULL) AND (spent_vnd IS NOT NULL) AND (settled_at IS NOT NULL)))),
  CONSTRAINT "reimbursement_advances_submitted_shape" CHECK (((status = 'draft'::text) OR (submitted_at IS NOT NULL)))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."reimbursement_advances" FROM "chatbot_reader", "chatbot_writer";

-- The identity column's sequence is created with the default privileges too.
DO $$ BEGIN EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM "chatbot_writer"', pg_get_serial_sequence('"company_os"."reimbursement_advances"', 'ref_no')); END $$;

ALTER TABLE "company_os"."reimbursement_advances"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."reimbursement_claims"
  ADD COLUMN "advance_id" uuid;

CREATE OR REPLACE FUNCTION company_os.reimbursement_advance_events_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Advance history is append-only.' using errcode = 'P0001';
  end if;
  if exists (select 1 from company_os.reimbursement_advances a where a.id = old.advance_id) then
    raise exception 'Advance history is append-only.' using errcode = 'P0001';
  end if;
  return old;
end $function$;

CREATE OR REPLACE FUNCTION company_os.reimbursement_advance_files_guard_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  s text;
  sub timestamptz;
begin
  if old.confirmed_at is null then
    return old;
  end if;
  if old.kind = 'bank_receipt' then
    raise exception 'A bank receipt is kept (10-year retention).' using errcode = 'P0001';
  end if;
  select a.status, a.submitted_at into s, sub from company_os.reimbursement_advances a where a.id = old.advance_id;
  if s is not null and (s <> 'draft' or sub is not null) then
    raise exception 'Evidence of an advance that was ever submitted is kept (10-year retention); mark it replaced instead.' using errcode = 'P0001';
  end if;
  return old;
end $function$;

CREATE OR REPLACE FUNCTION company_os.reimbursement_advance_files_guard_update()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.kind is distinct from old.kind or new.advance_id is distinct from old.advance_id then
    raise exception 'File % stays on its advance as what it is.', old.id using errcode = 'P0R02';
  end if;
  if old.confirmed_at is not null
     and (new.confirmed_at is distinct from old.confirmed_at
          or new.storage_path is distinct from old.storage_path
          or new.mime_type is distinct from old.mime_type
          or new.size_bytes is distinct from old.size_bytes
          or new.sha256 is distinct from old.sha256) then
    raise exception 'File % was confirmed, so what was confirmed cannot change.', old.id using errcode = 'P0R02';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION company_os.reimbursement_advance_transfers_guard_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  raise exception 'The advance ledger is append-only.' using errcode = 'P0001';
end $function$;

CREATE OR REPLACE FUNCTION company_os.reimbursement_advance_transfers_guard_insert()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  st text;
  asked bigint;
  bal bigint;
  returned bigint;
  file_kind text;
  file_confirmed timestamptz;
begin
  select a.status, a.amount_vnd, a.balance_vnd into st, asked, bal
  from company_os.reimbursement_advances a where a.id = new.advance_id for update;
  -- A missing advance is the foreign key's to refuse, not this trigger's.
  if not found then
    return new;
  end if;

  if new.bank_receipt_file_id is not null then
    select f.kind, f.confirmed_at into file_kind, file_confirmed
    from company_os.reimbursement_advance_files f where f.id = new.bank_receipt_file_id;
    -- A file of another advance is the composite key's to refuse; the kind and the
    -- finished upload are this trigger's.
    if found and (file_kind <> 'bank_receipt' or file_confirmed is null) then
      raise exception 'A transfer''s receipt must be a finished bank receipt upload.' using errcode = 'P0R02';
    end if;
  end if;

  if new.direction = 'out' then
    if st <> 'approved' then
      raise exception 'Advance % is %: only an approved advance can be paid out.', new.advance_id, st using errcode = 'P0R02';
    end if;
    if new.amount_vnd <> asked then
      raise exception 'Advance % was approved for % VND, so % VND cannot be paid out.', new.advance_id, asked, new.amount_vnd
        using errcode = 'P0R02';
    end if;
  else
    -- bal is tested too: a comparison with NULL below would let any amount through.
    if st <> 'to_return' or bal is null or bal >= 0 then
      raise exception 'Advance % is %: nothing is owed back on it.', new.advance_id, st using errcode = 'P0R02';
    end if;
    select coalesce(sum(t.amount_vnd), 0) into returned
    from company_os.reimbursement_advance_transfers t
    where t.advance_id = new.advance_id and t.direction = 'in';
    if returned + new.amount_vnd > -bal then
      raise exception 'Advance %: % VND is still owed, so % VND cannot be recorded.', new.advance_id, -bal - returned, new.amount_vnd
        using errcode = 'P0R02';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION company_os.reimbursement_advances_guard_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if old.status <> 'draft' or old.submitted_at is not null then
    raise exception 'An advance that was ever submitted is kept (10-year retention); advance % is %.', old.id, old.status
      using errcode = 'P0001';
  end if;
  return old;
end $function$;

CREATE OR REPLACE FUNCTION company_os.reimbursement_advances_guard_freeze()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  has_out boolean;
  returned bigint;
begin
  if old.status not in ('draft', 'sent_back')
     and (new.amount_vnd is distinct from old.amount_vnd
          or new.person_id is distinct from old.person_id
          or new.team_member_id is distinct from old.team_member_id
          or new.purpose is distinct from old.purpose
          or new.spend_ends_on is distinct from old.spend_ends_on) then
    raise exception 'Advance % is %: what the approver read cannot change.', old.id, old.status using errcode = 'P0R02';
  end if;
  -- The delete guard trusts submitted_at, so it can be moved on by a new submission but
  -- never cleared: otherwise a submitted advance could be rewritten into a deletable draft.
  if old.submitted_at is not null and new.submitted_at is null then
    raise exception 'Advance % was submitted, so it is kept (10-year retention).', old.id using errcode = 'P0001';
  end if;
  -- The payout's facts and the deadline it set, and the close's time, are written once.
  if (old.paid_out_at is not null
      and (new.paid_out_at is distinct from old.paid_out_at or new.settle_by is distinct from old.settle_by))
     or (old.settled_at is not null and new.settled_at is distinct from old.settled_at) then
    raise exception 'Advance % is %: its payout, deadline and close times cannot change.', old.id, old.status using errcode = 'P0R02';
  end if;
  if old.status in ('to_return', 'settled')
     and (new.spent_vnd is distinct from old.spent_vnd
          or new.balance_vnd is distinct from old.balance_vnd
          or new.settled_claim_id is distinct from old.settled_claim_id) then
    raise exception 'Advance % is %: what it closed on cannot change.', old.id, old.status using errcode = 'P0R02';
  end if;

  -- A status can never disagree with the ledger. The app writes a transfer and the
  -- status as two steps, so without this an owner's cancel landing between them would
  -- leave money out on a cancelled advance, with no way to record its return. This
  -- trigger runs holding the row lock the ledger's insert guard also takes, so the two
  -- queue, and each sees what the other committed.
  if new.status is distinct from old.status then
    if old.status = 'settled' then
      raise exception 'Advance % is settled, which is final.', old.id using errcode = 'P0R02';
    end if;
    select exists (select 1 from company_os.reimbursement_advance_transfers t
                   where t.advance_id = old.id and t.direction = 'out')
      into has_out;
    if has_out and new.status not in ('paid_out', 'to_return', 'settled') then
      raise exception 'Advance % has money out, so it cannot become %.', old.id, new.status using errcode = 'P0R02';
    end if;
    if not has_out and new.status in ('paid_out', 'to_return', 'settled') then
      raise exception 'Advance % has no payout on its ledger, so it cannot become %.', old.id, new.status using errcode = 'P0R02';
    end if;
    if new.status = 'settled' then
      select coalesce(sum(t.amount_vnd), 0) into returned
      from company_os.reimbursement_advance_transfers t
      where t.advance_id = old.id and t.direction = 'in';
      -- Nothing is owed back when the person spent all of it or more. An empty balance
      -- is the shape check's to refuse, and greatest ignores it here.
      if returned <> greatest(-new.balance_vnd, 0) then
        raise exception 'Advance %: % VND has come back of % VND owed, so it cannot be settled.', old.id, returned, greatest(-new.balance_vnd, 0)
          using errcode = 'P0R02';
      end if;
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION company_os.reimbursement_advances_guard_insert()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.status <> 'draft' then
    raise exception 'A new advance starts as a draft, not %.', new.status using errcode = 'P0R02';
  end if;
  return new;
end $function$;

ALTER TABLE "company_os"."reimbursement_advance_events"
  ADD CONSTRAINT "reimbursement_advance_events_actor_person_id_fkey" FOREIGN KEY (actor_person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."reimbursement_advance_files"
  ADD CONSTRAINT "reimbursement_advance_files_replaced_by_fkey" FOREIGN KEY (replaced_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."reimbursement_advance_files"
  ADD CONSTRAINT "reimbursement_advance_files_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."reimbursement_advance_transfers"
  ADD CONSTRAINT "reimbursement_advance_transfers_receipt_fkey" FOREIGN KEY (bank_receipt_file_id, advance_id) REFERENCES company_os.reimbursement_advance_files(id, advance_id)
    ON DELETE RESTRICT;

ALTER TABLE "company_os"."reimbursement_advance_transfers"
  ADD CONSTRAINT "reimbursement_advance_transfers_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."reimbursement_advances"
  ADD CONSTRAINT "reimbursement_advances_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES company_os.people(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."reimbursement_advances"
  ADD CONSTRAINT "reimbursement_advances_person_id_fkey" FOREIGN KEY (person_id) REFERENCES company_os.people(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."reimbursement_advance_events"
  ADD CONSTRAINT "reimbursement_advance_events_advance_id_fkey" FOREIGN KEY (advance_id) REFERENCES company_os.reimbursement_advances(id) ON DELETE CASCADE;

ALTER TABLE "company_os"."reimbursement_advance_files"
  ADD CONSTRAINT "reimbursement_advance_files_advance_id_fkey" FOREIGN KEY (advance_id) REFERENCES company_os.reimbursement_advances(id) ON DELETE CASCADE;

ALTER TABLE "company_os"."reimbursement_advance_transfers"
  ADD CONSTRAINT "reimbursement_advance_transfers_advance_id_fkey" FOREIGN KEY (advance_id) REFERENCES company_os.reimbursement_advances(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."reimbursement_advances"
  ADD CONSTRAINT "reimbursement_advances_team_member_id_fkey" FOREIGN KEY (team_member_id) REFERENCES company_os.team_members(id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."reimbursement_advances"
  ADD CONSTRAINT "reimbursement_advances_trip_event_id_fkey" FOREIGN KEY (trip_event_id) REFERENCES company_os.events(id) ON DELETE SET NULL;

ALTER TABLE "company_os"."reimbursement_claim_events"
  ADD CONSTRAINT "reimbursement_claim_events_from_status_check"
    CHECK
    (((from_status IS NULL) OR (from_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'checked'::text, 'sent_back'::text, 'rejected'::text, 'approved'::text, 'settled'::text,
    'in_run'::text, 'paid'::text]))));

ALTER TABLE "company_os"."reimbursement_claim_events"
  ADD CONSTRAINT "reimbursement_claim_events_to_status_check"
    CHECK
    ((to_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'checked'::text, 'sent_back'::text, 'rejected'::text, 'approved'::text, 'settled'::text, 'in_run'::text,
    'paid'::text])));

ALTER TABLE "company_os"."reimbursement_claims"
  ADD CONSTRAINT "reimbursement_claims_advance_owner_fkey" FOREIGN KEY (advance_id, person_id) REFERENCES company_os.reimbursement_advances(id, person_id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."reimbursement_claims"
  ADD CONSTRAINT "reimbursement_claims_id_advance_key" UNIQUE (id, advance_id);

ALTER TABLE "company_os"."reimbursement_advances"
  ADD CONSTRAINT "reimbursement_advances_settled_claim_fkey" FOREIGN KEY (settled_claim_id, id) REFERENCES company_os.reimbursement_claims(id, advance_id) ON DELETE RESTRICT;

ALTER TABLE "company_os"."reimbursement_claims"
  ADD CONSTRAINT "reimbursement_claims_status_check"
    CHECK
    ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'checked'::text, 'sent_back'::text, 'rejected'::text, 'approved'::text, 'settled'::text, 'in_run'::text,
    'paid'::text])));

CREATE INDEX reimbursement_advance_events_advance_idx ON company_os.reimbursement_advance_events USING btree (advance_id, created_at);

CREATE INDEX reimbursement_advance_files_advance_idx ON company_os.reimbursement_advance_files USING btree (advance_id, created_at);

CREATE INDEX reimbursement_advance_files_unconfirmed_idx ON company_os.reimbursement_advance_files USING btree (created_at)
  WHERE (confirmed_at IS NULL);

CREATE INDEX reimbursement_advance_transfers_advance_idx ON company_os.reimbursement_advance_transfers USING btree (advance_id, transferred_on);

CREATE UNIQUE INDEX reimbursement_advance_transfers_one_out_idx ON company_os.reimbursement_advance_transfers USING btree (advance_id)
  WHERE (direction = 'out'::text);

CREATE UNIQUE INDEX reimbursement_advances_one_open_idx ON company_os.reimbursement_advances USING btree (person_id)
  WHERE (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'sent_back'::text, 'approved'::text, 'paid_out'::text, 'to_return'::text]));

CREATE INDEX reimbursement_advances_person_idx ON company_os.reimbursement_advances USING btree (person_id, created_at DESC);

CREATE INDEX reimbursement_advances_status_idx ON company_os.reimbursement_advances USING btree (status, settle_by);

CREATE INDEX reimbursement_advances_trip_idx ON company_os.reimbursement_advances USING btree (trip_event_id)
  WHERE (trip_event_id IS NOT NULL);

CREATE UNIQUE INDEX reimbursement_claims_one_per_advance_idx ON company_os.reimbursement_claims USING btree (advance_id)
  WHERE (advance_id IS NOT NULL);

CREATE TRIGGER reimbursement_advance_events_guard
  BEFORE DELETE OR UPDATE ON company_os.reimbursement_advance_events
  FOR EACH ROW
  EXECUTE FUNCTION company_os.reimbursement_advance_events_guard();

CREATE TRIGGER reimbursement_advance_files_guard_delete
  BEFORE DELETE ON company_os.reimbursement_advance_files
  FOR EACH ROW
  EXECUTE FUNCTION company_os.reimbursement_advance_files_guard_delete();

CREATE TRIGGER reimbursement_advance_files_guard_update
  BEFORE UPDATE ON company_os.reimbursement_advance_files
  FOR EACH ROW
  EXECUTE FUNCTION company_os.reimbursement_advance_files_guard_update();

CREATE TRIGGER reimbursement_advance_transfers_guard_change
  BEFORE DELETE OR UPDATE ON company_os.reimbursement_advance_transfers
  FOR EACH ROW
  EXECUTE FUNCTION company_os.reimbursement_advance_transfers_guard_change();

CREATE TRIGGER reimbursement_advance_transfers_guard_insert
  BEFORE INSERT ON company_os.reimbursement_advance_transfers
  FOR EACH ROW
  EXECUTE FUNCTION company_os.reimbursement_advance_transfers_guard_insert();

CREATE TRIGGER reimbursement_advances_guard_delete
  BEFORE DELETE ON company_os.reimbursement_advances
  FOR EACH ROW
  EXECUTE FUNCTION company_os.reimbursement_advances_guard_delete();

CREATE TRIGGER reimbursement_advances_guard_freeze
  BEFORE UPDATE ON company_os.reimbursement_advances
  FOR EACH ROW
  EXECUTE FUNCTION company_os.reimbursement_advances_guard_freeze();

CREATE TRIGGER reimbursement_advances_guard_insert
  BEFORE INSERT ON company_os.reimbursement_advances
  FOR EACH ROW
  EXECUTE FUNCTION company_os.reimbursement_advances_guard_insert();

CREATE TRIGGER reimbursement_advances_updated_at
  BEFORE UPDATE ON company_os.reimbursement_advances
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."reimbursement_advance_events"."actor_person_id" IS 'The person (company_os.people) who moved it.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_events"."advance_id" IS 'The advance (reimbursement_advances) that moved.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_events"."created_at" IS 'When the move happened.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_events"."from_status" IS 'The status it left; null for an advance''s first event. Valid values: [draft, submitted, sent_back, rejected, cancelled, approved, paid_out, to_return, settled]';

COMMENT ON COLUMN "company_os"."reimbursement_advance_events"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_events"."metadata" IS 'Detail of the move: the transfer, the settlement claim, the frozen figures.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_events"."move" IS 'What happened. Valid values: [create, submit, withdraw, cancel, approve, send_back, reject, pay_out, close, return_unspent, confirm_return]';

COMMENT ON COLUMN "company_os"."reimbursement_advance_events"."reason" IS 'The reason given when the move needs one (sent back, rejected, cancelled once approved).';

COMMENT ON COLUMN "company_os"."reimbursement_advance_events"."to_status" IS 'The status it reached; the same as from_status for a return that leaves money still owed. Valid values: [draft, submitted, sent_back, rejected, cancelled, approved, paid_out, to_return, settled]';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."advance_id" IS 'The advance (reimbursement_advances) the document belongs to; deleted with a deletable draft.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."confirmed_at" IS 'When the server confirmed the stored object; null while an upload is unfinished, and such rows are never shown.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."created_at" IS 'When the row was inserted, which is when its upload started.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."filename" IS 'The name it was uploaded with, as people see it.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."kind" IS 'What the document is. Valid values: [evidence, bank_receipt]';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."mime_type" IS 'The MIME type the server read from the stored object on confirm.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."replaced_at" IS 'When the owner set this evidence aside in favour of another on an advance that had already been submitted; it stays on the advance.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."replaced_by" IS 'The person (company_os.people) who set it aside.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."sha256" IS 'The object''s SHA-256.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."size_bytes" IS 'The stored object''s size in bytes as the server read it on confirm.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."storage_path" IS 'The object''s path in the reimbursement-receipts bucket; unique.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_files"."uploaded_by" IS 'The person (company_os.people) who uploaded it.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_transfers"."advance_id" IS 'The advance (reimbursement_advances) the money belongs to.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_transfers"."amount_vnd" IS 'The amount transferred, in whole VND.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_transfers"."bank_account_last4" IS 'The last four digits of that account, as it was then.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_transfers"."bank_name_snapshot" IS 'The bank the money went to or came from, as it was then.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_transfers"."bank_receipt_file_id" IS 'The bank''s receipt (reimbursement_advance_files) for the transfer; required on a payout, optional on a return.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_transfers"."direction" IS 'Which way the money went: out is the payout (one per advance), in is a return. Valid values: [out, in]';

COMMENT ON COLUMN "company_os"."reimbursement_advance_transfers"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_transfers"."recorded_at" IS 'When it was recorded.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_transfers"."recorded_by" IS 'The person (company_os.people) who recorded it.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_transfers"."request_key" IS 'The recording form''s own key, unique per advance, so a double click or a retry records one transfer.';

COMMENT ON COLUMN "company_os"."reimbursement_advance_transfers"."transferred_on" IS 'The date the bank shows for the transfer.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."amount_vnd" IS 'The amount asked, approved and paid out, in whole VND; frozen once it leaves draft and sent back.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."balance_vnd" IS 'spent_vnd less amount_vnd, frozen at close: above zero the company owes the difference, below zero the person owes it.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."created_at" IS 'When the advance was started.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."decided_at" IS 'When the approver last approved it, sent it back or rejected it.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."decided_by" IS 'The person (company_os.people) who made that decision.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."metadata" IS 'Flow detail worth keeping with the advance that has no column of its own.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."overdue_told_at" IS 'When the overdue notice was claimed by the cron, so it is sent once.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."paid_out_at" IS 'When the accountant recorded the transfer.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."person_id" IS 'The person who asks and holds the money (company_os.people); their bank details are on people_sensitive.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."purpose" IS 'What the money is for, as the owner wrote it.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."ref_no" IS 'The advance''s number, shown as ADV-0001 and used in the transfer reference.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."reminded_at" IS 'When the reminder before settle_by was claimed by the cron, so it is sent once.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."settle_by" IS 'The settlement deadline, set at payout: 10 working days after the later of spend_ends_on and the payout''s Vietnam date.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."settled_at" IS 'When nothing remained outstanding either way.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."settled_claim_id" IS 'The settlement claim (reimbursement_claims) that closed it; null when the owner returned it unspent.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."spend_ends_on" IS 'The purchase date or the trip''s last day.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."spent_vnd" IS 'The settlement''s kept receipts in whole VND, frozen at close; 0 when the owner spent none of it.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."status" IS 'Where the advance stands; changed only by the advance-lifecycle module. Valid values: [draft, submitted, sent_back, rejected, cancelled, approved, paid_out, to_return, settled]';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."submitted_at" IS 'When it was last submitted; null while it was never submitted. A never-submitted draft is the only advance that may be deleted.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."team_member_id" IS 'The employment (company_os.team_members) the advance was asked under, so it stays attributable after the person leaves and Finance can book an employee and a contractor correctly.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."trip_event_id" IS 'The trip or event it belongs to, an events row; null when it names none.';

COMMENT ON COLUMN "company_os"."reimbursement_advances"."updated_at" IS 'When the row last changed; maintained by a trigger.';

COMMENT ON COLUMN "company_os"."reimbursement_claim_events"."from_status" IS 'The status it left; null for a claim''s first event. Valid values: [draft, submitted, checked, sent_back, rejected, approved, settled, in_run, paid]';

COMMENT ON COLUMN "company_os"."reimbursement_claim_events"."to_status" IS 'The status it reached. Valid values: [draft, submitted, checked, sent_back, rejected, approved, settled, in_run, paid]';

COMMENT ON COLUMN "company_os"."reimbursement_claims"."advance_id" IS 'The advance (reimbursement_advances) this claim settles; null for an ordinary claim. A composite key makes it the same person''s, and a unique index allows one per advance.';

COMMENT ON COLUMN "company_os"."reimbursement_claims"."status" IS 'Where the claim stands; changed only by the claim-lifecycle module. Valid values: [draft, submitted, checked, sent_back, rejected, approved, settled, in_run, paid]';

COMMENT ON TABLE "company_os"."reimbursement_advance_events" IS 'One row is: one move of one advance — asked, withdrawn, cancelled, approved, sent back, rejected, paid out, closed, returned unspent or a return confirmed — with who did it and why. [other · Logs, audit & telemetry | tier 3 support | active]';

COMMENT ON TABLE "company_os"."reimbursement_advance_files" IS 'One row is: one stored document behind an advance — the quote or estimate behind its request, or the bank''s receipt for one of its transfers — in the private reimbursement-receipts bucket. [transactional · Spend | tier 3 support | active]';

COMMENT ON TABLE "company_os"."reimbursement_advance_transfers" IS 'One row is: one bank transfer on an advance''s ledger — the company''s one payout to the person, or one return from them. [transactional · Spend | tier 3 support | active]';

COMMENT ON TABLE "company_os"."reimbursement_advances" IS 'One row is: one advance (tạm ứng, account 141) — money the company sends a person before a purchase or trip, closed later by a settlement claim or a return. [transactional · Spend | tier 3 support | active]';

GRANT EXECUTE ON FUNCTION "company_os"."reimbursement_advance_events_guard"() TO "postgres";

GRANT EXECUTE ON FUNCTION "company_os"."reimbursement_advance_files_guard_delete"() TO "postgres";

GRANT EXECUTE ON FUNCTION "company_os"."reimbursement_advance_files_guard_update"() TO "postgres";

GRANT EXECUTE ON FUNCTION "company_os"."reimbursement_advance_transfers_guard_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "company_os"."reimbursement_advance_transfers_guard_insert"() TO "postgres";

GRANT EXECUTE ON FUNCTION "company_os"."reimbursement_advances_guard_delete"() TO "postgres";

GRANT EXECUTE ON FUNCTION "company_os"."reimbursement_advances_guard_freeze"() TO "postgres";

GRANT EXECUTE ON FUNCTION "company_os"."reimbursement_advances_guard_insert"() TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."reimbursement_advance_events" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."reimbursement_advance_events" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."reimbursement_advance_files" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."reimbursement_advance_files" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."reimbursement_advance_transfers" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."reimbursement_advance_transfers" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."reimbursement_advances" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."reimbursement_advances" TO "service_role";

-- Added by hand, as the generator's refusal asks. The diff engine writes no grant on a
-- sequence, and production keeps the schema's default grant on this identity column's
-- sequence, so without this line an upgraded database differs from a fresh one.
GRANT SELECT,USAGE ON SEQUENCE "company_os"."reimbursement_advances_ref_no_seq" TO "chatbot_writer";
