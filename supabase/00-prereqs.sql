-- ═══════════════════════════════════════════════════════════════════════════
-- Company OS — prerequisites. Apply BEFORE 01-schema.sql.
--
-- These four groups are what `pg_dump --schema-only --schema=company_os
-- --schema=htt` does NOT produce, and 01-schema.sql will fail without them:
--
--   1. The schemas themselves.
--   2. Extensions. They live in the `extensions` schema, which is outside the
--      dumped schemas, so the dump references citext columns and vector types
--      without ever creating the types.
--   3. Roles. pg_dump never dumps roles — those are cluster-global
--      (pg_dumpall --globals-only). The dump's GRANT statements reference
--      these three by name and error if they do not exist.
--   4. Storage buckets. They live in storage.buckets, outside both dumped
--      schemas. 01-schema.sql applies fine without them, but every upload
--      path fails at runtime — resumes, avatars, gallery, ID documents.
--
-- Safe to re-run.
--
-- NOTE: this file does not make the app readable over the REST API. A new
-- Supabase project exposes only `public` and `graphql_public` to PostgREST, so
-- company_os and htt must also be added to the exposed schemas — see
-- supabase/config.toml and Step 3 of the README. psql cannot detect that
-- omission, because psql does not go through PostgREST.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists company_os;
create schema if not exists htt;

-- ── extensions ─────────────────────────────────────────────────────────────
-- citext backs the case-insensitive columns (affiliate codes, github repo
-- names, website URLs, attendee emails). vector is present for embeddings.
create extension if not exists citext        with schema extensions;
create extension if not exists pgcrypto      with schema extensions;
create extension if not exists "uuid-ossp"   with schema extensions;
create extension if not exists vector        with schema extensions;

-- ── least-privilege roles for the database assistants ──────────────────────
--
-- This is the security boundary for the admin and team chat agents. The
-- read-only guarantee is enforced HERE, by Postgres, not by prompt
-- instructions: the reader roles hold SELECT-only grants and a 5s statement
-- timeout, so a prompt injection that reaches the query tool still cannot
-- write. Keep it that way.
--
-- nologin: created WITHOUT login so a fresh install has no extra credentials
-- sitting on the database. The assistants are off until you deliberately turn
-- them on — see "enabling the assistants" at the end of this file.
-- noinherit: they get exactly the grants in 01-schema.sql, nothing by
-- membership.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'chatbot_reader') then
    create role chatbot_reader nologin noinherit;
  end if;
end $$;

alter role chatbot_reader set statement_timeout = '5s';
alter role chatbot_reader set idle_in_transaction_session_timeout = '10s';
alter role chatbot_reader set search_path = company_os;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'team_chatbot_reader') then
    create role team_chatbot_reader nologin noinherit;
  end if;
end $$;

alter role team_chatbot_reader set statement_timeout = '5s';
alter role team_chatbot_reader set idle_in_transaction_session_timeout = '10s';
alter role team_chatbot_reader set search_path = company_os;

-- The writer role exists for the approval-gated write tools. Reaching it needs
-- an email in CHATBOT_PRIVILEGED_EMAILS *and* a human approval click in the
-- UI. Leave CHATBOT_PRIVILEGED_EMAILS unset and nothing can use it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'chatbot_writer') then
    create role chatbot_writer nologin noinherit;
  end if;
end $$;

alter role chatbot_writer set statement_timeout = '5s';
alter role chatbot_writer set idle_in_transaction_session_timeout = '10s';
alter role chatbot_writer set search_path = company_os;

-- ── storage buckets ────────────────────────────────────────────────────────
--
-- These live in storage.buckets, which is outside company_os and htt, so a
-- schema-scoped pg_dump does not create them. Without them every upload path
-- fails at runtime: resumes on the careers form, avatars, the photo gallery,
-- marketing images, onboarding plans, ID documents.
--
-- The public/private split is deliberate and load-bearing. The private
-- buckets hold personal data and are never served directly — the application
-- issues short-lived signed URLs instead (60s for ID documents, 300s for
-- resumes). Flipping any of them to public would expose identity documents
-- and candidate resumes to anyone holding a path. There are no RLS policies
-- on storage.objects by design: all access goes through the service-role
-- client behind the app's own authorization checks.

insert into storage.buckets (id, name, public)
values
  -- public: served directly, non-sensitive
  ('avatars',             'avatars',             true),
  ('event-media',         'event-media',         true),
  ('gallery',             'gallery',             true),
  ('marketing',           'marketing',           true),
  -- private: signed URLs only
  ('id-documents',        'id-documents',        false),
  ('passports',           'passports',           false),
  ('resumes',             'resumes',             false),
  ('meeting-transcripts', 'meeting-transcripts', false),
  ('onboarding-plans',    'onboarding-plans',    false),
  ('program-documents',   'program-documents',   false),
  -- a card's deliverables (W.154): signed URLs only, the Boards entity serves them
  ('card-attachments',    'card-attachments',    false),
  -- receipts, red invoices and bank receipts (RB schema): signed URLs only, the Reimbursements entity serves them
  ('reimbursement-receipts', 'reimbursement-receipts', false)
on conflict (id) do nothing;

-- ── enabling the assistants (optional, do this last) ───────────────────────
--
-- The three roles above are created NOLOGIN, so as it stands nothing can
-- connect as them and the admin/team assistants cannot reach the database.
-- That is the right default for a fresh install, but it is NOT enough on its
-- own: lib/admin-chat/db.ts and lib/team-chat/db.ts connect *as* these roles
-- via CHATBOT_DB_URL / CHATBOT_WRITE_DB_URL / TEAM_CHATBOT_DB_URL. They do not
-- issue SET ROLE. A role that cannot log in means the assistant answers every
-- question with "Database access is not configured".
--
-- To turn the assistants on, give each role a login and a password, then build
-- the three connection URLs from them. Generate each password separately
-- (`openssl rand -base64 24`) and never reuse the postgres password.
--
--   alter role chatbot_reader      login password '<reader-password>';
--   alter role team_chatbot_reader login password '<team-reader-password>';
--   alter role chatbot_writer      login password '<writer-password>';
--
-- Then set these on the Vercel project. Use the SUPAVISOR TRANSACTION POOLER
-- (port 6543) — the app passes prepare:false, which is required in transaction
-- pool mode and wrong for a direct 5432 connection:
--
-- Each URL has the shape below. The spaces are NOT part of the value — they
-- are here so this line does not itself read as a credentialled URL to
-- .github/scripts/scan-tree.sh, which refuses that shape on sight. A setup doc
-- should not need an exemption from the check it is teaching:
--
--   postgresql:// <username> : <password> @ <pooler-host> : 6543 / postgres
--
--   CHATBOT_DB_URL        username  chatbot_reader.<PROJECT_REF>
--   TEAM_CHATBOT_DB_URL   username  team_chatbot_reader.<PROJECT_REF>
--   CHATBOT_WRITE_DB_URL  username  chatbot_writer.<PROJECT_REF>
--
--   POOLER_HOST           aws-0-<region>.pooler.supabase.com
--
-- The exact pooler host is in the dashboard under Settings → Database →
-- Connection pooling. If a password contains @ : / or #, percent-encode it.
--
-- The read-only guarantee does not depend on any of this: it comes from the
-- SELECT-only grants in 01-schema.sql and the 5s statement timeout above.
-- Giving a role LOGIN does not widen what it can read. Leaving
-- CHATBOT_WRITE_DB_URL unset keeps writes impossible regardless of
-- CHATBOT_PRIVILEGED_EMAILS.
