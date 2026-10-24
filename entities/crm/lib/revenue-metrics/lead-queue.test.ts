import { beforeEach, describe, expect, it, vi } from "vitest";

// The two overview queues, pinned against the chains they replaced, verbatim.
//
// A.19 moved a raw PostgREST chain out of the route body. The way that goes
// wrong is silently: a dropped `.eq(...)` widens the queue, a dropped column
// leaves a field undefined at runtime and correct to the compiler, and the page
// still renders. So the strings below are COPIED from the route as it stood
// before the move, not regenerated from the new code.

type Call = { table: string; columns: string; ops: [string, unknown[]][] };
const calls: Call[] = [];

function recorder(table: string) {
  return (columns: string) => {
    const call: Call = { table, columns, ops: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve().then(() => ({ data: [], error: null })).then(resolve),
    };
    for (const op of ["eq", "in", "is", "not", "order", "limit"]) {
      builder[op] = (...args: unknown[]) => {
        call.ops.push([op, args]);
        return builder;
      };
    }
    return builder;
  };
}

vi.mock("@/entities/crm/lib/reads", () => ({
  selectLead: recorder("leads"),
  selectInquiries: recorder("inquiries"),
}));

const { loadLeadQueue } = await import("./lead-queue");

// Exactly as the route body spelled them, before A.19 — except that S.16
// widened both people embeds with display_name and preferred_name, so the
// queue names people by personName().
const BEFORE = {
  leads: "status, sla_due_at, created_at, people!person_id!inner(id, display_name, preferred_name, full_name, email, archived_at)",
  inquiries: "id, subject, created_at, people(display_name, preferred_name, full_name, email)",
};

beforeEach(() => {
  calls.length = 0;
});

describe("the Revenue overview's work queues", () => {
  it("asks for the same columns the route body asked for", async () => {
    await loadLeadQueue();
    expect(calls.find((c) => c.table === "leads")?.columns).toBe(BEFORE.leads);
    expect(calls.find((c) => c.table === "inquiries")?.columns).toBe(BEFORE.inquiries);
  });

  it("keeps every filter, both orderings and the preview limit on the lead queue", async () => {
    await loadLeadQueue();
    const lead = calls.find((c) => c.table === "leads");
    expect(lead?.ops).toEqual([
      ["in", ["status", expect.any(Array)]],
      ["is", ["people.archived_at", null]],
      ["order", ["sla_due_at", { ascending: true, nullsFirst: false }]],
      ["order", ["created_at", { ascending: true }]],
      ["limit", [8]],
    ]);
  });

  it("keeps the inquiry filters, so non-sales types stay out of the triage card", async () => {
    await loadLeadQueue();
    const inq = calls.find((c) => c.table === "inquiries");
    expect(inq?.ops).toEqual([
      ["eq", ["status", "new_lead"]],
      ["not", ["type", "in", expect.anything()]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [8]],
    ]);
  });

  it("says a failed read out loud rather than rendering an empty queue", async () => {
    // A.12: an empty list and a broken read look the same on the card, and the
    // card would read "nobody is waiting" when the truth is "we cannot tell".
    calls.length = 0;
    vi.resetModules();
    vi.doMock("@/entities/crm/lib/reads", () => {
      const fail = () => {
        const builder: Record<string, unknown> = {
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve()
              .then(() => ({ data: null, error: { message: "boom" } }))
              .then(resolve),
        };
        for (const op of ["eq", "in", "is", "not", "order", "limit"]) builder[op] = () => builder;
        return builder;
      };
      return { selectLead: fail, selectInquiries: fail };
    });
    const { loadLeadQueue: failing } = await import("./lead-queue");
    const queue = await failing();
    expect(queue.errors).toEqual(["lead queue: boom", "inquiries: boom"]);
    expect(queue.leads).toEqual([]);
    vi.doUnmock("@/entities/crm/lib/reads");
    vi.resetModules();
  });
});
