import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What these pin down is the contract the ADR promises, because every one of
// them is a way an optional entity could otherwise break a required one: a
// handler that throws must not reach the publisher, a bad payload must fail at
// the publisher rather than in a subscriber, and a deployment with no
// subscriber must be indistinguishable from one whose subscriber did nothing.
const audits: { actor: string; newData: unknown }[] = [];
vi.mock("@/kernel/audit/audit", () => ({
  recordAudit: vi.fn(async (input: { actor: string; newData: unknown }) => {
    audits.push({ actor: input.actor, newData: input.newData });
  }),
}));

// Y.86: every subscriber run is recorded; the writer itself is tested in deliveries.test.ts.
const deliveries: { eventName: string; eventId: string; subscriber: string; ok: boolean; error: string | null }[] = [];
vi.mock("./deliveries", () => ({
  recordDelivery: vi.fn(async (d: { eventName: string; eventId: string; subscriber: string; ok: boolean; error: string | null }) => {
    deliveries.push(d);
  }),
}));

import { publish, subscribe, subscribersOf, resetSubscribers } from "./bus";

beforeEach(() => {
  resetSubscribers();
  audits.length = 0;
  deliveries.length = 0;
});
afterEach(() => vi.clearAllMocks());

const PAYLOAD = { taskId: "t1", boardSlug: "b", subjectType: "coaching_commitment", subjectId: "c1" };

describe("the event bus", () => {
  it("publishes to nobody without complaint", async () => {
    await expect(publish("board.card.completed", PAYLOAD)).resolves.toBeUndefined();
    expect(subscribersOf("board.card.completed")).toEqual([]);
  });

  it("awaits each handler, so an effect lands before the request returns", async () => {
    const order: string[] = [];
    subscribe("a", "board.card.completed", async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push("a");
    });
    subscribe("b", "board.card.completed", () => {
      order.push("b");
    });
    await publish("board.card.completed", PAYLOAD);
    expect(order).toEqual(["a", "b"]);
  });

  it("hands the handler the validated payload", async () => {
    const seen: unknown[] = [];
    subscribe("a", "board.card.completed", (p) => {
      seen.push(p);
    });
    await publish("board.card.completed", PAYLOAD);
    expect(seen).toEqual([PAYLOAD]);
  });

  it("never lets a failing handler reach the publisher, and audits the drop", async () => {
    subscribe("coaching", "board.card.completed", () => {
      throw new Error("commitment locked");
    });
    const after: string[] = [];
    subscribe("other", "board.card.completed", () => {
      after.push("ran");
    });
    await expect(publish("board.card.completed", PAYLOAD)).resolves.toBeUndefined();
    // The later subscriber still runs: one optional entity must not silence another.
    expect(after).toEqual(["ran"]);
    expect(audits).toHaveLength(1);
    expect(audits[0].actor).toBe("kernel/events:coaching");
    expect(JSON.stringify(audits[0].newData)).toContain("commitment locked");
  });

  it("rejects a malformed payload at the publisher, before any handler runs", async () => {
    const ran: string[] = [];
    subscribe("a", "board.card.completed", () => {
      ran.push("no");
    });
    // An empty taskId satisfies the type and fails the schema, which is the
    // case worth pinning: types cannot catch a publisher passing "".
    await expect(
      publish("board.card.completed", { taskId: "", boardSlug: "b", subjectType: null, subjectId: null }),
    ).rejects.toThrow(/invalid payload/);
    expect(ran).toEqual([]);
  });

  it("accepts a card with no subject, which is most of them", async () => {
    const seen: unknown[] = [];
    subscribe("a", "board.card.completed", (p) => {
      seen.push(p.subjectId);
    });
    await publish("board.card.completed", { taskId: "t1", boardSlug: "b", subjectType: null, subjectId: null });
    expect(seen).toEqual([null]);
  });
});

