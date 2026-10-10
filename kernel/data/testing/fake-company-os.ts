// The house fake of the company_os client, shared by every entity's tests. It
// lives in the kernel, beside the module it fakes, because the boundary lint
// lets any entity import the kernel but no entity reach into another's lib/;
// it began as the board move tests' fake and moved here in W.126. Each
// `from(table)` call hands back a chainable builder that, when awaited,
// resolves to the next scripted `{ data, error, count }` for that table, in
// call order, and an unscripted query throws, so a test cannot pass by reading
// nothing. Filter and modifier methods are no-ops that return the builder, so
// the production query shape can change without breaking the fixtures; the
// write verbs keep their row so a test can assert WHAT was written, not only
// that a write happened. Each suite still declares its own `vi.mock` calls,
// which vitest hoists per file; a writer that wraps a table (updatePeople,
// insertVendors) can be faked as `(row) => builderFor("people").update(row)`.

export type Scripted = { data?: unknown; error?: { message: string } | null; count?: number };
// `resolvedAt` is the fake's clock when the query was ANSWERED, null until it
// is awaited. A call is recorded when it is built, which is before it runs, so
// ordering by build order let a write and its announce, raced together in a
// Promise.all, pass as "write, then announce" (W.135). Order by resolvedAt.
export type Call = {
  table: string;
  ops: string[];
  payloads: unknown[];
  options: unknown[];
  filters: [string, ...unknown[]][];
  resolvedAt: number | null;
};

const scripts = new Map<string, Scripted[]>();
export const calls: Call[] = [];

// One clock for the fake's answers and a suite's own events (a publish, a
// stubbed writer), so both can be put in the order they happened.
let clock = 0;
/** The next tick of the fake's clock. Stamp a suite's own event with it at the moment it happens. */
export function tick(): number {
  clock += 1;
  return clock;
}

/**
 * The resolved queries, as `table:verb`, merged with a suite's own stamped
 * events, in the order they happened. A query never awaited is not on it.
 */
export function timeline(extra: { at: number; label: string }[] = []): string[] {
  const answered = calls
    .filter((c) => c.resolvedAt !== null)
    .map((c) => ({ at: c.resolvedAt as number, label: `${c.table}:${c.ops[0] ?? "?"}` }));
  return [...answered, ...extra].sort((a, b) => a.at - b.at).map((e) => e.label);
}

export function script(table: string, ...responses: Scripted[]) {
  scripts.set(table, [...(scripts.get(table) ?? []), ...responses]);
}

// Opt-in: a scripted row comes back cut down to the columns its query
// selected, as PostgREST answers. By default the fake hands back every
// scripted column whatever the select asked for, so a read that stopped
// selecting a column the code goes on to use still passes. That is how a
// red invoice's mime_type could leave a select and every confirmed PDF read
// as "no red invoice" with the suite green (RB.2). Off by default because many
// suites script whole rows; resetFake turns it off again, so a suite opts in
// from its own beforeEach, after resetFake.
let onlySelected = false;

export function resetFake() {
  scripts.clear();
  calls.length = 0;
  storageScripts.clear();
  storageCalls.length = 0;
  onlySelected = false;
}

/** From now until the next resetFake, a scripted answer carries only the columns its query selected. */
export function answerOnlySelectedColumns(): void {
  onlySelected = true;
}

/**
 * The top-level keys a PostgREST select string names: a column, a column's
 * alias (`alias:column`, `column::text`) or an embed's key (`alias:table!hint(…)`,
 * `table!inner(…)`). Null when the select names everything (`*`, no argument)
 * or uses a form this fake does not read (a spread, a JSON path), and the row
 * then comes back whole rather than wrongly cut.
 */
function selectedKeys(columns: unknown): string[] | null {
  if (typeof columns !== "string") return null;
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of columns) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  const keys: string[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (part === "") continue;
    if (part === "*" || part.startsWith("...") || part.includes("->")) return null;
    const head = part.split("(")[0].replace(/::\w+/g, "");
    const key = head.includes(":") ? head.split(":")[0] : head.split("!")[0];
    keys.push(key.trim());
  }
  return keys.length > 0 ? keys : null;
}

function cutToSelected(data: unknown, columns: unknown): unknown {
  const keys = selectedKeys(columns);
  if (!keys) return data;
  const cut = (row: unknown) =>
    row && typeof row === "object" && !Array.isArray(row)
      ? Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([k]) => keys.includes(k)))
      : row;
  return Array.isArray(data) ? data.map(cut) : cut(data);
}

