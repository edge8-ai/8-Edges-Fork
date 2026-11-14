import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The read side of company_os.audit_log. The OS has written history since the
// beginning and nothing could read it (S.4), so these tests pin the contract a
// record's History panel depends on: the rows are this record's, newest first,
// the actor is a person's name rather than the raw id or email the writer
// stored, and the page says whether another one exists.

type Row = Record<string, unknown>;

// What each mocked table answers, and what the query builder recorded doing.
const tables: Record<string, { rows: Row[]; error: { message: string } | null }> = {
  audit_log: { rows: [], error: null },
  people: { rows: [], error: null },
};
const calls: { table: string; select: string; filters: string[]; order: string[]; range: [number, number] | null }[] = [];

function builder(table: string) {
  const record = { table, select: "", filters: [] as string[], order: [] as string[], range: null as [number, number] | null };
  calls.push(record);
  const chain = {
    select(columns: string) {
      record.select = columns;
      return chain;
    },
    eq(column: string, value: unknown) {
      record.filters.push(`eq:${column}=${String(value)}`);
      return chain;
    },
    in(column: string, values: readonly unknown[]) {
      record.filters.push(`in:${column}=${values.map(String).sort().join("|")}`);
      return chain;
    },
    order(column: string, options?: { ascending?: boolean }) {
      record.order.push(`${column}:${options?.ascending === false ? "desc" : "asc"}`);
      return chain;
    },
    range(from: number, to: number) {
      record.range = [from, to];
      return chain;
    },
    // The awaited builder resolves to the PostgREST envelope.
    then(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown) {
      const t = tables[table];
      return Promise.resolve(
        t.error ? { data: null, error: t.error } : { data: sliced(t.rows, record.range), error: null },
      ).then(resolve);
    },
  };
  return chain;
}

function sliced(rows: Row[], range: [number, number] | null): Row[] {
  return range ? rows.slice(range[0], range[1] + 1) : rows;
}

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builder(table) } }));

const { listAuditFor, readAuditPage } = await import("@/kernel/audit/history-read");

function auditRow(over: Partial<Row> & { id: string }): Row {
  return {
    changed_at: "2026-09-01T10:00:00.000Z",
    operation: "update",
    actor_label: null,
    actor_person_id: null,
    old_data: null,
    new_data: null,
    context: {},
    ...over,
  };
}

beforeEach(() => {
  tables.audit_log = { rows: [], error: null };
  tables.people = { rows: [], error: null };
  calls.length = 0;
});

