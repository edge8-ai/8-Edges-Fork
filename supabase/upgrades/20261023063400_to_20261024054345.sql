-- fork-schema-upgrade: 20261023063400 -> 20261024054345
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261023063400 (then 02-rebrand.sql) to version 20261024054345.
-- Apply with scripts/fork-upgrade.sh, which runs it in one transaction and
-- records the new version; README Step 3b. Reference data is not here: a fresh
-- install inserts it once, and an upgraded database keeps its own rows.
--

CREATE TABLE "company_os"."pnl_monthly_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity" "text" NOT NULL,
    "month" "date" NOT NULL,
    "section" "text" NOT NULL,
    "source" "text" DEFAULT 'quickbooks'::"text" NOT NULL,
    "external_id" "text" NOT NULL,
    "parent_external_id" "text",
    "account_name" "text" NOT NULL,
    "position" integer NOT NULL,
    "amount_cents" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pnl_monthly_lines_entity_check" CHECK (("entity" = ANY (ARRAY['edge8'::"text", 'aio'::"text"]))),
    CONSTRAINT "pnl_monthly_lines_month_check" CHECK (("month" = ("date_trunc"('month'::"text", ("month")::timestamp with time zone))::"date")),
    CONSTRAINT "pnl_monthly_lines_section_check" CHECK (("section" = ANY (ARRAY['income'::"text", 'cogs'::"text", 'expense'::"text", 'other_income'::"text", 'other_expense'::"text"])))
);

-- The default privileges in 01-schema.sql would grant this new table more than production's has; the grants the dump lists follow below.
REVOKE ALL ON TABLE "company_os"."pnl_monthly_lines" FROM "chatbot_reader", "chatbot_writer";

COMMENT ON TABLE "company_os"."pnl_monthly_lines" IS 'One row is: one QuickBooks account''s amount in one month of one of our companies'' Profit and Loss, mirrored from the QuickBooks report on the accrual basis. [transactional · Spend | tier 3 support | waiting]';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."id" IS 'Primary key.';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."entity" IS 'Which QuickBooks company the line is from, the id of its row in qbo_connection. edge8 is the deployment''s own company. Valid values: [edge8, aio]';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."month" IS 'The first day of the month the amount covers. Unique with entity and external_id; a sync overwrites it.';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."section" IS 'The part of the statement the account sits in, as QuickBooks groups it. Valid values: [income, cogs, expense, other_income, other_expense]';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."source" IS 'The system the line is mirrored from; QuickBooks is the system of record.';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."external_id" IS 'The QuickBooks account id. Stable when an account is renamed, so a rename updates account_name on the next sync.';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."parent_external_id" IS 'The QuickBooks account id of the parent account when this is a sub-account (Staffing Contractor VN under Contract Labor Costs); null for a top-level account.';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."account_name" IS 'The account name as the report shows it at the last sync.';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."position" IS 'The account''s row order in the report, so the statement reads in the order QuickBooks prints it.';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."amount_cents" IS 'The account''s own amount for the month in cents, without its sub-accounts. Zero when the account had no activity or dropped out of the report.';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."currency" IS 'The QuickBooks company''s home currency.';

COMMENT ON COLUMN "company_os"."pnl_monthly_lines"."synced_at" IS 'When the sync last wrote this row.';

ALTER TABLE ONLY "company_os"."pnl_monthly_lines"
    ADD CONSTRAINT "pnl_monthly_lines_entity_month_external_id_key" UNIQUE ("entity", "month", "external_id");

ALTER TABLE ONLY "company_os"."pnl_monthly_lines"
    ADD CONSTRAINT "pnl_monthly_lines_pkey" PRIMARY KEY ("id");

CREATE INDEX "pnl_monthly_lines_entity_month_idx" ON "company_os"."pnl_monthly_lines" USING "btree" ("entity", "month" DESC);

ALTER TABLE "company_os"."pnl_monthly_lines" ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."pnl_monthly_lines" TO "service_role";
