import { describe, expect, it } from "vitest";
import { fridayOpensWeek, MAX_SEND_ATTEMPTS, nextStep, sendAfterFor, subjectFor, validateProgress, weekLabel, weekStartOf, type RecapRow } from "./weekly-recap-rules";

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
  it("starts on the Monday, sends the next Monday at 09:00 Vietnam, and names no learner in the subject", () => {
    expect(weekStartOf("2026-10-15")).toBe("2026-10-12");
    expect(sendAfterFor("2026-10-12")).toBe("2026-10-19T02:00:00.000Z");
    expect(weekLabel("2026-10-12")).toBe("Week 42 · 12–16 Oct");
    expect(subjectFor("English Communication Practice", "2026-10-12")).toBe("English Communication Practice · Week 42 · 12–16 Oct");
  });
});

// Z.20: the week's recaps open on the Saigon Friday from 16:00, and on no
// other day. Until 2026-11-16 they opened on the Saigon Saturday.
describe("fridayOpensWeek", () => {
  it("opens on Friday from 16:00 Saigon, not before", () => {
    expect(fridayOpensWeek("2026-10-16", new Date("2026-10-16T09:00:00Z"))).toBe(true);
    expect(fridayOpensWeek("2026-10-16", new Date("2026-10-16T16:59:00Z"))).toBe(true);
    expect(fridayOpensWeek("2026-10-16", new Date("2026-10-16T08:59:00Z"))).toBe(false);
    // Friday 01:00 Saigon is Thursday 18:00 UTC: not yet.
    expect(fridayOpensWeek("2026-10-16", new Date("2026-10-15T18:00:00Z"))).toBe(false);
  });

  it("never opens on a Saturday or a Thursday", () => {
    expect(fridayOpensWeek("2026-10-17", new Date("2026-10-17T03:00:00Z"))).toBe(false);
    expect(fridayOpensWeek("2026-10-17", new Date("2026-10-16T18:00:00Z"))).toBe(false);
    expect(fridayOpensWeek("2026-10-15", new Date("2026-10-15T10:00:00Z"))).toBe(false);
  });
});
