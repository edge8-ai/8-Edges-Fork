import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// The route is exercised end to end with the signature check and the
// fulfilment layer both stubbed: what is under test here is only the
// mapping from a fulfilment result to an HTTP status (retry → 5xx so Stripe
// redelivers, ok → 200), plus the two guard paths that must not change.
let webhookSecret: string | undefined = "whsec_test";
let constructEvent: (raw: string, sig: string, secret: string) => Stripe.Event = () =>
  ({ type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid" } } }) as unknown as Stripe.Event;

vi.mock("@/entities/billing/stripe", () => ({
  stripe: { webhooks: { constructEvent: (r: string, s: string, k: string) => constructEvent(r, s, k) } },
  get STRIPE_WEBHOOK_SECRET() {
    return webhookSecret;
  },
}));

let paidResult: { kind: "ok" } | { kind: "retry"; reason: string } = { kind: "ok" };
let failedResult: { kind: "ok" } | { kind: "retry"; reason: string } = { kind: "ok" };
const calls: string[] = [];
vi.mock("@/entities/billing/api/stripe/webhook/fulfilment", () => ({
  handlePaid: () => {
    calls.push("paid");
    return Promise.resolve(paidResult);
  },
  handleFailed: () => {
    calls.push("failed");
    return Promise.resolve(failedResult);
  },
}));

import { POST } from "@/entities/billing/api/stripe/webhook/route";

function request(): Request {
  return new Request("https://www.example.com/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=sig" },
    body: "{}",
  });
}

beforeEach(() => {
  calls.length = 0;
  webhookSecret = "whsec_test";
  paidResult = { kind: "ok" };
  failedResult = { kind: "ok" };
  constructEvent = () =>
    ({ type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid" } } }) as unknown as Stripe.Event;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/stripe/webhook", () => {
  it("returns 503 when the webhook secret is not configured", async () => {
    webhookSecret = undefined;
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("returns 400 when the signature header is missing", async () => {
    const res = await POST(
      new Request("https://www.example.com/api/stripe/webhook", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when signature verification fails", async () => {
    constructEvent = () => {
      throw new Error("no signatures found matching the expected signature");
    };
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("returns 200 when fulfilment succeeds", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(calls).toEqual(["paid"]);
  });

  it("returns 500 so Stripe redelivers when fulfilment hits a transient failure", async () => {
    paidResult = { kind: "retry", reason: "orders update failed" };
    const res = await POST(request());
    expect(res.status).toBe(500);
  });

  it("returns 500 when the expiry path hits a transient failure", async () => {
    constructEvent = () =>
      ({ type: "checkout.session.expired", data: { object: { id: "cs_1" } } }) as unknown as Stripe.Event;
    failedResult = { kind: "retry", reason: "order expire failed" };
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(calls).toEqual(["failed"]);
  });

  it("does not fulfil a completed session whose payment is still processing", async () => {
    constructEvent = () =>
      ({
        type: "checkout.session.completed",
        data: { object: { id: "cs_1", payment_status: "unpaid" } },
      }) as unknown as Stripe.Event;
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("ignores unsubscribed event types with a 200", async () => {
    constructEvent = () =>
      ({ type: "payment_intent.succeeded", data: { object: {} } }) as unknown as Stripe.Event;
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });
});