// The vocabulary the bus carries beyond the board card (S.2). Each of these is
// a fact one entity states and another may or may not be installed to hear, so
// what is pinned here is the contract between them: the fields a subscriber is
// allowed to rely on, and the shapes the publisher is refused for.
//
// The payloads are exercised through `publish` rather than against the schema
// object, because `publish` is the only way a publisher ever meets them — a
// schema that parsed happily while `publish` rejected the same value would be
// a green test over a broken door.
describe("the event vocabulary", () => {
  const LEAVE = {
    requestId: "req-1",
    teamMemberId: "tm-1",
    startDate: "2026-10-05",
    endDate: "2026-10-09",
    leaveType: "annual",
  };
  const HIRED = {
    applicationId: "app-1",
    jobRequisitionId: "jr-1",
    personId: "person-1",
    candidateId: "cand-1",
  };
  const WON = {
    dealId: "deal-1",
    companyId: "co-1",
    personId: "person-1",
    amountUsdCents: 1_200_000,
    closedAt: "2026-09-22T04:00:00.000Z",
  };
  const PAID = {
    invoiceId: "inv-1",
    companyId: "co-1",
    dealId: "deal-1",
    amountCents: 450_000,
    currency: "usd",
    paidOn: "2026-09-22",
  };

  it("carries an approved leave with the span a subscriber has to reschedule around", async () => {
    const seen: unknown[] = [];
    subscribe("coaching", "leave.approved", (p) => {
      seen.push(p);
    });
    await publish("leave.approved", LEAVE);
    expect(seen).toEqual([LEAVE]);
  });

  it("refuses a leave whose dates are not calendar dates", async () => {
    await expect(publish("leave.approved", { ...LEAVE, endDate: "next Friday" })).rejects.toThrow(/invalid payload/);
  });

  it("refuses a leave that ends before it starts", async () => {
    // A reversed span is the publisher's bug: a subscriber walking it forward
    // to the next clear day would find every day clear and move nothing, which
    // looks exactly like "no 1-1 was booked" in a log.
    await expect(publish("leave.approved", { ...LEAVE, endDate: "2026-10-01" })).rejects.toThrow(/invalid payload/);
  });

  it("carries a hire whose candidate has no person row yet", async () => {
    const seen: unknown[] = [];
    subscribe("onboarding", "candidate.hired", (p) => {
      seen.push(p);
    });
    // Most hires are decided before anybody types the new starter's details, so
    // a null person is the normal case and must not be a publisher error.
    await publish("candidate.hired", { ...HIRED, personId: null, candidateId: null });
    expect(seen).toEqual([{ ...HIRED, personId: null, candidateId: null }]);
  });

  it("refuses a hire with no application behind it", async () => {
    await expect(publish("candidate.hired", { ...HIRED, applicationId: "" })).rejects.toThrow(/invalid payload/);
  });

  it("carries a won deal with its amount in USD cents", async () => {
    const seen: unknown[] = [];
    subscribe("boards", "deal.won", (p) => {
      seen.push(p);
    });
    await publish("deal.won", WON);
    expect(seen).toEqual([WON]);
  });

  it("refuses a won deal whose amount is a fraction of a cent", async () => {
    // Money is integer cents everywhere in this tree; a float here would reach
    // a subscriber that stores it and be wrong for as long as the row lives.
    await expect(publish("deal.won", { ...WON, amountUsdCents: 1200.5 })).rejects.toThrow(/invalid payload/);
  });

  it("carries a won deal that nobody has mapped to an account yet", async () => {
    const seen: unknown[] = [];
    subscribe("boards", "deal.won", (p) => {
      seen.push(p);
    });
    await publish("deal.won", { ...WON, companyId: null, personId: null, amountUsdCents: null });
    expect(seen).toEqual([{ ...WON, companyId: null, personId: null, amountUsdCents: null }]);
  });

  it("carries a paid invoice, deal or no deal", async () => {
    const seen: unknown[] = [];
    subscribe("crm", "invoice.paid", (p) => {
      seen.push(p);
    });
    await publish("invoice.paid", { ...PAID, dealId: null, companyId: null });
    expect(seen).toEqual([{ ...PAID, dealId: null, companyId: null }]);
  });

  it("refuses a payment date that is not a calendar date", async () => {
    await expect(publish("invoice.paid", { ...PAID, paidOn: "2026-09" })).rejects.toThrow(/invalid payload/);
  });

  it("isolates a failing subscriber on every event, not just the first one", async () => {
    // ADR 0003's second rule, once per name: a publisher is a required entity
    // and a subscriber is an optional one, so a new event must not be the one
    // that lets the optional side fail the required side.
    const cases: [Parameters<typeof publish>[0], unknown][] = [
      ["leave.approved", LEAVE],
      ["candidate.hired", HIRED],
      ["deal.won", WON],
      ["invoice.paid", PAID],
    ];
    for (const [name, payload] of cases) {
      resetSubscribers();
      audits.length = 0;
      subscribe("optional", name, () => {
        throw new Error(`${name} handler exploded`);
      });
      await expect(publish(name, payload as never)).resolves.toBeUndefined();
      expect(audits).toHaveLength(1);
      expect(audits[0].actor).toBe("kernel/events:optional");
    }
  });
});

// W.170. A Next server evaluates this module more than once: the
// instrumentation hook that registers the subscribers is compiled into its own
// graph, and every route handler, page and server action into others, so each
// holds its own copy of bus.ts. A registry kept at module scope gave every
// request an empty bus, and from S.3 to W.170 the inbox never received a row.
// One module instance cannot show that, so these load a second one.
describe("the event bus across module instances", () => {
  afterEach(() => resetSubscribers());

  it("lets a copy that registered nothing see the subscribers another copy registered", async () => {
    subscribe("notifications", "board.card.completed", () => undefined);
    vi.resetModules();
    const other = await import("./bus");
    expect(other.subscribersOf("board.card.completed")).toEqual(["notifications"]);
  });

  it("runs a handler registered in one copy when another copy publishes", async () => {
    const seen: unknown[] = [];
    subscribe("notifications", "board.card.completed", (p) => {
      seen.push(p);
    });
    vi.resetModules();
    const other = await import("./bus");
    await other.publish("board.card.completed", PAYLOAD);
    expect(seen).toEqual([PAYLOAD]);
  });

  it("records one delivery per subscriber, ok or failed, under one event id (Y.86)", async () => {
    subscribe("a", "board.card.completed", () => undefined);
    subscribe("b", "board.card.completed", () => {
      throw new Error("boom");
    });
    await publish("board.card.completed", PAYLOAD);
    expect(deliveries.map((d) => [d.subscriber, d.ok, d.error])).toEqual([
      ["a", true, null],
      ["b", false, "boom"],
    ]);
    expect(new Set(deliveries.map((d) => d.eventId)).size).toBe(1);
    await publish("board.card.completed", PAYLOAD);
    expect(new Set(deliveries.map((d) => d.eventId)).size).toBe(2);
  });
});