describe("listAuditFor", () => {
  it("reads this record's rows newest first, with a stable tiebreak", async () => {
    tables.audit_log.rows = [auditRow({ id: "a1" })];

    await listAuditFor("deals", "deal-1");

    const read = calls.find((c) => c.table === "audit_log");
    expect(read?.filters).toContain("eq:table_name=deals");
    expect(read?.filters).toContain("eq:record_id=deal-1");
    // changed_at ties are common — a bulk action stamps every row with one
    // transaction time — so the id breaks them and paging stays deterministic.
    expect(read?.order).toEqual(["changed_at:desc", "id:desc"]);
  });

  // The shared History tab sends its entries to the browser, and a contact's
  // old_data is a person's details, so the before and after images are read
  // only for a surface that asks for them.
  it("leaves the before and after images out unless asked", async () => {
    tables.audit_log.rows = [auditRow({ id: "a1", old_data: { tax_id: null }, new_data: { tax_id: "x" } })];

    const page = await listAuditFor("legal_entities", "le-1");

    expect(calls.find((c) => c.table === "audit_log")?.select).not.toContain("old_data");
    expect(page.entries[0]).not.toHaveProperty("oldData");
    expect(page.entries[0]).not.toHaveProperty("newData");
  });

  it("reads the before and after images for a surface that asks", async () => {
    tables.audit_log.rows = [
      auditRow({ id: "a1", old_data: { tax_id: null }, new_data: { tax_id: "x" } }),
      auditRow({ id: "a2", old_data: null, new_data: ["not", "an", "object"] }),
    ];

    const page = await listAuditFor("legal_entities", "le-1", { withData: true });

    const select = calls.find((c) => c.table === "audit_log")?.select ?? "";
    expect(select).toContain("old_data");
    expect(select).toContain("new_data");
    expect(page.entries.map((e) => [e.oldData, e.newData])).toEqual([
      [{ tax_id: null }, { tax_id: "x" }],
      [null, null],
    ]);
  });

  it("names the actor from the person the row points at", async () => {
    tables.audit_log.rows = [auditRow({ id: "a1", actor_person_id: "p-1", actor_label: "dana@example.test" })];
    tables.people.rows = [{ id: "p-1", email: "dana@example.test", full_name: "Dana Pham", display_name: null }];

    const page = await listAuditFor("deals", "deal-1");

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].actor).toBe("Dana Pham");
    expect(page.entries[0].id).toBe("a1");
    expect(page.entries[0].operation).toBe("update");
  });

  it("writes the actor's name the way every other surface writes it", async () => {
    // The defect this pins. The loop used to prefer full_name, which for a
    // Vietnamese row is Family Middle Given; personName prefers display_name,
    // which is Given + Family. One person therefore read two different ways
    // depending on which panel you opened.
    tables.audit_log.rows = [auditRow({ id: "a1", actor_person_id: "p-1" })];
    tables.people.rows = [
      { id: "p-1", email: "q@example.test", full_name: "Tran Minh Quan", display_name: "Quan Tran", preferred_name: null },
    ];

    const page = await listAuditFor("deals", "deal-1");

    expect(page.entries[0].actor).toBe("Quan Tran");
  });

  it("asks for preferred_name, and uses it when there is no display_name", async () => {
    tables.audit_log.rows = [auditRow({ id: "a1", actor_person_id: "p-1" })];
    tables.people.rows = [
      { id: "p-1", email: "a@example.test", full_name: "Nguyen Thi An", display_name: null, preferred_name: "An" },
    ];

    const page = await listAuditFor("deals", "deal-1");

    // The column has to be in the select, or that tier of the precedence is
    // invisible however carefully the precedence itself is written.
    expect(calls.find((c) => c.table === "people")?.select).toContain("preferred_name");
    expect(page.entries[0].actor).toBe("An");
  });

  it("leaves a nameless person unmapped rather than showing a placeholder", async () => {
    tables.audit_log.rows = [
      auditRow({ id: "a1", actor_person_id: "p-1", actor_label: "ops@example.test" }),
      auditRow({ id: "a2", actor_person_id: "p-2" }),
    ];
    tables.people.rows = [
      { id: "p-1", email: null, full_name: null, display_name: null, preferred_name: null },
      { id: "p-2", email: null, full_name: null, display_name: null, preferred_name: null },
    ];

    const page = await listAuditFor("deals", "deal-1");

    // personName answers "Unnamed" for both of these. The raw label is a poorer
    // name but a true one, and a row carrying neither says nothing at all.
    expect(page.entries.map((e) => e.actor)).toEqual(["ops@example.test", null]);
  });

  it("falls back to the person who owns the actor's email, then to the raw label", async () => {
    tables.audit_log.rows = [
      auditRow({ id: "a1", actor_label: "dana@example.test" }),
      auditRow({ id: "a2", actor_label: "cron" }),
      auditRow({ id: "a3" }),
    ];
    tables.people.rows = [{ id: "p-1", email: "dana@example.test", full_name: "Dana Pham", display_name: null }];

    const page = await listAuditFor("deals", "deal-1");

    expect(page.entries.map((e) => e.actor)).toEqual(["Dana Pham", "cron", null]);
  });

  it("asks for one row past the page so hasMore is answered without a second query", async () => {
    tables.audit_log.rows = Array.from({ length: 5 }, (_, i) => auditRow({ id: `a${i}` }));

    const page = await listAuditFor("deals", "deal-1", { limit: 2 });

    expect(page.entries.map((e) => e.id)).toEqual(["a0", "a1"]);
    expect(page.hasMore).toBe(true);
    expect(calls.find((c) => c.table === "audit_log")?.range).toEqual([0, 2]);
  });

  it("pages by offset, and the last page says there is no more", async () => {
    tables.audit_log.rows = Array.from({ length: 5 }, (_, i) => auditRow({ id: `a${i}` }));

    const page = await listAuditFor("deals", "deal-1", { limit: 2, offset: 4 });

    expect(page.entries.map((e) => e.id)).toEqual(["a4"]);
    expect(page.hasMore).toBe(false);
    expect(calls.find((c) => c.table === "audit_log")?.range).toEqual([4, 6]);
  });

  it("looks no person up when no row carries an actor", async () => {
    tables.audit_log.rows = [auditRow({ id: "a1" })];

    await listAuditFor("deals", "deal-1");

    expect(calls.filter((c) => c.table === "people")).toHaveLength(0);
  });

  it("throws the audit_log error rather than reporting an empty history", async () => {
    tables.audit_log.error = { message: "permission denied" };

    await expect(listAuditFor("deals", "deal-1")).rejects.toThrow(/permission denied/);
  });

  it("still lists the history when the people lookup fails", async () => {
    tables.audit_log.rows = [auditRow({ id: "a1", actor_label: "dana@example.test" })];
    tables.people.error = { message: "people offline" };

    const page = await listAuditFor("deals", "deal-1");

    expect(page.entries.map((e) => e.actor)).toEqual(["dana@example.test"]);
  });
});

// The house rule S.4 was decided under, held where it is actually enforceable.
//
// The audit trail answers "what happened to this record". The moment it can
// also answer "what has this person been doing", it is a management report on
// people, which this company does not build. The durable guard is the shape of
// the module: every read is filtered by one record id, and there is no export
// that takes an actor. Comments are stripped first — the prose here talks about
// actors at length, which is the point of it.
const readSource = () =>
  readFileSync(new URL("./history-read.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

describe("the audit read path cannot become a report on a person", () => {
  const source = readSource();

  it("filters the trail by the record, never by the actor", () => {
    expect(source).toContain('.eq("record_id", recordId)');
    expect(source).not.toMatch(/\.(eq|in|like|ilike)\(\s*"actor_/);
  });

  it("exports the two record-scoped readers and nothing else", () => {
    const exported = [...source.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]);
    expect(exported).toEqual(["listAuditFor", "readAuditPage"]);
  });
});

// The wrapper every surface's history action returns, so a failed read shows in
// the History tab instead of taking the drawer down with it.
describe("readAuditPage", () => {
  it("wraps a page as an ok Result", async () => {
    tables.audit_log.rows = [auditRow({ id: "a1" })];

    const result = await readAuditPage("deals", "deal-1", 0, 10);

    expect(result).toEqual({ ok: true, page: { entries: [expect.objectContaining({ id: "a1" })], hasMore: false } });
  });

  it("turns a failed read into an error Result rather than throwing", async () => {
    tables.audit_log.error = { message: "permission denied" };

    const result = await readAuditPage("deals", "deal-1", 0, 10);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining("permission denied") });
  });
});
