import { randomUUID } from "node:crypto";

// In-memory fakes for the proposal chain's suites (Z.10). The chain reads and
// writes several tables through PostgREST and asks the kernel's approvals,
// ledger and run log, and its tests walk a run across several ticks, so the
// house's scripted fake (one answer per call, kernel/data/testing) would make
// every suite a script of thirty answers. These keep state instead, with just
// the query shapes the chain uses, and the rules the real tables enforce that
// the chain relies on: the unique (company_id, meeting_id), the unique slug,
// a link that already exists.

type Row = Record<string, unknown>;
export const db: Record<string, Row[]> = {};

export function resetDb(): void {
  for (const k of Object.keys(db)) delete db[k];
}

export function table(name: string): Row[] {
  return (db[name] ??= []);
}

function value(row: Row, col: string): unknown {
  const m = /^([a-z_]+)->>([a-z_]+)$/.exec(col);
  if (m) {
    const obj = row[m[1]] as Row | null | undefined;
    const v = obj?.[m[2]];
    return v === undefined || v === null ? null : String(v);
  }
  return row[col];
}

// Embedded selects the chain uses, keyed by "<table>.<embedded table>".
const EMBEDS: Record<string, (row: Row) => unknown> = {
  "meetings.call_transcripts": (row) => table("call_transcripts").filter((t) => t.meeting_id === row.id),
  "person_companies.people": (row) => table("people").find((p) => p.id === row.person_id) ?? null,
};

function embed(tableName: string, select: string, row: Row): Row {
  const out: Row = { ...row };
  for (const m of select.matchAll(/(?:([a-z_]+):)?([a-z_]+)(?:![a-z_]+)?\(/g)) {
    const alias = m[1] ?? m[2];
    const fn = EMBEDS[`${tableName}.${m[2]}`];
    if (fn) out[alias] = fn(row);
  }
  return out;
}

type Filter = (row: Row) => boolean;
type Op = { kind: "select" | "insert" | "update" | "upsert" | "delete"; payload?: Row | Row[]; options?: { onConflict?: string; ignoreDuplicates?: boolean } };

const UNIQUE: Record<string, string[][]> = {
  proposal_drafts: [["company_id", "meeting_id"], ["slug"]],
  meeting_associations: [["meeting_id", "entity_type", "entity_id"]],
  automation_effects: [["key"]],
};

function clash(name: string, row: Row, ignoreId?: unknown): string[] | null {
  for (const cols of UNIQUE[name] ?? []) {
    if (cols.some((c) => row[c] === null || row[c] === undefined)) continue;
    if (table(name).some((r) => r.id !== ignoreId && cols.every((c) => r[c] === row[c]))) return cols;
  }
  return null;
}

class Query implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> {
  private filters: Filter[] = [];
  private op: Op = { kind: "select" };
  private selectCols = "*";
  private single: "maybe" | "one" | null = null;
  private max: number | null = null;
  constructor(private name: string) {}

  select(cols = "*") {
    this.selectCols = cols;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = { kind: "insert", payload };
    return this;
  }
  upsert(payload: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = { kind: "upsert", payload, options };
    return this;
  }
  update(payload: Row) {
    this.op = { kind: "update", payload };
    return this;
  }
  delete() {
    this.op = { kind: "delete" };
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => value(r, col) === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => value(r, col) !== v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(value(r, col)));
    return this;
  }
  is(col: string, v: null) {
    this.filters.push((r) => (value(r, col) ?? null) === v);
    return this;
  }
  not(col: string, op: string, v: unknown) {
    if (op !== "is") throw new Error(`fake: not(${op}) unsupported`);
    this.filters.push((r) => (value(r, col) ?? null) !== v);
    return this;
  }
  gte(col: string, v: string) {
    this.filters.push((r) => String(value(r, col) ?? "") >= v);
    return this;
  }
  lte(col: string, v: string) {
    this.filters.push((r) => String(value(r, col) ?? "") <= v);
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.single = "maybe";
    return this;
  }
  then<A, B>(ok?: ((v: { data: unknown; error: { message: string; code?: string } | null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve()
      .then(() => this.run())
      .then(ok, bad);
  }

  private run(): { data: unknown; error: { message: string; code?: string } | null } {
    const rows = table(this.name);
    const match = () => rows.filter((r) => this.filters.every((f) => f(r)));
    let out: Row[] = [];
    if (this.op.kind === "select") out = match();
    else if (this.op.kind === "insert" || this.op.kind === "upsert") {
      const list = Array.isArray(this.op.payload) ? this.op.payload : [this.op.payload as Row];
      for (const p of list) {
        const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...p };
        const dup = clash(this.name, row);
        if (dup) {
          if (this.op.kind === "upsert" && this.op.options?.ignoreDuplicates) continue;
          return { data: null, error: { message: `duplicate key value violates unique constraint on ${dup.join(", ")}`, code: "23505" } };
        }
        rows.push(row);
        out.push(row);
      }
    } else if (this.op.kind === "update") {
      out = match();
      for (const r of out) {
        const next = { ...r, ...(this.op.payload as Row) };
        const dup = clash(this.name, next, r.id);
        if (dup) return { data: null, error: { message: `duplicate key on ${dup.join(", ")}`, code: "23505" } };
        Object.assign(r, this.op.payload);
      }
    } else {
      out = match();
      db[this.name] = rows.filter((r) => !out.includes(r));
    }
    if (this.max !== null) out = out.slice(0, this.max);
    const shaped = out.map((r) => embed(this.name, this.selectCols, r));
    if (this.single) {
      if (shaped.length > 1) return { data: null, error: { message: "more than one row" } };
      return { data: shaped[0] ? { ...shaped[0] } : null, error: null };
    }
    return { data: shaped.map((r) => ({ ...r })), error: null };
  }
}

export const fakeCompanyOs = { from: (name: string) => new Query(name) };
