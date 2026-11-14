import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADR 0027's outbox promise, proven on planted rows (the ADR 0033 "fires"
// rule applied to a runtime mechanism rather than a gate). outbox.test.ts
// scripts each answer, so it proves which filters the query names but not
// that they pick the right rows: a stale-claim filter written backwards would
// pass it. Here event_outbox is a small in-memory table that applies the
// filters the code sends, the clock is moved by hand, and each test plants the
// row its rule is about:
//   * a claim older than five minutes is taken again, and a fresher one is left;
//   * at least once per publish: a publish whose mark was lost is published again;
//   * after five attempts a row is left for a person, and counted, never retried.

type Row = {
  id: string;
  event_name: string;
  dedupe_key: string;
  payload: unknown;
  attempts: number;
  claimed_at: string | null;
  published_at: string | null;
  last_error: string | null;
  created_at: string;
};
type Pred = (r: Row) => boolean;

const h = vi.hoisted(() => ({
  table: [] as Row[],
  published: [] as { name: string; payload: unknown }[],
  /** Publishes of these application ids throw, as a payload the catalogue refuses does. */
  refuse: new Set<string>(),
  /** How many "mark published" writes fail next, as a connection that drops after the publish. */
  markFailures: 0,
}));

function cell(r: Row, col: string): unknown {
  return (r as unknown as Record<string, unknown>)[col];
}

// PostgREST's `or` syntax, as far as the outbox writes it: `col.op.value`
// alternatives joined by commas, a value optionally double-quoted.
function orPredicate(expr: string): Pred {
  const alternatives = expr.split(/,(?=[a-z_]+\.)/).map((alt) => {
    const [, col, op, raw] = /^([a-z_]+)\.([a-z]+)\.(.*)$/.exec(alt) ?? [];
    const value = raw?.replace(/^"(.*)"$/, "$1");
    if (op === "is" && value === "null") return (r: Row) => cell(r, col) === null;
    if (op === "lt") return (r: Row) => cell(r, col) !== null && String(cell(r, col)) < String(value);
    throw new Error(`the fake does not read or(${alt})`);
  });
  return (r) => alternatives.some((p) => p(r));
}

function outboxQuery() {
  const preds: Pred[] = [];
  let patch: Partial<Row> | null = null;
  let returning = false;
  let counting = false;
  let orderBy: string | null = null;
  let limit = Infinity;
  const run = () => {
    const hit = h.table.filter((r) => preds.every((p) => p(r)));
    if (patch) {
      if ("published_at" in patch && h.markFailures > 0) {
        h.markFailures -= 1;
        return { data: null, error: { message: "connection reset" }, count: null };
      }
      for (const r of hit) Object.assign(r, patch);
      return { data: returning ? hit.map((r) => ({ id: r.id })) : null, error: null, count: null };
    }
    if (counting) return { data: null, error: null, count: hit.length };
    const sorted = orderBy ? [...hit].sort((a, b) => String(cell(a, orderBy!)).localeCompare(String(cell(b, orderBy!)))) : hit;
    return { data: sorted.slice(0, limit).map((r) => ({ ...r })), error: null, count: null };
  };
  const q = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (patch) returning = true;
      if (opts?.head) counting = true;
      return q;
    },
    update: (p: Partial<Row>) => ((patch = p), q),
    is: (col: string, v: unknown) => (preds.push((r) => cell(r, col) === v), q),
    eq: (col: string, v: unknown) => (preds.push((r) => cell(r, col) === v), q),
    lt: (col: string, v: number) => (preds.push((r) => (cell(r, col) as number) < v), q),
    gte: (col: string, v: number) => (preds.push((r) => (cell(r, col) as number) >= v), q),
    or: (expr: string) => (preds.push(orPredicate(expr)), q),
    order: (col: string) => ((orderBy = col), q),
    limit: (n: number) => ((limit = n), q),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
  };
  return q;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (name: string) => {
      if (name !== "event_outbox") throw new Error(`unexpected table ${name}`);
      return outboxQuery();
    },
  },
}));
vi.mock("@/kernel/audit/run-context", () => ({ currentRunMode: () => "live" }));
vi.mock("./bus", () => ({
  publish: async (name: string, payload: { applicationId: string }) => {
    if (h.refuse.has(payload.applicationId)) throw new Error(`publish(${name}): invalid payload`);
    h.published.push({ name, payload });
  },
}));

