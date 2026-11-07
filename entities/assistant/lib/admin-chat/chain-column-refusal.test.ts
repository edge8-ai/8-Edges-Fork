import { describe, expect, it, vi } from "vitest";

const unsafe = vi.hoisted(() => vi.fn());
vi.mock("postgres", () => ({ default: vi.fn(() => ({ unsafe, begin: vi.fn() })) }));
import {
  ACTION_ITEM_FILING_MESSAGE,
  APPLICATION_DECISION_MESSAGE,
  ROUTINE_RUNS_MESSAGE,
  chainColumnRefusal,
  runApprovedWrite,
} from "./db";

// Migration 20261010050000 took chatbot_writer off the columns the Z.9 and Z.13
// chains own and off routine_runs. A write naming one would fail with a bare
// "permission denied" after the admin approved it, so it is refused by name first.
describe("chainColumnRefusal", () => {
  const refused: [string, string][] = [
    ["update company_os.applications set status = 'hired' where id = 'x'", APPLICATION_DECISION_MESSAGE],
    ["UPDATE applications SET rejection_reason = 'fit', decided_at = now() WHERE id = 'x'", APPLICATION_DECISION_MESSAGE],
    ['update "company_os"."applications" set "chain_step" = \'hr\' where id = \'x\'', APPLICATION_DECISION_MESSAGE],
    ["update only company_os.applications set ai_rating = 4 where id = 'x'", APPLICATION_DECISION_MESSAGE],
    ["update /*c*/ company_os.applications as a set ai_screen_flags = '{}' where a.id = 'x'", APPLICATION_DECISION_MESSAGE],
    ["update company_os.applications set (rating, status) = (3, 'rejected') where id = 'x'", APPLICATION_DECISION_MESSAGE],
    ["update company_os.applications set chain_proposal = null, chain_error = null where id = 'x'", APPLICATION_DECISION_MESSAGE],
    ["insert into company_os.applications (person_id, job_requisition_id, status) values ('p', 'j', 'active')", APPLICATION_DECISION_MESSAGE],
    ["insert into company_os.applications (person_id, ai_summary) values ('p', '{}')", APPLICATION_DECISION_MESSAGE],
    [
      "insert into company_os.applications (id, rating) values ('x', 3) on conflict (id) do update set status = excluded.status returning id",
      APPLICATION_DECISION_MESSAGE,
    ],
    ["update company_os.meeting_action_items set file_state = 'to_file' where id = 'x'", ACTION_ITEM_FILING_MESSAGE],
    ["update company_os.meeting_action_items set title = 'T', task_id = 't' where id = 'x'", ACTION_ITEM_FILING_MESSAGE],
    ["insert into meeting_action_items (meeting_id, title, shadow_mark) values ('m', 't', 'x')", ACTION_ITEM_FILING_MESSAGE],
    ["update company_os.meeting_action_items set file_note = 'n' where id = 'x'", ACTION_ITEM_FILING_MESSAGE],
    ["insert into company_os.routine_runs (routine, status) values ('r', 'ok')", ROUTINE_RUNS_MESSAGE],
    ["update company_os.routine_runs set status = 'ok' where id = 'x'", ROUTINE_RUNS_MESSAGE],
    ['insert into "routine_runs" select * from company_os.routine_runs', ROUTINE_RUNS_MESSAGE],
  ];
  const allowed = [
    // The assistant keeps its ordinary edits on these tables.
    "update company_os.applications set rating = 4, current_stage_id = 's' where id = 'x'",
    "update company_os.applications set archived_at = now() where id = 'x'",
    // A WHERE or RETURNING that names a chain column is not a write to it.
    "update company_os.applications set rating = 2 where status = 'active' and id = 'x' returning id, status",
    // A string value that spells a column name is not the column.
    "update company_os.applications set metadata = '{\"status\": \"note\"}' where id = 'x'",
    "insert into company_os.applications (person_id, job_requisition_id, source) values ('p', 'j', 'status')",
    "update company_os.meeting_action_items set title = 'T', status = 'done' where id = 'x'",
    "insert into company_os.meeting_action_items (meeting_id, title) values ('m', 't')",
    // Other tables that share a column name, or a name prefix, are untouched.
    "update company_os.deal_notes set status = 'x' where id = 'y'",
    "update company_os.tasks set task_id = 'x' where id = 'y'",
    "update company_os.routines set status = 'paused' where id = 'x'",
    "insert into company_os.applications_archive (status) values ('x')",
    // Reading the run log inside a write is still allowed.
    "update company_os.tasks set notes = (select status from company_os.routine_runs limit 1) where id = 'x'",
  ];
  for (const [q, message] of refused) it(`refuses: ${q}`, () => expect(chainColumnRefusal(q)).toBe(message));
  for (const q of allowed) it(`allows: ${q}`, () => expect(chainColumnRefusal(q)).toBeNull());
});

describe("runApprovedWrite", () => {
  it("refuses a chain-owned column before it reaches the database", async () => {
    vi.stubEnv("CHATBOT_WRITE_DB_URL", "postgres://writer@localhost:6543/db");
    const res = await runApprovedWrite("update company_os.applications set status = 'hired' where id = 'x' returning id");
    expect(res).toEqual({ ok: false, error: APPLICATION_DECISION_MESSAGE });
    expect(unsafe).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
