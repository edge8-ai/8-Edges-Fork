import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// The fulfilment steps only ever touch Supabase through the `companyOs`
// service-role client, so the whole data layer is replaced by a recording
// stub: every call is captured as an { table, verb, filters, payload } op and
// the test decides what each one returns. That is what lets a case say "this
// write returns a transient error" or "this is the second delivery of the
// same session" without a database.
type Op = {
  table: string;
  verb: "select" | "update" | "insert";
  head: boolean;
  filters: Record<string, unknown>;
  payload?: unknown;
};
type Resp = { data?: unknown; error?: { message: string } | null; count?: number | null };
type Resolver = (op: Op) => Resp;

const ops: Op[] = [];
let resolver: Resolver = () => ({});

function respond(op: Op) {
  const r = resolver(op);
  return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
}

function builder(table: string) {
  const op: Op = { table, verb: "select", head: false, filters: {} };
  const self = {
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.head) op.head = true;
      return self;
    },
    update(payload: unknown) {
      op.verb = "update";
      op.payload = payload;
      return self;
    },
    insert(payload: unknown) {
      op.verb = "insert";
      op.payload = payload;
      return self;
    },
    eq(col: string, val: unknown) {
      op.filters[col] = val;
      return self;
    },
    in(col: string, vals: unknown) {
      op.filters[col] = vals;
      return self;
    },
    neq(col: string, val: unknown) {
      op.filters[`neq:${col}`] = val;
      return self;
    },
    order() {
      return self;
    },
    limit() {
      return self;
    },
    maybeSingle() {
      ops.push(op);
      return Promise.resolve(respond(op));
    },
    then(onFulfilled: (v: ReturnType<typeof respond>) => unknown) {
      ops.push(op);
      return Promise.resolve(respond(op)).then(onFulfilled);
    },
  };
  return self;
}

// The writers fulfilment takes from the company-os and retreats doors (ME-13)
// pull the kernel auth guards into the graph, whose session readers are wrapped
// in React's `cache`; the React vitest resolves has no such export.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builder(table) },
  supabase: { from: (table: string) => builder(table) },
  htt: { from: (table: string) => builder(table) },
}));

const sentEmails: { to: string; name?: string | null }[] = [];
// The HTML of each transactional email, kept apart so the recipient checks
// above stay exact.
const sentHtml: string[] = [];
const opsPings: string[] = [];
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: (args: { to: string; html: string }) => {
    sentEmails.push({ to: args.to });
    sentHtml.push(args.html);
    return Promise.resolve(true);
  },
  sendEventTicketEmail: (args: { to: string; name: string | null }) => {
    sentEmails.push({ to: args.to, name: args.name });
    return Promise.resolve(true);
  },
}));
vi.mock("@/kernel/messaging/lark", () => ({
  notifyOps: (msg: string) => {
    opsPings.push(msg);
    return Promise.resolve(true);
  },
}));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://www.example.com" }));
vi.mock("@/entities/retreats/events-server", () => ({ newTicketCode: () => "TICKET-CODE" }));

import { handleFailed, handlePaid } from "@/entities/billing/api/stripe/webhook/fulfilment";

function session(metadata: Record<string, string> = {}, id = "cs_test_1"): Stripe.Checkout.Session {
  return { id, metadata, payment_intent: "pi_1", customer_email: null } as unknown as Stripe.Checkout.Session;
}

const IL_ORDER = {
  id: "order-1",
  person_id: "person-1",
  product_id: "product-1",
  amount_cents: 500000,
  amount_usd_cents: null,
  currency: "usd",
  affiliate_id: "aff-1",
  products: {
    id: "product-1",
    title: "Autumn Build Retreat",
    slug: "il-retreat",
    cohort_slug: "c1",
    tier: "standard",
    location: "Da Nang",
    date_start: "2026-11-01",
    date_end: "2026-11-05",
    event_id: "event-1",
  },
  people: { full_name: "Ada Lovelace", email: "ada@example.com" },
};

