import { beforeEach, describe, expect, it, vi } from "vitest";

const checkSendGate = vi.fn();
vi.mock("./broadcasts", () => ({ checkSendGate: (...a: unknown[]) => checkSendGate(...a) }));

const dailySendCap = vi.fn();
// A factory mock replaces the WHOLE module, so it has to grow when this module
// starts importing more of it. `capLiftsAt` is pure and is the answer under
// test here, so it keeps its real implementation rather than being stubbed.
vi.mock("./send-cap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./send-cap")>()),
  dailySendCap: (...a: unknown[]) => dailySendCap(...a),
}));

import { decideSend } from "./send-decision";

const now = new Date("2026-09-18T02:00:00Z");

beforeEach(() => {
  checkSendGate.mockReset();
  dailySendCap.mockReset();
  checkSendGate.mockResolvedValue({ verdict: "send" });
  dailySendCap.mockResolvedValue({ hold: null });
});

describe("decideSend", () => {
  it("sends when the gate passes and nothing is capped", async () => {
    expect(await decideSend("broadcast", { personId: "p1", email: "a@example.com" }, now)).toEqual({ action: "send" });
  });

  it("skips a suppressed person, carrying the gate's reason", async () => {
    checkSendGate.mockResolvedValue({ verdict: "suppress", reason: "unsubscribed" });
    expect(await decideSend("personal", { personId: "p1", email: "a@example.com" }, now)).toEqual({
      action: "skip",
      reason: "unsubscribed",
    });
    // A suppression is decided before the cap is even asked.
    expect(dailySendCap).not.toHaveBeenCalled();
  });

  it("defers, never skips, when the gate read fails", async () => {
    checkSendGate.mockResolvedValue({ verdict: "error", message: "db hiccup" });
    const d = await decideSend("broadcast", { personId: "p1", email: "a@example.com" }, now);
    expect(d.action).toBe("defer");
    // No retry moment: the next tick should retry, not tomorrow.
    expect(d).toMatchObject({ retryAfter: null });
  });

  it("defers rather than sending when the cap evidence cannot be read", async () => {
    dailySendCap.mockResolvedValue({ hold: "cap evidence unavailable", error: "timeout" });
    const d = await decideSend("personal", { personId: "p1", email: "a@example.com" }, now);
    expect(d.action).toBe("defer");
    expect(d).toMatchObject({ retryAfter: null });
  });

  it("defers as capped when the person already had today's email", async () => {
    dailySendCap.mockResolvedValue({ hold: "emailed today" });
    expect(await decideSend("broadcast", { personId: "p1", email: "a@example.com" }, now)).toEqual({
      action: "defer",
      reason: "emailed today",
      // Midnight of the NEXT company day: `now` is 09:00 Saigon on the 18th,
      // so the cap this decision is honouring lifts at the start of the 19th.
      retryAfter: new Date("2026-09-19T00:00:00+07:00"),
    });
  });

  // The defect A.15 fixes: the cap must be asked for BOTH kinds, with the kind
  // passed through, or the rule is enforced on one side only.
  it.each(["broadcast", "personal"] as const)("asks the cap for a %s send", async (kind) => {
    await decideSend(kind, { personId: "p1", email: "a@example.com" }, now);
    expect(dailySendCap).toHaveBeenCalledTimes(1);
    expect(dailySendCap.mock.calls[0][0]).toBe(kind);
    expect(dailySendCap.mock.calls[0][1]).toBe("p1");
  });
});
