import { beforeEach, describe, expect, it, vi } from "vitest";

// Who hears about a FAST goal change. /team/goals promised "every change emails
// your manager" while only the member's own edits notified anyone; K.13 made
// the promise true in both directions, so the recipient rule is pinned here.

const sendTransactionalEmail = vi.fn(async () => true);
const sendLarkMessage = vi.fn(async (_text: string) => true);
const getManagerContact = vi.fn(async () => null as { email: string; displayName: string } | null);

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: () => ({}) } }));
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: (...a: unknown[]) => sendTransactionalEmail(...(a as [])),
}));
vi.mock("@/kernel/messaging/lark", () => ({
  sendLarkMessage: (text: string) => sendLarkMessage(text),
}));
vi.mock("@/kernel/identity/manager", () => ({
  getManagerContact: (...a: unknown[]) => getManagerContact(...(a as [])),
}));

import { OPS_EMAIL } from "@/kernel/config/contacts";
import { goalNotifyEmail, notifyGoalChange, summarize } from "./goal-notify";
import type { TeamActor } from "@/kernel/identity/team-auth";

const actor = { teamMemberId: "tm-1", displayName: "Mai", greeting: "Mai" } as TeamActor;
const goal = summarize(
  {
    title: "Cut days to hire to under 20 by 30 September",
    status: "active",
    quarterLabel: "2026-Q3",
    metricUnit: "days",
    targetValue: 20,
    currentValue: 28,
    dueDate: "2026-09-30",
  },
  "Hiring velocity",
);

const flush = () => new Promise((r) => setTimeout(r, 0));
const recipientOf = () => (sendTransactionalEmail.mock.calls[0] as unknown as [{ to: string }])[0].to;

beforeEach(() => {
  sendTransactionalEmail.mockClear();
  sendLarkMessage.mockClear();
  getManagerContact.mockReset();
  getManagerContact.mockResolvedValue(null);
});

describe("goalNotifyEmail", () => {
  it("sends a member's own edit to their manager", () => {
    expect(goalNotifyEmail("boss@example.test", null)).toBe("boss@example.test");
  });

  it("sends a coach's edit to the goal's owner, not to the coach's manager", () => {
    expect(goalNotifyEmail("boss@example.test", { email: "mai@example.test" })).toBe(
      "mai@example.test",
    );
  });

  it("never drops a notice: an unmanaged member, or an owner with no email, falls back to ops", () => {
    expect(goalNotifyEmail(null, null)).toBe(OPS_EMAIL);
    expect(goalNotifyEmail("boss@example.test", { email: null })).toBe(OPS_EMAIL);
  });
});

describe("notifyGoalChange", () => {
  it("a member edit asks for the manager and mails them", async () => {
    getManagerContact.mockResolvedValue({ email: "boss@example.test", displayName: "Boss" });
    notifyGoalChange(actor, "updated", goal);
    await flush();
    expect(getManagerContact).toHaveBeenCalledTimes(1);
    expect(recipientOf()).toBe("boss@example.test");
  });

  it("a coach edit mails the member and never looks up the coach's manager", async () => {
    notifyGoalChange(actor, "updated", goal, { email: "mai@example.test" });
    await flush();
    expect(getManagerContact).not.toHaveBeenCalled();
    expect(recipientOf()).toBe("mai@example.test");
    const sent = (sendTransactionalEmail.mock.calls[0] as unknown as [{ subject: string; html: string }])[0];
    expect(sent.subject).toContain("for you");
    expect(sent.html).toContain("for you");
  });

  it("never posts to the Lark coaching chat: that webhook is the external AIO Labz programme", async () => {
    notifyGoalChange(actor, "added", goal);
    await flush();
    expect(sendLarkMessage).not.toHaveBeenCalled();
  });
});