beforeEach(() => {
  ops.length = 0;
  sentEmails.length = 0;
  sentHtml.length = 0;
  opsPings.length = 0;
  resolver = () => ({});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("handlePaid — transient failures vs business no-ops", () => {
  it("asks for a retry and performs no fulfilment when the orders update errors", async () => {
    resolver = (op) =>
      op.table === "orders" && op.verb === "update"
        ? { error: { message: "connection reset" } }
        : {};

    const result = await handlePaid(session({ type: "event_registration", registration_id: "reg-1" }));

    expect(result.kind).toBe("retry");
    expect(ops).toHaveLength(1);
    expect(sentEmails).toHaveLength(0);
  });

  it("is a business no-op (ok) when no pending order matches — a redelivery", async () => {
    resolver = () => ({ data: null });

    const result = await handlePaid(session({ type: "event_registration", registration_id: "reg-1" }));

    // orders update, then the guarded registration update which also finds
    // nothing: no ticket email on a redelivery.
    expect(result).toEqual({ kind: "ok" });
    expect(sentEmails).toHaveLength(0);
  });

  it("asks for a retry when the registration update errors", async () => {
    resolver = (op) =>
      op.table === "event_registrations"
        ? { error: { message: "timeout" } }
        : { data: { id: "order-1" } };

    const result = await handlePaid(session({ type: "event_registration", registration_id: "reg-1" }));

    expect(result.kind).toBe("retry");
  });

  it("returns ok for a session with no metadata we act on", async () => {
    resolver = () => ({ data: { id: "order-1" } });
    expect(await handlePaid(session())).toEqual({ kind: "ok" });
  });
});

describe("handlePaid — the ticket email's greeting", () => {
  it("greets a family-name-first registrant by their given name, never the first word (S.16.16)", async () => {
    resolver = (op) =>
      op.table === "event_registrations" && op.verb === "update" && "status" in (op.payload as object)
        ? {
            data: {
              id: "reg-1", ticket_code: "T1", attendee_email: "hieu@example.com", confirmation_sent_at: null,
              people: { full_name: "Nguyễn Văn Hiếu", first_name: "Hiếu", display_name: null, preferred_name: null, email: "hieu@example.com" },
              events: { title: "Retreat", location: null, starts_at: "2026-11-01T02:00:00Z", ends_at: null, timezone: "Asia/Ho_Chi_Minh" },
            },
          }
        : { data: { id: "order-1" } };

    await handlePaid(session({ type: "event_registration", registration_id: "reg-1" }));

    expect(sentEmails).toEqual([{ to: "hieu@example.com", name: "Hiếu" }]);
  });
});

describe("handlePaid — token packs", () => {
  it("retries when the token purchase update errors", async () => {
    resolver = (op) =>
      op.table === "token_purchases" ? { error: { message: "deadlock" } } : { data: { id: "order-1" } };

    const result = await handlePaid(session({ type: "token_pack", token_purchase_id: "tp-1" }));

    expect(result.kind).toBe("retry");
    expect(sentEmails).toHaveLength(0);
  });

  it("is a no-op on redelivery when the purchase is already paid", async () => {
    resolver = (op) => (op.table === "token_purchases" ? { data: null } : { data: { id: "order-1" } });

    const result = await handlePaid(session({ type: "token_pack", token_purchase_id: "tp-1" }));

    expect(result).toEqual({ kind: "ok" });
    expect(sentEmails).toHaveLength(0);
    expect(opsPings).toHaveLength(0);
  });
});

const IL_META = { source_site: "infiniteleverage-8.com", affiliate_code_type: "commission" };

describe("handleInfiniteLeveragePaid — redelivery guards", () => {
  it("fulfils once on the first delivery", async () => {
    resolver = (op) => {
      if (op.table === "orders") return { data: op.verb === "update" ? { id: "order-1" } : IL_ORDER };
      if (op.table === "event_registrations" && op.head) return { count: 0 };
      if (op.table === "inquiries" && op.verb === "select")
        return { data: { id: "inq-1", status: "open", metadata: {} } };
      if (op.table === "affiliate_commissions" && op.verb === "select") return { data: null };
      if (op.table === "affiliates") return { data: { id: "aff-1", rate: 0.1 } };
      return {};
    };

    const result = await handlePaid(session(IL_META));

    expect(result).toEqual({ kind: "ok" });
    expect(ops.filter((o) => o.table === "event_registrations" && o.verb === "insert")).toHaveLength(1);
    expect(ops.filter((o) => o.table === "affiliate_commissions" && o.verb === "insert")).toHaveLength(1);
    expect(ops.filter((o) => o.table === "inquiries" && o.verb === "update")).toHaveLength(1);
    expect(sentEmails).toEqual([{ to: "ada@example.com" }]);
    expect(opsPings).toHaveLength(1);
  });

  it("escapes the buyer's name in the confirmation greeting (S.16.25)", async () => {
    // The buyer typed their name at checkout; a one-word name is their greeting.
    const order = { ...IL_ORDER, people: { preferred_name: "<b>Ada</b>", full_name: "Ada Lovelace", email: "ada@example.com" } };
    resolver = (op) => {
      if (op.table === "orders") return { data: op.verb === "update" ? { id: "order-1" } : order };
      if (op.table === "event_registrations" && op.head) return { count: 0 };
      if (op.table === "inquiries" && op.verb === "select") return { data: { id: "inq-1", status: "open", metadata: {} } };
      if (op.table === "affiliate_commissions" && op.verb === "select") return { data: null };
      if (op.table === "affiliates") return { data: { id: "aff-1", rate: 0.1 } };
      return {};
    };

    await handlePaid(session(IL_META));

    expect(sentHtml[0]).toContain("Hi &lt;b&gt;Ada&lt;/b&gt;,");
    expect(sentHtml[0]).not.toContain("<b>Ada</b>");
  });

  it("creates no second registration, commission, inquiry write or email on redelivery", async () => {
    resolver = (op) => {
      if (op.table === "orders") return { data: op.verb === "update" ? null : IL_ORDER };
      // Guard 1: a registration already exists for this order_id.
      if (op.table === "event_registrations" && op.head) return { count: 1 };
      // Guard 2: the inquiry is already won and must never be rewritten.
      if (op.table === "inquiries" && op.verb === "select")
        return { data: { id: "inq-1", status: "won", metadata: {} } };
      // Guard 3: a commission row for this order_id/source_event exists.
      if (op.table === "affiliate_commissions" && op.verb === "select") return { data: { id: "comm-1" } };
      return {};
    };

    const result = await handlePaid(session(IL_META));

    expect(result).toEqual({ kind: "ok" });
    expect(ops.filter((o) => o.verb === "insert")).toHaveLength(0);
    expect(ops.filter((o) => o.table === "inquiries" && o.verb === "update")).toHaveLength(0);
    // Guard 4: the buyer email and ops ping are tied to the first insert.
    expect(sentEmails).toHaveLength(0);
    expect(opsPings).toHaveLength(0);
  });

  it("retries when the registration count probe errors, without inserting", async () => {
    resolver = (op) => {
      if (op.table === "orders") return { data: op.verb === "update" ? { id: "order-1" } : IL_ORDER };
      if (op.table === "event_registrations" && op.head) return { error: { message: "timeout" } };
      return {};
    };

    const result = await handlePaid(session(IL_META));

    expect(result.kind).toBe("retry");
    expect(ops.filter((o) => o.verb === "insert")).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("retries when the registration insert errors", async () => {
    resolver = (op) => {
      if (op.table === "orders") return { data: op.verb === "update" ? { id: "order-1" } : IL_ORDER };
      if (op.table === "event_registrations" && op.head) return { count: 0 };
      if (op.table === "event_registrations" && op.verb === "insert")
        return { error: { message: "unique violation" } };
      return {};
    };

    const result = await handlePaid(session(IL_META));

    expect(result.kind).toBe("retry");
    expect(sentEmails).toHaveLength(0);
  });

  it("retries when the commission insert errors, after the buyer email already went out", async () => {
    resolver = (op) => {
      if (op.table === "orders") return { data: op.verb === "update" ? { id: "order-1" } : IL_ORDER };
      if (op.table === "event_registrations" && op.head) return { count: 0 };
      if (op.table === "inquiries" && op.verb === "select") return { data: null };
      if (op.table === "affiliate_commissions" && op.verb === "select") return { data: null };
      if (op.table === "affiliates") return { data: { id: "aff-1", rate: 0.1 } };
      if (op.table === "affiliate_commissions" && op.verb === "insert")
        return { error: { message: "connection reset" } };
      return {};
    };

    const result = await handlePaid(session(IL_META));

    expect(result.kind).toBe("retry");
    // The email is tied to the first registration insert and runs before the
    // ledger steps, so a retry of this delivery cannot lose it — and the
    // count guard stops the redelivery from sending a second one.
    expect(sentEmails).toEqual([{ to: "ada@example.com" }]);
  });

  it("retries when the IL order lookup errors but is a no-op for an unknown session", async () => {
    resolver = (op) => (op.table === "orders" && op.verb === "select" ? { error: { message: "down" } } : {});
    expect((await handlePaid(session(IL_META))).kind).toBe("retry");

    ops.length = 0;
    resolver = () => ({ data: null });
    expect(await handlePaid(session(IL_META))).toEqual({ kind: "ok" });
  });

  it("skips the commission ledger entirely for a discount-type code", async () => {
    resolver = (op) => {
      if (op.table === "orders") return { data: op.verb === "update" ? { id: "order-1" } : IL_ORDER };
      if (op.table === "event_registrations" && op.head) return { count: 0 };
      if (op.table === "inquiries" && op.verb === "select") return { data: null };
      return {};
    };

    const result = await handlePaid(
      session({ source_site: "infiniteleverage-8.com", affiliate_code_type: "discount" }),
    );

    expect(result).toEqual({ kind: "ok" });
    expect(ops.filter((o) => o.table === "affiliate_commissions")).toHaveLength(0);
  });
});

describe("handleFailed", () => {
  it("retries when the order expire write errors", async () => {
    resolver = (op) => (op.table === "orders" ? { error: { message: "timeout" } } : {});
    expect((await handleFailed(session())).kind).toBe("retry");
  });

  it("releases the held seat and returns ok", async () => {
    resolver = () => ({});
    const result = await handleFailed(session({ type: "event_registration", registration_id: "reg-1" }));

    expect(result).toEqual({ kind: "ok" });
    const release = ops.find((o) => o.table === "event_registrations");
    expect(release?.filters).toMatchObject({ id: "reg-1", status: "pending_payment" });
  });
});
