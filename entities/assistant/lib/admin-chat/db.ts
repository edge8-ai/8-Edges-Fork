// Server-only. Restricted SQL executors for the admin database assistant.
//
// Reads run through the dedicated `chatbot_reader` Postgres role
// (supabase/migrations/20260715120000_admin_chatbot_reader.sql), which has
// USAGE on company_os only and no write grants anywhere. Defense in depth,
// each layer independently sufficient:
//   1. validation in ../read-executor.ts (single SELECT/WITH statement only)
//   2. structural wrap: the query runs as a subquery, so DML cannot escape
//   3. the extended protocol rejects multi-statement strings
//   4. the role's grants make writes, DDL, and other schemas impossible at the
//      database layer regardless of the SQL text
//   5. role-level statement_timeout of 5s
//
// Writes (privileged admins only, each statement individually approved in the
// chat UI — see app/api/admin/chat/route.ts) run through `chatbot_writer`
// (supabase/migrations/20260718200000_admin_chatbot_writer.sql): INSERT and
// UPDATE on company_os only, no DELETE grant anywhere, people_sensitive
// revoked, same 5s timeout; since 20261010050000 it also lacks the columns the
// hiring and meeting chains own and every write on routine_runs (see
// chainColumnRefusal). Validation here (single INSERT/UPDATE statement,
// UPDATE must have WHERE) narrows what the model can even propose; the role's
// grants remain the hard boundary.
//
// NEVER import from a client component.

import postgres from "postgres";
import { forecastLossError, type ForecastDealRow, type StageRow } from "@/entities/crm";
import { BLOCKED_SCHEMA, MAX_QUERY_CHARS, makeReadExecutor } from "../read-executor";

// Confidential company_os tables the assistant must never read or write. The
// DB grants already close these (no reader/writer policies + revoked grants),
// but reject by name too so the model gets a clear message instead of a bare
// permission error. people_sensitive = PII; compensation_sensitive and the
// payroll_*_sensitive tables = real pay data.
const BLOCKED_TABLES = /\b(?:people_sensitive|compensation_sensitive|compensation|payroll_runs_sensitive|payroll_lines_sensitive)\b/i;

const BLOCKED_TABLES_MESSAGE =
  "people_sensitive, compensation_sensitive and the payroll tables are off-limits to the assistant.";

// A deal is closed by moving it on the pipeline board, never by writing its
// stage or status: the database keeps the status and the stage log in step
// either way (ADR-0011), but only the board's move tells the owner, opens the
// client's delivery boards on a win and moves the person's lead. Only the SET
// clause is read, so a WHERE that filters on status still passes.
export const DEAL_CLOSE_MESSAGE =
  "Move the deal on the pipeline board instead. Closing a deal opens the client's delivery boards and tells the owner, which a direct write would skip.";

export function dealCloseRefusal(statement: string): string | null {
  // Any mention of the three columns counts, which also catches SET (a, b) = (...).
  const set = dealsSetClause(statement);
  return set !== null && /\b(?:stage_id|status|closed_at)\b/i.test(set) ? DEAL_CLOSE_MESSAGE : null;
}

function dealsSetClause(statement: string): string | null {
  return updateSetClause(statement, "deals");
}

