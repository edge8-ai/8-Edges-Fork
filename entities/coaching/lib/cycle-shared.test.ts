import { beforeEach, describe, expect, it, vi } from "vitest";

// AC.15, ADR 0013. Every coaching nudge (the pre-meeting agenda, the recap
// notices, the coach's roster, a member's "ask now") goes through notifyBoth, so
// this is the one place that proves a nudge reaches a recipient only when they
// may open each page it links to.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => true) }));
const sendLarkDm = vi.fn(async () => true);
vi.mock("@/kernel/messaging/lark-api", () => ({ sendLarkDm: (...a: unknown[]) => sendLarkDm(...(a as [])) }));
const cannotOpen = vi.hoisted(() => ({ emails: new Set<string>(), pages: new Set<string>(), fail: false }));
vi.mock("@/kernel/identity/may-open", () => ({
  recipientMayOpenByEmail: vi.fn(async (email: string | null | undefined) => {
    if (cannotOpen.fail) throw new Error("registers unreachable");
    return (href: string | null | undefined) =>
      Boolean(email && href) && !cannotOpen.emails.has(email as string) && !cannotOpen.pages.has(href as string);
  }),
}));

import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { notifyBoth } from "./cycle-shared";

const nudge = (over: Partial<Parameters<typeof notifyBoth>[0]> = {}) => ({
  email: "ben@example.test",
  subject: "Your agenda",
  html: "<p>Set it</p>",
  larkText: "Set it",
  logKind: "premeeting_nudge",
  links: ["https://example.test/team/my-coaching"],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  cannotOpen.emails.clear();
  cannotOpen.pages.clear();
  cannotOpen.fail = false;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("notifyBoth", () => {
  it("sends the DM and the email to a recipient who may open the page", async () => {
    expect(await notifyBoth(nudge())).toBe(true);
    expect(sendLarkDm).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("sends neither channel to a recipient who may not open the page", async () => {
    cannotOpen.emails.add("ben@example.test");
    expect(await notifyBoth(nudge())).toBe(false);
    expect(sendLarkDm).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when any one of its pages is closed to the recipient", async () => {
    cannotOpen.pages.add("https://example.test/team/goals");
    await notifyBoth(nudge({ links: ["https://example.test/team/my-coaching", "https://example.test/team/goals"] }));
    expect(sendLarkDm).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("trusts the predicate a digest already resolved, and asks the registers nothing more", async () => {
    cannotOpen.fail = true;
    await notifyBoth(nudge({ mayOpen: () => true }));
    expect(sendLarkDm).toHaveBeenCalledTimes(1);
  });

  it("sends nothing, and says so, when the registers cannot be read", async () => {
    cannotOpen.fail = true;
    expect(await notifyBoth(nudge())).toBe(false);
    expect(sendLarkDm).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("sends nothing to a coach with no address", async () => {
    expect(await notifyBoth(nudge({ email: null }))).toBe(false);
    expect(sendLarkDm).not.toHaveBeenCalled();
  });
});
