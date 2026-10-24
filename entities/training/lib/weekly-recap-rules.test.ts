import { describe, expect, it } from "vitest";
import { MAX_SEND_ATTEMPTS, nextStep, sendAfterFor, subjectFor, validateProgress, weekLabel, weekStartOf, type RecapRow } from "./weekly-recap-rules";

const DUC = "8d06e46e-f4ea-4879-b2f7-2f168c0be03b";
const draft = { this_week: "Two sessions.", attendance: "Đức 2 of 2.", progress: [{ person_id: DUC, md: "Asked back twice." }], next_week: "Client calls." };
const row = (over: Partial<RecapRow>): RecapRow => ({ step: "drafting", sendAfter: null, attempts: 0, draft: null, ...over });

describe("the weekly recap's steps", () => {
  const monday = new Date("2026-10-19T01:00:00Z");
  it("goes drafting to waiting with the deadline, waiting to sending on Send now or at the deadline, sending to sent or failed, and holds", () => {
    expect(nextStep(row({}), { kind: "drafted", draft, sendAfter: "2026-10-19T01:00:00.000Z" }, new Date())).toMatchObject({ step: "waiting", draft, sendAfter: "2026-10-19T01:00:00.000Z" });
    const waiting = row({ step: "waiting", sendAfter: "2026-10-19T01:00:00.000Z", draft });
    expect(nextStep(waiting, { kind: "tick" }, new Date("2026-10-18T10:00:00Z"))).toBeNull();
    expect(nextStep(waiting, { kind: "tick" }, monday)).toEqual({ step: "sending" });
    expect(nextStep(waiting, { kind: "send-now" }, new Date("2026-10-17T10:00:00Z"))).toEqual({ step: "sending" });
    expect(nextStep(waiting, { kind: "hold", reason: "No session" }, monday)).toEqual({ step: "held", holdReason: "No session" });
    const sending = row({ step: "sending", draft });
    expect(nextStep(sending, { kind: "sent" }, monday)).toEqual({ step: "sent", error: null });
    expect(nextStep(sending, { kind: "send-failed", error: "boom" }, monday)).toEqual({ step: "failed", attempts: 1, error: "boom" });
  });

  it("retries a failed send on the next tick until the third failure, and never moves a sent or held row", () => {
    expect(nextStep(row({ step: "failed", attempts: 1, draft }), { kind: "tick" }, new Date())).toEqual({ step: "sending" });
    expect(nextStep(row({ step: "failed", attempts: MAX_SEND_ATTEMPTS, draft }), { kind: "tick" }, new Date())).toBeNull();
    expect(nextStep(row({ step: "sent", draft }), { kind: "send-now" }, new Date())).toBeNull();
    expect(nextStep(row({ step: "held", draft }), { kind: "tick" }, new Date())).toBeNull();
  });
});

describe("validateProgress", () => {
  it("lets a progress line stand only for a learner with a published recap line that week", () => {
    expect(validateProgress(draft, new Set([DUC]))).toEqual({ ok: true });
    expect(validateProgress(draft, new Set())).toMatchObject({ ok: false });
  });
});

describe("the week", () => {
  it("starts on the Monday, sends the next Monday at 08:00 Vietnam, and names no learner in the subject", () => {
    expect(weekStartOf("2026-10-15")).toBe("2026-10-12");
    expect(sendAfterFor("2026-10-12")).toBe("2026-10-19T01:00:00.000Z");
    expect(weekLabel("2026-10-12")).toBe("Week 42 · 12–16 Oct");
    expect(subjectFor("English Communication Practice", "2026-10-12")).toBe("English Communication Practice · Week 42 · 12–16 Oct");
  });
});
