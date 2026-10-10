import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The outbox (Z.9): an event a transaction recorded is published once it is
// claimed, marked published after, left pending when the publish fails, and
// never delivered from a shadow run (a publish there reaches no subscriber,
// and marking it published would lose the event).

const published: { name: string; payload: unknown }[] = [];
let mode: "live" | "shadow" = "live";

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/audit/run-context", () => ({ currentRunMode: () => mode }));
vi.mock("./bus", () => ({
  publish: async (name: string, payload: unknown) => {
    if ((payload as { applicationId?: string }).applicationId === "bad") throw new Error("publish(candidate.hired): invalid payload");
    published.push({ name, payload });
  },
}));

import { deliverOutbox } from "./outbox";

const HIRE = { applicationId: "app-1", jobRequisitionId: "req-1", candidateId: null, personId: "p-1", hiringManagerId: null, actorPersonId: "approver" };

beforeEach(() => {
  resetFake();
  published.length = 0;
  mode = "live";
});

describe("deliverOutbox", () => {
  it("claims, publishes and marks a pending row", async () => {
    script("event_outbox", { data: [{ id: "o1", event_name: "candidate.hired", payload: HIRE, attempts: 0 }] }, { data: [{ id: "o1" }] }, { data: null });
    const res = await deliverOutbox({ eventName: "candidate.hired", dedupeKey: "app-1" });
    expect(res).toEqual({ published: 1, failed: 0, exhausted: 0, errors: [] });
    expect(published).toEqual([{ name: "candidate.hired", payload: HIRE }]);
    const [read, claim, mark] = calls;
    expect(read.filters).toContainEqual(["eq", "dedupe_key", "app-1"]);
    expect(claim.filters).toEqual([["eq", "id", "o1"], ["is", "published_at", null], ["eq", "attempts", 0]]);
    expect(mark.payloads[0]).toMatchObject({ last_error: null });
    expect((mark.payloads[0] as { published_at: string }).published_at).toBeTruthy();
  });

  it("publishes nothing when another publisher holds the claim", async () => {
    script("event_outbox", { count: 0 }, { data: [{ id: "o1", event_name: "candidate.hired", payload: HIRE, attempts: 1 }] }, { data: [] });
    expect(await deliverOutbox()).toEqual({ published: 0, failed: 0, exhausted: 0, errors: [] });
    expect(published).toEqual([]);
  });

  it("leaves a row whose publish failed pending, with the reason", async () => {
    script("event_outbox", { count: 0 }, { data: [{ id: "o2", event_name: "candidate.hired", payload: { ...HIRE, applicationId: "bad" }, attempts: 0 }] }, { data: [{ id: "o2" }] }, { data: null });
    const res = await deliverOutbox();
    expect(res.failed).toBe(1);
    expect(calls[3].payloads[0]).toEqual({ last_error: "publish(candidate.hired): invalid payload" });
  });

  it("refuses an event the catalogue does not know", async () => {
    script("event_outbox", { count: 0 }, { data: [{ id: "o3", event_name: "not.an.event", payload: {}, attempts: 0 }] }, { data: [{ id: "o3" }] }, { data: null });
    const res = await deliverOutbox();
    expect(res.failed).toBe(1);
    expect(published).toEqual([]);
  });

  it("counts the rows that ran out of attempts, so the caller can report them", async () => {
    script("event_outbox", { count: 2 }, { data: [] });
    expect(await deliverOutbox()).toEqual({ published: 0, failed: 0, exhausted: 2, errors: [] });
    expect(calls[0].filters).toContainEqual(["gte", "attempts", 5]);
  });

  it("delivers nothing from a shadow run", async () => {
    mode = "shadow";
    expect(await deliverOutbox()).toEqual({ published: 0, failed: 0, exhausted: 0, errors: [] });
    expect(calls).toHaveLength(0);
  });
});