export const opsFor = (table: string) => calls.filter((c) => c.table === table).map((c) => c.ops);

const OPS = ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "lt", "lte", "gt", "gte", "or", "not", "ilike", "range", "order", "limit", "single", "maybeSingle"] as const;
const WRITES: readonly string[] = ["insert", "update", "upsert"];
// `or`, `not` and `ilike` narrow a read the same way, so their arguments are
// kept too: ["or", "<expr>"], ["not", col, op, value] (W.127). `range` is
// paging, not a filter.
const FILTERS: readonly string[] = ["eq", "neq", "is", "in", "lt", "lte", "gt", "gte", "or", "not", "ilike"];

// Typed so a suite can fake a table writer as `(row) => builderFor("people").update(row)`
// and chain on it; every verb returns the same awaitable builder.
export type FakeBuilder = PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }> & {
  [op in (typeof OPS)[number]]: (...args: unknown[]) => FakeBuilder;
};

export function builderFor(table: string): FakeBuilder {
  const record: Call = { table, ops: [], payloads: [], options: [], filters: [], resolvedAt: null };
  calls.push(record);
  // What the query's select named: `undefined` until select is called, so a
  // bare write with no returning select is never cut.
  let selected: unknown;
  const respond = () => {
    const queue = scripts.get(table) ?? [];
    const next = queue.shift();
    if (!next) throw new Error(`unscripted query against ${table}`);
    record.resolvedAt = tick();
    const data = next.data ?? null;
    return {
      data: onlySelected && record.ops.includes("select") ? cutToSelected(data, selected) : data,
      error: next.error ?? null,
      count: next.count ?? null,
    };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of OPS) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      if (op === "select") selected = args.length === 0 ? "*" : args[0];
      // A write keeps its options too: an upsert's onConflict is what makes it
      // an update rather than a duplicate row.
      if (WRITES.includes(op)) {
        record.payloads.push(args[0]);
        record.options.push(args[1]);
      }
      // The filters keep their arguments too, so a dropped `.eq("id", …)` is
      // a failing test and not a silently widened write (verifier on A.1).
      if (FILTERS.includes(op)) record.filters.push([op, ...args]);
      return builder;
    };
  }
  return builder as unknown as FakeBuilder;
}

// The storage double (W.128): `supabase.storage.from(bucket)` with the verbs
// the code under test uses. Each verb resolves to the next scripted answer for
// THAT verb, records the bucket and its arguments, and throws when nothing was
// scripted, for the builder's reason: a test must not pass by touching nothing.
export const STORAGE_OPS = ["createSignedUploadUrl", "createSignedUrl", "createSignedUrls", "download", "info", "list", "remove"] as const;
export type StorageOp = (typeof STORAGE_OPS)[number];
export type StorageCall = { bucket: string; op: StorageOp; args: unknown[]; resolvedAt: number | null };
const storageScripts = new Map<StorageOp, Scripted[]>();
export const storageCalls: StorageCall[] = [];
export function scriptStorage(op: StorageOp, ...responses: Scripted[]) {
  storageScripts.set(op, [...(storageScripts.get(op) ?? []), ...responses]);
}
export function storageFor(bucket: string): Record<StorageOp, (...args: unknown[]) => Promise<{ data: unknown; error: { message: string } | null }>> {
  const verbs = {} as Record<StorageOp, (...args: unknown[]) => Promise<{ data: unknown; error: { message: string } | null }>>;
  for (const op of STORAGE_OPS) {
    verbs[op] = async (...args: unknown[]) => {
      const record: StorageCall = { bucket, op, args, resolvedAt: null };
      storageCalls.push(record);
      const next = storageScripts.get(op)?.shift();
      if (!next) throw new Error(`unscripted storage ${op} on ${bucket}`);
      record.resolvedAt = tick();
      return { data: next.data ?? null, error: next.error ?? null };
    };
  }
  return verbs;
}

// The module shape `vi.mock("@/kernel/data/supabase", fakeSupabase)` wants.
// endPosition asks the database for an atomic append first; here the function
// "does not exist", which exercises the read-top-plus-one fallback.
export const fakeSupabase = () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: { storage: { from: (bucket: string) => storageFor(bucket) } },
  companyOsUntyped: { rpc: async () => ({ data: null, error: { message: "function append_task_position does not exist" } }) },
});