function stripComments(statement: string): string {
  return statement.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

// `company_os.<table>`, optionally schema-qualified and quoted, as a regex source.
const tableName = (table: string) => `(?:"?company_os"?\\s*\\.\\s*)?"?${table}"?`;

// The SET clause of an UPDATE on company_os.<table>, or null for any other
// statement. Comments are stripped first, so a /* note */ cannot hide the
// target or a column; UPDATE ONLY and an alias are allowed for. The clause runs
// to the LAST where, so a subquery inside SET cannot end it early, and a WHERE
// that filters on a column stays outside it.
function updateSetClause(statement: string, table: string): string | null {
  const q = stripComments(statement);
  if (!new RegExp(`^\\s*update\\s+(?:only\\s+)?${tableName(table)}(?:\\s|$)`, "i").test(q)) return null;
  const setAt = q.search(/\bset\b/i);
  if (setAt < 0) return null;
  const whereAt = q.toLowerCase().lastIndexOf("where");
  return q.slice(setAt, whereAt > setAt ? whereAt : undefined);
}

// The columns an INSERT into company_os.<table> names, plus the SET clause of
// an ON CONFLICT ... DO UPDATE, or null for any other statement. An INSERT with
// no column list names nothing here; the database's column grants still decide it.
function insertWrittenColumns(statement: string, table: string): string | null {
  const q = stripComments(statement);
  const target = new RegExp(`^\\s*insert\\s+into\\s+${tableName(table)}(?=[\\s(]|$)(?:\\s+as\\s+\\w+)?\\s*(\\(([^)]*)\\))?`, "i").exec(q);
  if (!target) return null;
  const columns = target[2] ?? "";
  const doUpdate = q.search(/\bdo\s+update\s+set\b/i);
  if (doUpdate < 0) return columns;
  const rest = q.slice(doUpdate);
  const end = Math.max(rest.toLowerCase().lastIndexOf("where"), rest.toLowerCase().lastIndexOf("returning"));
  return `${columns} ${rest.slice(0, end > 0 ? end : undefined)}`;
}

// The text of the columns a write on company_os.<table> sets, or null when the
// statement does not write that table. String literals are blanked so a value
// such as metadata = '{"status": "x"}' is not read as the column.
function writtenColumns(statement: string, table: string): string | null {
  const text = updateSetClause(statement, table) ?? insertWrittenColumns(statement, table);
  return text === null ? null : text.replace(/'(?:[^']|'')*'/g, "''");
}

// Columns and tables the chains own (migration 20261010050000): chatbot_writer
// lost its grants on them, so a write that names one fails with a bare
// "permission denied" after the admin has already approved it. Refuse it here
// with where to do it instead.
export const APPLICATION_DECISION_MESSAGE =
  "A candidate's status, decided_at and rejection_reason, the Z.9 chain's columns and the AI-screen columns are read-only for the assistant. Hire, reject or keep a candidate for future consideration in the hiring screens (/admin/talent/applications) or through the Z.9 chain.";

export const ACTION_ITEM_FILING_MESSAGE =
  "Filing a meeting action item as a card belongs to the Z.13 chain: file_state, file_note, task_id and shadow_mark are read-only for the assistant.";

export const ROUTINE_RUNS_MESSAGE =
  "The routine run log (routine_runs) is written only by the routines themselves; the assistant can read it but not write it.";

const APPLICATION_CHAIN_COLUMNS =
  /\b(?:status|decided_at|rejection_reason|chain_step|chain_started_at|chain_error|chain_proposal|ai_summary|ai_rating|ai_screen_status|ai_screen_error|ai_screened_at|ai_model|ai_screen_flags)\b/i;

const ACTION_ITEM_FILING_COLUMNS = /\b(?:file_state|file_note|task_id|shadow_mark)\b/i;

export function chainColumnRefusal(statement: string): string | null {
  if (writtenColumns(statement, "routine_runs") !== null) return ROUTINE_RUNS_MESSAGE;
  const application = writtenColumns(statement, "applications");
  if (application !== null && APPLICATION_CHAIN_COLUMNS.test(application)) return APPLICATION_DECISION_MESSAGE;
  const actionItem = writtenColumns(statement, "meeting_action_items");
  if (actionItem !== null && ACTION_ITEM_FILING_COLUMNS.test(actionItem)) return ACTION_ITEM_FILING_MESSAGE;
  return null;
}

// Whether the statement writes a deal's forecast inputs. The text only decides
// whether to check: what the statement actually did is judged afterwards, from
// the rows, because a value spelled (select null) or 0 * x reads as anything.
function writesForecastInputs(statement: string): boolean {
  const set = dealsSetClause(statement);
  return set !== null && /\b(?:amount_cents|expected_close_date)\b/i.test(set);
}

// Thrown inside the transaction to roll it back; carries the refusal.
class ForecastLoss extends Error {}

const FORECAST_SNAPSHOT = "select id, stage_id, amount_cents, expected_close_date from company_os.deals where stage_id is not null";

