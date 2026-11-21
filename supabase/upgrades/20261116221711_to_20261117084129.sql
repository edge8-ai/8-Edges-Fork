-- fork-schema-upgrade: 20261116221711 -> 20261117084129
-- Written by hand, not by scripts/gen-fork-schema.mjs: the generator's delta
-- step needs two throwaway Docker databases, which the authoring machine could
-- not run. It is the generator's own fallback ("fix the delta by hand, prove
-- it"), and CI's fork job proves it: it replays the baseline plus every delta
-- and requires a pg_dump equal to a fresh install of 01-schema.sql version
-- 20261117084129. It takes a database built from version 20261116221711 (then
-- 02-rebrand.sql) to that version. Apply with scripts/fork-upgrade.sh, which
-- runs it in one transaction and records the new version; README Step 3b.
--
-- What changed upstream (migration 20261117060000_mcp_tool_calls_and_planned_actions,
-- OC.0): two new tables for the connector, company_os.mcp_planned_actions and
-- company_os.mcp_tool_calls, with their keys, indexes, the house updated_at
-- trigger, row level security and service-role grants. No existing table,
-- column, row or grant changes. The statements below are the added lines of
-- the regenerated 01-schema.sql, in its order, so a replay builds exactly what a
-- fresh install builds.



--
-- Name: mcp_planned_actions; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."mcp_planned_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "tool" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "change" "jsonb" NOT NULL,
    "run_at" timestamp with time zone NOT NULL,
    "state" "text" DEFAULT 'planned'::"text" NOT NULL,
    "cancelled_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancel_reason" "text",
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "result" "jsonb",
    "error" "text",
    CONSTRAINT "mcp_planned_actions_cancel_recorded" CHECK ((("state" <> 'cancelled'::"text") OR (("cancelled_by" IS NOT NULL) AND ("cancelled_at" IS NOT NULL)))),
    CONSTRAINT "mcp_planned_actions_client_id_check" CHECK (("btrim"("client_id") <> ''::"text")),
    CONSTRAINT "mcp_planned_actions_runs_after_planning" CHECK (("run_at" >= "created_at")),
    CONSTRAINT "mcp_planned_actions_start_recorded" CHECK ((("state" <> ALL (ARRAY['running'::"text", 'done'::"text", 'failed'::"text"])) OR ("started_at" IS NOT NULL))),
    CONSTRAINT "mcp_planned_actions_state_check" CHECK (("state" = ANY (ARRAY['planned'::"text", 'running'::"text", 'done'::"text", 'cancelled'::"text", 'failed'::"text"]))),
    CONSTRAINT "mcp_planned_actions_summary_check" CHECK ((("btrim"("summary") <> ''::"text") AND ("char_length"("summary") <= 500))),
    CONSTRAINT "mcp_planned_actions_tool_check" CHECK (("btrim"("tool") <> ''::"text"))
);


--
-- Name: TABLE "mcp_planned_actions"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."mcp_planned_actions" IS 'One row is: one high-risk write a person asked for through the Edge8 connector (an approval, a payment run, an email, a candidate rejection or message, a deal closed), held for a short time so a person can cancel it, then run by itself as the person who asked. [transactional · People operations | tier 3 support | active]';


--
-- Name: COLUMN "mcp_planned_actions"."id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."id" IS 'Primary key.';

--
-- Name: COLUMN "mcp_planned_actions"."created_at"; Type: COMMENT; Schema: company_os; Owner: -
--
COMMENT ON COLUMN "company_os"."mcp_planned_actions"."created_at" IS 'When the action was planned.';


-- Name: COLUMN "mcp_planned_actions"."updated_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."updated_at" IS 'When the row last changed; maintained by a trigger.';


--
-- Name: COLUMN "mcp_planned_actions"."person_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."person_id" IS 'The person who asked, and the person the action runs as, referencing people.id.';


--
-- Name: COLUMN "mcp_planned_actions"."client_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."client_id" IS 'The OAuth client (the app) that asked, as Supabase Auth names it.';


--
-- Name: COLUMN "mcp_planned_actions"."tool"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."tool" IS 'The connector tool that planned it (e.g. decide_leave, send_email); the routine runs that tool''s command.';


--
-- Name: COLUMN "mcp_planned_actions"."summary"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."summary" IS 'The one line the notice and the cancel page show, e.g. Approve Minh''s annual leave, 22 to 24 Dec (3 days). At most 500 characters.';


--
-- Name: COLUMN "mcp_planned_actions"."change"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."change" IS 'The exact, already validated input the command will run with. Fixed once planned: the routine runs what is here and nothing else.';


