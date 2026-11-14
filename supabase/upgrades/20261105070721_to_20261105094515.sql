-- fork-schema-upgrade: 20261105070721 -> 20261105094515
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261105070721 (then 02-rebrand.sql) to version 20261105094515.
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

CREATE TABLE "company_os"."legal_entities_sensitive" (
  "legal_entity_id"     uuid                     NOT NULL,
  "bank_name"           text                     NOT NULL,
  "bank_account_number" text                     NOT NULL,
  "bank_account_holder" text                     NOT NULL,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "legal_entities_sensitive_bank_account_holder_check" CHECK ((btrim(bank_account_holder) <> ''::text)),
  CONSTRAINT "legal_entities_sensitive_bank_account_number_check" CHECK ((btrim(bank_account_number) <> ''::text)),
  CONSTRAINT "legal_entities_sensitive_bank_name_check" CHECK ((btrim(bank_name) <> ''::text)),
  CONSTRAINT "legal_entities_sensitive_pkey" PRIMARY KEY (legal_entity_id)
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."legal_entities_sensitive" FROM "chatbot_reader", "chatbot_writer";

ALTER TABLE "company_os"."legal_entities_sensitive"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "company_os"."legal_entities_sensitive"
  ADD CONSTRAINT "legal_entities_sensitive_legal_entity_id_fkey" FOREIGN KEY (legal_entity_id) REFERENCES company_os.legal_entities(id) ON DELETE RESTRICT;

CREATE TRIGGER legal_entities_sensitive_updated_at
  BEFORE UPDATE ON company_os.legal_entities_sensitive
  FOR EACH ROW
  EXECUTE FUNCTION company_os.handle_updated_at();

COMMENT ON COLUMN "company_os"."legal_entities_sensitive"."bank_account_holder" IS 'The account holder''s name exactly as the bank has it.';

COMMENT ON COLUMN "company_os"."legal_entities_sensitive"."bank_account_number" IS 'The company''s account number.';

COMMENT ON COLUMN "company_os"."legal_entities_sensitive"."bank_name" IS 'The bank the company receives money at.';

COMMENT ON COLUMN "company_os"."legal_entities_sensitive"."created_at" IS 'When the account was first entered.';

COMMENT ON COLUMN "company_os"."legal_entities_sensitive"."legal_entity_id" IS 'Primary key and FK to legal_entities; one account per company, kept if someone tries to remove the company.';

COMMENT ON COLUMN "company_os"."legal_entities_sensitive"."updated_at" IS 'When the account last changed.';

COMMENT ON TABLE "company_os"."legal_entities_sensitive" IS 'One row is: one of our legal entities'' bank account, split from `legal_entities` so the assistants, which may read that table, can never see it. [master · People & org structure | tier 3 support | active]';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "company_os"."legal_entities_sensitive" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "company_os"."legal_entities_sensitive" TO "service_role";

-- Added by hand, because the diff engine does not carry a sequence's grants: the upstream
-- migration took this default grant back, and a fresh install no longer has it.
REVOKE ALL ON SEQUENCE "company_os"."reimbursement_advances_ref_no_seq" FROM "chatbot_writer";
