// An in-memory stand-in for the two tables the notification router touches,
// company_os.automation_effects (with claim_effect) and
// company_os.notification_queue, for the router's and the flush's tests (Z.7).
// It keeps the rules those tests lean on rather than replaying scripted
// answers: a key is claimed once and claimable again only when released, the
// queue's dedupe_key is unique, and an update applies only to rows matching
// every eq filter, so the fenced writes are exercised for real. The real
// once() runs on top of it; only the client is fake.

type Effect = { id: string; key: string; status: string; attempt: number; done_at: string | null; summary: string | null };
export type QueuedRow = Record<string, unknown> & { id: string; dedupe_key: string; status: string; attempts: number; deliver_after: string };

export const noticeDb = {
  effects: new Map<string, Effect>(),
  queue: [] as QueuedRow[],
  /** When set, a queue write answers this error. */
  queueWriteError: null as string | null,
};

export function resetNoticeDb(): void {
  noticeDb.effects.clear();
  noticeDb.queue.length = 0;
  noticeDb.queueWriteError = null;
}

let ids = 0;
const nextId = (prefix: string) => `${prefix}${++ids}`;

type Filter = ["eq" | "lte", string, unknown];
type Query = { table: string; op: "select" | "upsert" | "update"; payload?: Record<string, unknown>; opts?: { ignoreDuplicates?: boolean }; filters: Filter[]; single: boolean };

const matches = (row: Record<string, unknown>, filters: Filter[]) =>
  filters.every(([op, col, v]) => (op === "eq" ? row[col] === v : String(row[col]) <= String(v)));

function answer(q: Query): { data: unknown; error: { message: string } | null } {
  if (q.table === "notification_queue") {
    if (q.op === "upsert") {
      if (noticeDb.queueWriteError) return { data: null, error: { message: noticeDb.queueWriteError } };
      const row = q.payload as Record<string, unknown>;
      if (noticeDb.queue.some((r) => r.dedupe_key === row.dedupe_key)) return { data: [], error: null };
      const id = nextId("q");
      noticeDb.queue.push({ status: "queued", attempts: 0, sent_at: null, carried_by: null, error: null, urgency: "normal", ...row, id } as unknown as QueuedRow);
      return { data: [{ id }], error: null };
    }
    if (q.op === "update") {
      if (noticeDb.queueWriteError) return { data: null, error: { message: noticeDb.queueWriteError } };
      for (const r of noticeDb.queue.filter((r) => matches(r, q.filters))) Object.assign(r, q.payload);
      return { data: null, error: null };
    }
    const rows = noticeDb.queue.filter((r) => matches(r, q.filters)).sort((a, b) => a.deliver_after.localeCompare(b.deliver_after));
    return { data: rows.map((r) => ({ ...r })), error: null };
  }
  if (q.table === "automation_effects") {
    if (q.op === "upsert") {
      const row = q.payload as { key: string; summary?: string };
      if (noticeDb.effects.has(row.key)) return { data: [], error: null };
      noticeDb.effects.set(row.key, { id: nextId("e"), key: row.key, status: "shadow", attempt: 1, done_at: null, summary: row.summary ?? null });
      return { data: [{ id: "shadow" }], error: null };
    }
    if (q.op === "update") {
      for (const e of [...noticeDb.effects.values()].filter((e) => matches(e as unknown as Record<string, unknown>, q.filters))) Object.assign(e, q.payload);
      return { data: null, error: null };
    }
    const found = [...noticeDb.effects.values()].find((e) => matches(e as unknown as Record<string, unknown>, q.filters));
    return { data: found ? { status: found.status, done_at: found.done_at } : null, error: null };
  }
  throw new Error(`unexpected table ${q.table}`);
}

function builder(table: string) {
  const q: Query = { table, op: "select", filters: [], single: false };
  const b: Record<string, unknown> = {
    select: () => b,
    upsert: (payload: Record<string, unknown>, opts?: Query["opts"]) => ((q.op = "upsert"), (q.payload = payload), (q.opts = opts), b),
    update: (payload: Record<string, unknown>) => ((q.op = "update"), (q.payload = payload), b),
    eq: (col: string, v: unknown) => (q.filters.push(["eq", col, v]), b),
    lte: (col: string, v: unknown) => (q.filters.push(["lte", col, v]), b),
    order: () => b,
    limit: () => b,
    maybeSingle: () => ((q.single = true), b),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve().then(() => answer(q)).then(resolve, reject),
  };
  return b;
}

/** The claim_effect function: a new key is claimed, a released one claimed again, anything else refused. */
function claimEffect(key: string): { data: unknown; error: null } {
  const e = noticeDb.effects.get(key);
  if (!e) {
    const id = nextId("e");
    noticeDb.effects.set(key, { id, key, status: "claimed", attempt: 1, done_at: null, summary: null });
    return { data: [{ id, attempt: 1 }], error: null };
  }
  if (e.status !== "released") return { data: [], error: null };
  e.status = "claimed";
  e.attempt += 1;
  return { data: [{ id: e.id, attempt: e.attempt }], error: null };
}

/** The module shape `vi.mock("@/kernel/data/supabase", fakeNoticeSupabase)` wants. */
export const fakeNoticeSupabase = () => ({
  companyOs: {
    from: (table: string) => builder(table),
    rpc: async (fn: string, args: { p_key: string }) => {
      if (fn !== "claim_effect") throw new Error(`unexpected rpc ${fn}`);
      return claimEffect(args.p_key);
    },
  },
});