--
-- Name: COLUMN "mcp_planned_actions"."run_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."run_at" IS 'When the action runs if nobody cancels it: the planning time plus the tool''s hold.';


--
-- Name: COLUMN "mcp_planned_actions"."state"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."state" IS 'Where the action stands. Valid values: [planned, running, done, cancelled, failed]. running is set by the routine''s claim, so a row runs at most once.';


--
-- Name: COLUMN "mcp_planned_actions"."cancelled_by"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."cancelled_by" IS 'Who cancelled it, referencing people.id; set with cancelled_at.';


--
-- Name: COLUMN "mcp_planned_actions"."cancelled_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."cancelled_at" IS 'When it was cancelled.';


--
-- Name: COLUMN "mcp_planned_actions"."cancel_reason"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."cancel_reason" IS 'The note the person who cancelled gave, when they gave one.';


--
-- Name: COLUMN "mcp_planned_actions"."started_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."started_at" IS 'When the routine claimed it.';


--
-- Name: COLUMN "mcp_planned_actions"."finished_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."finished_at" IS 'When the command answered, done or failed.';


--
-- Name: COLUMN "mcp_planned_actions"."result"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."result" IS 'What the command answered when it succeeded (the ids it wrote), never a message body.';


--
-- Name: COLUMN "mcp_planned_actions"."error"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_planned_actions"."error" IS 'Why the command refused or failed, when state is failed.';


--
-- Name: mcp_tool_calls; Type: TABLE; Schema: company_os; Owner: -
--

CREATE TABLE "company_os"."mcp_tool_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "office" "text",
    "tool" "text" NOT NULL,
    "subject_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "result_count" integer,
    "outcome" "text" NOT NULL,
    "planned_action_id" "uuid",
    "latency_ms" integer NOT NULL,
    CONSTRAINT "mcp_tool_calls_client_id_check" CHECK (("btrim"("client_id") <> ''::"text")),
    CONSTRAINT "mcp_tool_calls_latency_ms_check" CHECK (("latency_ms" >= 0)),
    CONSTRAINT "mcp_tool_calls_outcome_check" CHECK (("outcome" = ANY (ARRAY['ok'::"text", 'refused'::"text", 'planned'::"text", 'invalid'::"text", 'error'::"text"]))),
    CONSTRAINT "mcp_tool_calls_planned_names_its_action" CHECK ((("outcome" = 'planned'::"text") = ("planned_action_id" IS NOT NULL))),
    CONSTRAINT "mcp_tool_calls_result_count_check" CHECK (("result_count" >= 0)),
    CONSTRAINT "mcp_tool_calls_tool_check" CHECK (("btrim"("tool") <> ''::"text"))
);


--
-- Name: TABLE "mcp_tool_calls"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON TABLE "company_os"."mcp_tool_calls" IS 'One row is: one tool call made through the Edge8 connector (edge8.ai/api/mcp) by one person from one app, read or write, with what it was asked for by id and how it ended, never what it returned. [other · Logs, audit & telemetry | tier 3 support | active]';


--
-- Name: COLUMN "mcp_tool_calls"."id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_tool_calls"."id" IS 'Primary key.';


--
-- Name: COLUMN "mcp_tool_calls"."created_at"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_tool_calls"."created_at" IS 'When the call was answered (row insert time).';


--
-- Name: COLUMN "mcp_tool_calls"."person_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_tool_calls"."person_id" IS 'The person the connector token belongs to, the person the call ran as, referencing people.id.';


--
-- Name: COLUMN "mcp_tool_calls"."client_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_tool_calls"."client_id" IS 'The OAuth client (the app: Claude, ChatGPT, Grok, Cursor) the token was issued to, as Supabase Auth names it.';


--
-- Name: COLUMN "mcp_tool_calls"."office"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_tool_calls"."office" IS 'The office filter the connection was made with (edge8.ai/api/mcp?office=…); null when none.';


--
-- Name: COLUMN "mcp_tool_calls"."tool"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_tool_calls"."tool" IS 'The tool''s name as tools/list gives it (e.g. my_leave, decide_leave).';


--
-- Name: COLUMN "mcp_tool_calls"."subject_ids"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_tool_calls"."subject_ids" IS 'The record ids the call named in its input (a leave request, a claim, a person), in the order given; empty when it named none. Ids only, never names or text.';


--
-- Name: COLUMN "mcp_tool_calls"."result_count"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_tool_calls"."result_count" IS 'How many records the call returned; null for a write or a call that returned none by its nature.';