import { deliverOutbox } from "./outbox";

const T0 = new Date("2026-11-01T03:00:00.000Z").getTime();
const MIN = 60_000;

function at(offsetMin: number): void {
  vi.setSystemTime(T0 + offsetMin * MIN);
}

function plant(id: string, over: Partial<Row> = {}): Row {
  const row: Row = {
    id,
    event_name: "candidate.hired",
    dedupe_key: id,
    payload: { applicationId: id, jobRequisitionId: "req-1", candidateId: null, personId: "p-1", hiringManagerId: null, actorPersonId: "approver" },
    attempts: 0,
    claimed_at: null,
    published_at: null,
    last_error: null,
    created_at: new Date(T0 - 60 * MIN).toISOString(),
    ...over,
  };
  h.table.push(row);
  return row;
}

const ago = (min: number) => new Date(T0 - min * MIN).toISOString();
const publishedIds = () => h.published.map((p) => (p.payload as { applicationId: string }).applicationId);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(0);
  h.table.length = 0;
  h.published.length = 0;
  h.refuse.clear();
  h.markFailures = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the outbox, on planted rows", () => {
  it("takes a claim older than five minutes again, and leaves a fresher claim to its holder", async () => {
    plant("unclaimed");
    const stale = plant("stale", { attempts: 1, claimed_at: ago(6) });
    const fresh = plant("fresh", { attempts: 1, claimed_at: ago(4) });

    const res = await deliverOutbox();

    expect(publishedIds().sort()).toEqual(["stale", "unclaimed"]);
    expect(res).toMatchObject({ published: 2, failed: 0, exhausted: 0 });
    expect(stale).toMatchObject({ attempts: 2, last_error: null });
    expect(stale.published_at).not.toBeNull();
    expect(fresh).toMatchObject({ attempts: 1, claimed_at: ago(4), published_at: null });
  });

  it("is at least once per publish: a publish whose mark was lost is published again once its claim goes stale", async () => {
    const row = plant("app-1");
    h.markFailures = 1;

    const first = await deliverOutbox();
    expect(first).toMatchObject({ published: 0, failed: 1 });
    expect(row.published_at).toBeNull();
    expect(row.last_error).toMatch(/published, but not marked/);

    // Its own claim still holds a minute later: nobody publishes it.
    at(1);
    expect(await deliverOutbox()).toMatchObject({ published: 0, failed: 0 });

    // Six minutes on the claim is stale, and the event goes out a second time.
    at(6);
    expect(await deliverOutbox()).toMatchObject({ published: 1, failed: 0 });
    expect(publishedIds()).toEqual(["app-1", "app-1"]);
    expect(row).toMatchObject({ attempts: 2, last_error: null });
    expect(row.published_at).not.toBeNull();
  });

  it("leaves a row for a person after five attempts, counts it, and never publishes it again", async () => {
    const row = plant("bad");
    h.refuse.add("bad");
    let tried = 0;
    for (let tick = 0; tick < 5; tick++) {
      at(tick * 6);
      const res = await deliverOutbox();
      tried += res.failed;
      expect(res.exhausted).toBe(0);
    }
    expect(tried).toBe(5);
    expect(row).toMatchObject({ attempts: 5, published_at: null, last_error: "publish(candidate.hired): invalid payload" });

    // The next sweep, and every one after it, reports the row and leaves it alone.
    h.refuse.clear();
    at(36);
    expect(await deliverOutbox()).toMatchObject({ published: 0, failed: 0, exhausted: 1 });
    expect(row.attempts).toBe(5);
    expect(h.published).toEqual([]);
  });

  it("delivers the fourth-attempt row that succeeds, so the cap counts attempts and not age", async () => {
    const row = plant("late", { attempts: 4, claimed_at: ago(10) });
    expect(await deliverOutbox()).toMatchObject({ published: 1, exhausted: 0 });
    expect(row.attempts).toBe(5);
    expect(row.published_at).not.toBeNull();
  });
});