// A deal at Proposal or later keeps its amount and close date (R.23): the deal
// page and the bulk editor refuse an edit that clears one, and this is the same
// rule for the assistant. The statement runs between two snapshots of the deals
// in one transaction, and a deal that lost an input rolls the whole of it back.
async function runForecastGuardedWrite(sql: ReturnType<typeof postgres>, q: string) {
  return sql.begin(async (tx) => {
    const stages = (await tx.unsafe("select id, name, position, is_won, is_lost from company_os.pipeline_stages")) as unknown as StageRow[];
    const before = (await tx.unsafe(FORECAST_SNAPSHOT)) as unknown as ForecastDealRow[];
    const rows = await tx.unsafe(q);
    const after = (await tx.unsafe(FORECAST_SNAPSHOT)) as unknown as ForecastDealRow[];
    const loss = forecastLossError(stages, before, after);
    if (loss) throw new ForecastLoss(loss);
    return rows;
  });
}

export const runReadOnlyQuery = makeReadExecutor({
  envVar: "CHATBOT_DB_URL",
  logPrefix: "admin-chat/db",
  poolMax: 3,
  blocked: { pattern: BLOCKED_TABLES, message: BLOCKED_TABLES_MESSAGE },
});

// Module-level singleton for the writer role. The URL points at the Supavisor
// transaction pooler (port 6543) as chatbot_writer; prepare:false is required
// in transaction-pool mode.
let writeClient: ReturnType<typeof postgres> | null = null;

function getWriteClient(): ReturnType<typeof postgres> | null {
  if (writeClient) return writeClient;
  const url = process.env.CHATBOT_WRITE_DB_URL;
  if (!url) {
    console.warn("admin-chat/db: CHATBOT_WRITE_DB_URL is not set; assistant writes disabled");
    return null;
  }
  writeClient = postgres(url, { max: 2, prepare: false, idle_timeout: 20 });
  return writeClient;
}

const MAX_RETURNED_ROWS = 50;

export type WriteResult =
  | {
      ok: true;
      command: "insert" | "update";
      affectedRows: number;
      rows: Record<string, unknown>[];
    }
  | { ok: false; error: string };

// Validates and runs one admin-approved INSERT or UPDATE as chatbot_writer.
// Only ever called after the privileged admin clicked Approve in the chat UI.
export async function runApprovedWrite(query: string): Promise<WriteResult> {
  const sql = getWriteClient();
  if (!sql) return { ok: false, error: "Database write access is not configured" };

  let q = query.trim();
  if (q.endsWith(";")) q = q.slice(0, -1).trimEnd();

  if (!q) return { ok: false, error: "Empty statement" };
  if (q.length > MAX_QUERY_CHARS) {
    return { ok: false, error: `Statement too long (max ${MAX_QUERY_CHARS} chars)` };
  }
  if (q.includes(";")) {
    return { ok: false, error: "Only a single statement is allowed (no semicolons)" };
  }
  const command = /^\s*insert\b/i.test(q)
    ? ("insert" as const)
    : /^\s*update\b/i.test(q)
      ? ("update" as const)
      : null;
  if (!command) {
    return {
      ok: false,
      error:
        "Only a single INSERT or UPDATE statement is allowed. There is no DELETE: archive rows by setting archived_at instead.",
    };
  }
  // No unqualified UPDATE: a missing WHERE would rewrite the whole table. This
  // is an app-layer guard on the blast radius, not a security boundary.
  if (command === "update" && !/\bwhere\b/i.test(q)) {
    return { ok: false, error: "UPDATE must have a WHERE clause." };
  }
  if (BLOCKED_SCHEMA.test(q)) {
    return { ok: false, error: "Statements may only reference the company_os schema." };
  }
  // The role has no grants on people_sensitive or compensation_sensitive; reject by name
  // too so the model gets a clear message instead of a bare permission error.
  if (BLOCKED_TABLES.test(q)) {
    return { ok: false, error: BLOCKED_TABLES_MESSAGE };
  }
  const dealClose = dealCloseRefusal(q);
  if (dealClose) return { ok: false, error: dealClose };
  const chainColumn = chainColumnRefusal(q);
  if (chainColumn) return { ok: false, error: chainColumn };

  try {
    const rows = writesForecastInputs(q) ? await runForecastGuardedWrite(sql, q) : await sql.unsafe(q);
    return {
      ok: true,
      command,
      // postgres.js exposes the DML-affected row count on the result array.
      affectedRows: rows.count ?? rows.length,
      rows: rows.slice(0, MAX_RETURNED_ROWS) as unknown as Record<string, unknown>[],
    };
  } catch (err) {
    if (err instanceof ForecastLoss) return { ok: false, error: err.message };
    return { ok: false, error: (err as Error).message ?? "Statement failed" };
  }
}
