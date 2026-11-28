import { beforeEach, describe, expect, it, vi } from "vitest";

// The kernel's two event routines (A.86, ADR 0027). The drain reports what the
// outbox did and fails its run while any event is out of attempts, so a row
// left for a person is said every five minutes until a person looks. The
// watchdog tells Operations once a day when an event missed a subscriber or a
// delivery failed, and says nothing when all is well.

const h = vi.hoisted(() => ({
  outbox: { published: 0, failed: 0, exhausted: 0, errors: [] as string[] },
  invariant: { ok: true, detail: "3 event(s) in the last day reached every subscriber" },
  told: [] as { kind: string; to: unknown; message: string; dedupeKey: string }[],
}));

vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
vi.mock("@/kernel/events/outbox", () => ({ deliverOutbox: async () => ({ ...h.outbox, errors: [...h.outbox.errors] }) }));
vi.mock("@/kernel/events/deliveries", () => ({
  deliveriesReachedSubscribers: () => ({ id: "Z.15.7", name: "every event reached every subscriber, and none failed", check: async () => h.invariant }),
}));
vi.mock("@/kernel/messaging/router", () => ({
  notify: async (n: { kind: string; to: unknown; message: string; dedupeKey: string }) => {
    h.told.push(n);
    return { status: "sent" };
  },
  failureOf: () => [],
}));
// The bearer gate and the run recording are the kernel's and tested there; a
// pass-through keeps this on what each routine decides, and the real outcome
// rule (Y.13) turns a routine's failures into the 500.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));

import { GET as drain } from "./event-outbox";
import { GET as watchdog } from "./event-deliveries";

type Body = { status?: string; published?: number; exhausted?: number; broken?: number; failures?: { subject: string; step: string; error: string }[] };

async function call(get: (req: Request) => Promise<Response>, name: string): Promise<{ status: number; body: Body }> {
  const res = await get(new Request(`https://example.test/api/cron/${name}/`));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  h.outbox = { published: 0, failed: 0, exhausted: 0, errors: [] };
  h.invariant = { ok: true, detail: "3 event(s) in the last day reached every subscriber" };
  h.told.length = 0;
});

describe("the event-outbox routine", () => {
  it("skips a run with nothing pending", async () => {
    const { status, body } = await call(drain, "event-outbox");
    expect(status).toBe(200);
    expect(body.status).toBe("skipped");
  });

  it("reports what it published", async () => {
    h.outbox.published = 2;
    const { status, body } = await call(drain, "event-outbox");
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", published: 2, failures: [] });
  });

  it("fails its run while an event is out of attempts, and names where to look", async () => {
    h.outbox.exhausted = 1;
    h.outbox.errors = ["event_outbox read: timeout"];
    const { status, body } = await call(drain, "event-outbox");
    expect(status).toBe(500);
    expect(body.failures).toEqual([
      { subject: "event_outbox", step: "deliver", error: "event_outbox read: timeout" },
      expect.objectContaining({ subject: "event_outbox", step: "exhausted", error: expect.stringContaining("published_at is null") }),
    ]);
  });
});

describe("the event-deliveries routine", () => {
  it("tells nobody when every event reached every subscriber", async () => {
    const { status, body } = await call(watchdog, "event-deliveries");
    expect(status).toBe(200);
    expect(body.broken).toBe(0);
    expect(h.told).toEqual([]);
  });

  it("tells Operations once a day when an event missed a subscriber, and fails its run", async () => {
    h.invariant = { ok: false, detail: "0 failed, 1 missed: board.card.completed 1a2b3c4d never reached ladders" };
    const { status, body } = await call(watchdog, "event-deliveries");
    expect(status).toBe(500);
    expect(body.broken).toBe(1);
    expect(h.told).toHaveLength(1);
    expect(h.told[0]).toMatchObject({ kind: "ops.alert", to: { chat: "ops" } });
    expect(h.told[0].message).toContain("never reached ladders");
    expect(h.told[0].dedupeKey).toMatch(/^kernel:event-deliveries-broken:\d{4}-\d{2}-\d{2}$/);
  });
});
