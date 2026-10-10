import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script, tick, timeline as ordered } from "@/kernel/data/testing/fake-company-os";

// Whether a hire actually reaches the bus (S.2).
//
// hire-events.test.ts pins `candidateHiredFact`, which is a pure function over
// the row as it stood before the write. What it cannot see is the one fragile
// thing in the action: the row has to be READ BEFORE the update. Move the read
// below the write and `before.status` already says "hired", the fact is null,
// and every hire announces nothing while the suite stays green — onboarding
// falls back to the nightly backfill this event was meant to replace.
//
// The kernel fake answers each table's queries in call order, and that order is
// the property: the row read is scripted with the row as it stood, and the
// update with nothing. Move the read below the write in production and it
// receives the update's empty answer, states no hire, and the first test goes
// red. The publish and the write land on one timeline, because the
// announcement must also come after the write, never before.

type Application = {
  id: string;
  status: string;
  job_requisition_id: string;
  candidate_id: string | null;
  person_id: string | null;
};

// Writes and publishes in the order they HAPPENED (W.135): the fake stamps each
// query when it is answered, and the publish stamps itself on the same clock.
// Build order was not enough — an announce raced against its write in a
// Promise.all read as "write, then announce".
const stamped: { at: number; label: string }[] = [];
const timeline = () => ordered(stamped);
const updates = () => calls.filter((c) => c.table === "applications" && c.ops[0] === "update").map((c) => c.payloads[0] as Record<string, unknown>);

const ACTIVE: Application = { id: "app-1", status: "active", job_requisition_id: "jr-1", candidate_id: "cand-1", person_id: "person-1" };

/** A hire's two queries: the row as it stood, then the update's answer. */
function scriptHire(row: Application = ACTIVE, updateError: { message: string } | null = null) {
  script("applications", { data: { ...row } }, { error: updateError });
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: { from: (table: string) => builderFor(table) },
  htt: { from: (table: string) => builderFor(table) },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The action asks for its declared permission first (ADR 0013); recorded so the
// test pins which one.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { user: { email: "admin@example.com" } };
  },
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
// The hiring chain's own rule (Z.9) is tested beside the chain; here every
// application is outside a live chain unless a case says otherwise.
const chainRefusal = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("./chain/direct-decision", () => ({ directDecisionRefusal: vi.fn(async () => chainRefusal.value) }));
const closed = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("./chain/close", () => ({ closeChainForDecided: vi.fn(async (...args: unknown[]) => { closed.calls.push(args); }) }));
vi.mock("./interviews-writes", () => ({
  cancelScheduledInterviews: vi.fn(async () => ({ ok: true }) as { ok: true } | { ok: false; error: string }),
}));

import { resetSubscribers, subscribe } from "@/kernel/events";
import { updateApplication } from "./application-actions";

const published: unknown[] = [];

beforeEach(() => {
  asked.length = 0;
  resetFake();
  stamped.length = 0;
  published.length = 0;
  resetSubscribers();
  subscribe("test", "candidate.hired", (payload) => {
    stamped.push({ at: tick(), label: "publish:candidate.hired" });
    published.push(payload);
  });
});
afterEach(() => {
  resetSubscribers();
  vi.clearAllMocks();
});

describe("updateApplication", () => {
  it("announces the hire, reading the row before the write and publishing after it", async () => {
    scriptHire();
    // The requisition's hiring manager is read for the inbox (S.3).
    script("job_requisitions", { data: { hiring_manager_id: "manager-1" } });
    await expect(updateApplication("app-1", { status: "hired" })).resolves.toMatchObject({ ok: true });

    expect(published).toEqual([
      {
        applicationId: "app-1",
        jobRequisitionId: "jr-1",
        candidateId: "cand-1",
        personId: "person-1",
        hiringManagerId: "manager-1",
      },
    ]);
    // Read, write, announce — in that order. The read has to come first
    // because the stored status is the only thing that can tell a hire from a
    // re-save, and the announcement has to come last because the bus awaits
    // its handlers.
    expect(timeline()).toEqual(["applications:select", "applications:update", "job_requisitions:select", "publish:candidate.hired"]);
    expect(updates()[0]).toMatchObject({ status: "hired" });
    expect(asked).toEqual(["hiring.ats"]);
  });

  it("announces nothing when the write is refused", async () => {
    // Onboarding opening a journey for a decision the database then refused
    // would invent a new starter.
    scriptHire(ACTIVE, { message: "row level security" });

    await expect(updateApplication("app-1", { status: "hired" })).resolves.toEqual({
      ok: false,
      error: "row level security",
    });

    expect(published).toEqual([]);
  });

  it("announces nothing when the application was already hired", async () => {
    scriptHire({ ...ACTIVE, status: "hired" });

    await expect(updateApplication("app-1", { status: "hired" })).resolves.toMatchObject({ ok: true });

    expect(published).toEqual([]);
  });

  it("announces nothing for a write that is not a hire", async () => {
    // Two updates and no read.
    script("applications", { data: null }, { data: null });
    await expect(updateApplication("app-1", { rating: 4 })).resolves.toMatchObject({ ok: true });
    await expect(updateApplication("app-1", { status: "rejected" })).resolves.toMatchObject({ ok: true });

    expect(published).toEqual([]);
    // A patch that says nothing about hiring does not even read the row.
    expect(timeline().filter((t) => t === "applications:select")).toEqual([]);
  });

  it("ends the application's hiring chain run when a person rejects or withdraws it by hand (Z.9 review)", async () => {
    closed.calls.length = 0;
    script("applications", { data: null }, { data: null }, { data: null });
    await updateApplication("app-1", { status: "rejected" });
    await updateApplication("app-1", { status: "withdrawn" });
    await updateApplication("app-1", { rating: 3 });
    expect(closed.calls.map((c) => c.slice(0, 2))).toEqual([["app-1", "rejected"], ["app-1", "withdrawn"]]);
  });

  it("refuses Hired and Rejected on an application in a live hiring chain, and writes nothing (Z.9)", async () => {
    chainRefusal.value = "This application is in the hiring chain: propose it.";
    try {
      await expect(updateApplication("app-1", { status: "hired" })).resolves.toEqual({ ok: false, error: "This application is in the hiring chain: propose it." });
      await expect(updateApplication("app-1", { status: "rejected" })).resolves.toMatchObject({ ok: false });
      expect(calls).toEqual([]);
      expect(published).toEqual([]);
    } finally {
      chainRefusal.value = null;
    }
  });
});