--
-- Name: COLUMN "mcp_tool_calls"."outcome"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_tool_calls"."outcome" IS 'How the call ended. Valid values: [ok, refused, planned, invalid, error]. refused means the person lacks the tool''s permission or the record is outside their reach; planned means the write was held as a planned action; invalid means the input failed validation.';


--
-- Name: COLUMN "mcp_tool_calls"."planned_action_id"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_tool_calls"."planned_action_id" IS 'The mcp_planned_actions row the call created, when outcome is planned.';


--
-- Name: COLUMN "mcp_tool_calls"."latency_ms"; Type: COMMENT; Schema: company_os; Owner: -
--

COMMENT ON COLUMN "company_os"."mcp_tool_calls"."latency_ms" IS 'Wall-clock milliseconds from receiving the call to answering it.';


--
-- Name: mcp_planned_actions mcp_planned_actions_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."mcp_planned_actions"
    ADD CONSTRAINT "mcp_planned_actions_pkey" PRIMARY KEY ("id");


--
-- Name: mcp_tool_calls mcp_tool_calls_pkey; Type: CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."mcp_tool_calls"
    ADD CONSTRAINT "mcp_tool_calls_pkey" PRIMARY KEY ("id");


--
-- Name: mcp_planned_actions_by_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "mcp_planned_actions_by_person" ON "company_os"."mcp_planned_actions" USING "btree" ("person_id", "created_at");


--
-- Name: mcp_planned_actions_due; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "mcp_planned_actions_due" ON "company_os"."mcp_planned_actions" USING "btree" ("run_at") WHERE ("state" = 'planned'::"text");


--
-- Name: mcp_tool_calls_by_client; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "mcp_tool_calls_by_client" ON "company_os"."mcp_tool_calls" USING "btree" ("client_id", "created_at");


--
-- Name: mcp_tool_calls_by_person; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "mcp_tool_calls_by_person" ON "company_os"."mcp_tool_calls" USING "btree" ("person_id", "created_at");


--
-- Name: mcp_tool_calls_by_tool; Type: INDEX; Schema: company_os; Owner: -
--

CREATE INDEX "mcp_tool_calls_by_tool" ON "company_os"."mcp_tool_calls" USING "btree" ("tool", "created_at");


--
-- Name: mcp_planned_actions set_updated_at; Type: TRIGGER; Schema: company_os; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "company_os"."mcp_planned_actions" FOR EACH ROW EXECUTE FUNCTION "company_os"."handle_updated_at"();


--


--
-- Name: mcp_planned_actions mcp_planned_actions_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."mcp_planned_actions"
    ADD CONSTRAINT "mcp_planned_actions_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "company_os"."people"("id");


--
-- Name: mcp_planned_actions mcp_planned_actions_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--
ALTER TABLE ONLY "company_os"."mcp_planned_actions"
    ADD CONSTRAINT "mcp_planned_actions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");

-- Name: mcp_tool_calls mcp_tool_calls_person_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."mcp_tool_calls"
    ADD CONSTRAINT "mcp_tool_calls_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "company_os"."people"("id");


--
-- Name: mcp_tool_calls mcp_tool_calls_planned_action_id_fkey; Type: FK CONSTRAINT; Schema: company_os; Owner: -
--

ALTER TABLE ONLY "company_os"."mcp_tool_calls"
    ADD CONSTRAINT "mcp_tool_calls_planned_action_id_fkey" FOREIGN KEY ("planned_action_id") REFERENCES "company_os"."mcp_planned_actions"("id");


--
-- Name: mcp_planned_actions; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."mcp_planned_actions" ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_tool_calls; Type: ROW SECURITY; Schema: company_os; Owner: -
--

ALTER TABLE "company_os"."mcp_tool_calls" ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE "mcp_planned_actions"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE "company_os"."mcp_planned_actions" TO "service_role";


--
-- Name: TABLE "mcp_tool_calls"; Type: ACL; Schema: company_os; Owner: -
--

GRANT SELECT,INSERT ON TABLE "company_os"."mcp_tool_calls" TO "service_role";


--

-- The schema's default privileges grant the assistants' SQL roles every table
-- created after them. A fresh install creates these tables before it sets those
-- defaults, so it has no such grants, and the migration took them back by name.
-- An upgraded database creates the tables after the defaults exist, so it takes
-- them back here; revoking a privilege a role does not hold changes nothing.
REVOKE ALL ON TABLE "company_os"."mcp_planned_actions" FROM "chatbot_reader", "chatbot_writer", "team_chatbot_reader";
REVOKE ALL ON TABLE "company_os"."mcp_tool_calls" FROM "chatbot_reader", "chatbot_writer", "team_chatbot_reader";
