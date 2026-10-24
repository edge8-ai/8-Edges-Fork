-- 02-rebrand.sql — run AFTER 00-prereqs.sql and 01-schema.sql, once, with the
-- client slug passed as a psql variable:
--
--   psqlc -v ON_ERROR_STOP=1 -v slug='<client-slug>' -f supabase/02-rebrand.sql
--
-- Why this file exists
-- --------------------
-- README Step 1b renames the brand in three layers of application code. The
-- old brand slug is ALSO a data value baked into 01-schema.sql: four CHECK
-- constraints and three column defaults hardcode 'edge8', and two of the
-- constraints also allow 'aio', the upstream's second brand. Rebranding the
-- code alone leaves the database rejecting every row the rebranded code
-- writes, with errors like
--
--   new row for relation "objectives" violates check constraint
--   "objectives_brand_check"
--
-- and the failure surfaces late: the app builds, deploys and signs in, and
-- breaks the first time someone creates an objective, a service line, a
-- client backlog item or an invoice. So this runs at setup, not later. The
-- second client install (2026-09-09) found it that way.
--
-- The slug must equal SELF_BRAND_SLUG in kernel/config/brand.ts, the single
-- value left in BRANDS (entities/company-os/lib/company/edges-shared.ts) and
-- QboEntity (entities/company-os/lib/qbo.ts), and the brand row from Step 5.
--
-- Schema only, no rows. Safe to re-run: every statement drops the constraint
-- before adding it. Run it before any rows exist; on a database that already
-- holds 'edge8' rows the ADD CONSTRAINT fails, which is the right outcome.

\if :{?slug}
\else
  \echo 'ERROR: pass the client slug with  -v slug=<client-slug>'
  -- Raise a real error so ON_ERROR_STOP exits non-zero instead of running on.
  do $$ begin raise exception 'pass the client slug with -v slug=<client-slug>'; end $$;
\endif

set search_path = company_os, public;

-- company_os.client_backlog_items.source — who proposed a backlog item: the
-- operator's company (the slug) or the client.
alter table company_os.client_backlog_items
  alter column source set default :'slug';
alter table company_os.client_backlog_items
  drop constraint if exists client_backlog_items_source_check;
alter table company_os.client_backlog_items
  add constraint client_backlog_items_source_check
  check (source = any (array[:'slug'::text, 'client'::text]));

-- company_os.invoices.entity — which legal entity / QuickBooks company an
-- invoice belongs to. Mirrors QboEntity and InvoiceEntity in the code.
alter table company_os.invoices
  alter column entity set default :'slug';
alter table company_os.invoices
  drop constraint if exists invoices_entity_check;
alter table company_os.invoices
  add constraint invoices_entity_check
  check (entity = any (array[:'slug'::text]));

-- company_os.objectives.brand — which brand an objective belongs to. Mirrors
-- BRANDS in edges-shared.ts.
alter table company_os.objectives
  drop constraint if exists objectives_brand_check;
alter table company_os.objectives
  add constraint objectives_brand_check
  check (brand = any (array[:'slug'::text]));

-- company_os.service_lines.business_unit — mirrors BRANDS as above.
alter table company_os.service_lines
  drop constraint if exists service_lines_business_unit_check;
alter table company_os.service_lines
  add constraint service_lines_business_unit_check
  check (business_unit = any (array[:'slug'::text]));

-- company_os.qbo_connection.id — the row id IS the entity string, and the
-- OAuth callback writes it from QboEntity.
alter table company_os.qbo_connection
  alter column id set default :'slug';

-- Verify: all four constraints name the slug and none names edge8.
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where connamespace = 'company_os'::regnamespace
   and conname in ('client_backlog_items_source_check', 'invoices_entity_check',
                   'objectives_brand_check', 'service_lines_business_unit_check');
