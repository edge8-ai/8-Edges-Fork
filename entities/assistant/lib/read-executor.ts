// Server-only. The shared restricted read executor behind both database
// assistants (admin-chat and team-chat).
//
// The two assistants differ only in which Postgres role they connect as and
// which tables they name as off-limits; the validation ladder, the row cap, the
// subquery wrap and the error strings are identical, and they must stay
// identical because they are a security boundary. Keeping one copy is what
// keeps them from drifting apart — a rule that loosened on one side but not the
// other is exactly the failure this module exists to prevent.
//
// Defense in depth, each layer independently sufficient:
//   1. this validator (single statement, SELECT/WITH only, length cap)
//   2. the blocked-schema and blocked-table rejections below
//   3. the subquery wrap with a server-side LIMIT
//   4. the connecting role's grants, which are the hard boundary
//
// NEVER import from a client component.

import postgres from "postgres";

const MAX_ROWS = 200;
export const MAX_QUERY_CHARS = 8_000;

// Schema-qualified references an assistant is never allowed to make. Matches a
// blocked schema name immediately followed by a dot + identifier (so a column
// like `auth_user_id` or an unrelated word is not caught). information_schema
// and pg_catalog are intentionally allowed — the model uses them to introspect.
export const BLOCKED_SCHEMA =
  /\b(?:auth|storage|vault|cron|net|extensions|realtime|private|supabase_migrations|company_os_archive|agents)\s*\.\s*"?[a-z_]/i;

export type QueryResult =
  | { ok: true; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean }
  | { ok: false; error: string };

export type ValidatedQuery = { ok: true; sql: string } | { ok: false; error: string };

export type BlockedTables = {
  /** Confidential tables the assistant must never touch, matched by name. */
  pattern: RegExp;
  /** The message the model sees when `pattern` matches; it is what teaches the
   *  model to answer from the tables it can read instead of retrying. */
  message: string;
};

/**
 * The pure half of the executor: normalise the query text and run the ladder of
 * app-layer rejections. Returns the normalised SQL (trailing semicolon and
 * surrounding whitespace removed) or the exact error string the assistant shows
 * the model. Every string here is part of the security contract; pinned by
 * read-executor.test.ts.
 */
export function validateReadQuery(query: string, blocked: BlockedTables): ValidatedQuery {
  let q = query.trim();
  if (q.endsWith(";")) q = q.slice(0, -1).trimEnd();

  if (!q) return { ok: false, error: "Empty query" };
  if (q.length > MAX_QUERY_CHARS) {
    return { ok: false, error: `Query too long (max ${MAX_QUERY_CHARS} chars)` };
  }
  if (q.includes(";")) {
    return { ok: false, error: "Only a single statement is allowed (no semicolons)" };
  }
  if (!/^\s*(select|with)\b/i.test(q)) {
    return { ok: false, error: "Only SELECT queries are allowed" };
  }
  // Belt-and-suspenders on top of the grants: reject references to schemas the
  // assistant must never touch. The reader roles already cannot reach most of
  // these, but Supabase grants the pg_net queue tables (schema `net`) to PUBLIC,
  // so this app-layer check is what keeps outbound-request data out of reach —
  // and it also blocks a prompt-injection steering the model off company_os.
  if (BLOCKED_SCHEMA.test(q)) {
    return { ok: false, error: "Queries may only reference the company_os schema." };
  }
  if (blocked.pattern.test(q)) {
    return { ok: false, error: blocked.message };
  }
  return { ok: true, sql: q };
}

export type ReadExecutorOptions = {
  /** Env var holding the pooler URL for this assistant's reader role. */
  envVar: string;
  /** Prefix for the "not configured" warning, so the log names the caller. */
  logPrefix: string;
  blocked: BlockedTables;
  poolMax: number;
};

/**
 * Build one assistant's read executor. The client is a lazy module-level
 * singleton per executor: the URL points at the Supavisor transaction pooler
 * (port 6543) as that assistant's reader role, and prepare:false is required in
 * transaction-pool mode.
 */
export function makeReadExecutor(
  options: ReadExecutorOptions,
): (query: string) => Promise<QueryResult> {
  let client: ReturnType<typeof postgres> | null = null;

  function getClient(): ReturnType<typeof postgres> | null {
    if (client) return client;
    const url = process.env[options.envVar];
    if (!url) {
      console.warn(`${options.logPrefix}: ${options.envVar} is not set; assistant reads disabled`);
      return null;
    }
    client = postgres(url, { max: options.poolMax, prepare: false, idle_timeout: 20 });
    return client;
  }

  return async function runReadOnlyQuery(query: string): Promise<QueryResult> {
    const sql = getClient();
    if (!sql) return { ok: false, error: "Database access is not configured" };

    const validated = validateReadQuery(query, options.blocked);
    if (!validated.ok) return validated;

    try {
      // Wrapping as a subquery means anything that survived validation still
      // cannot be DML, and the row cap is enforced server-side.
      const rows = await sql.unsafe(
        `select * from (\n${validated.sql}\n) chatbot_q limit ${MAX_ROWS + 1}`,
      );
      const truncated = rows.length > MAX_ROWS;
      const out = truncated ? rows.slice(0, MAX_ROWS) : [...rows];
      return {
        ok: true,
        rows: out as unknown as Record<string, unknown>[],
        rowCount: out.length,
        truncated,
      };
    } catch (err) {
      // Postgres errors go back verbatim: the model self-corrects on
      // "column ... does not exist" / "permission denied for ..." feedback.
      return { ok: false, error: (err as Error).message ?? "Query failed" };
    }
  };
}
