import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// AK.5. Quests' Lark messages about an ask. The router is mocked: the test
// checks who is sent to, as which notice kind, keyed on what, and that nobody
// outside the current staff who may open the Asks page is ever reached (the PR
// #2120 lesson), whatever ids the fact carries. Holding a message to 09:00 is
// the router's own rule, proved in kernel/messaging/router.test.ts. Every
// message has one link, to /team/asks, and no email goes at all.
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: vi.fn(async () => "https://edge8.test") }));
vi.mock("@/kernel/identity/team-people", () => ({
  // Ana, Bao and the asker are staff; "contact-1" is a CRM contact with no team row, so no address here.
  currentTeamEmails: vi.fn(async (ids: string[]) => new Map(ids.filter((id) => ["ana", "bao", "giver"].includes(id)).map((id) => [id, `${id}@edge8.test`]))),
  peopleOnRecord: vi.fn(async () => new Map()),
}));
const mayOpenAsks = vi.hoisted(() => new Set<string>());
vi.mock("@/kernel/identity/may-open", () => ({
  recipientMayOpen: vi.fn(async (personId: string) => (href: string) => href === "/team/asks" && mayOpenAsks.has(personId)),
}));
vi.mock("@/kernel/messaging/router", () => ({ notify: vi.fn(async () => ({ status: "sent" })) }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => true) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("@/kernel/events/deliveries", () => ({ recordDelivery: vi.fn(async () => undefined) }));

import { getSiteOrigin } from "@/kernel/config/site-origin";
import { publish, resetSubscribers, subscribersOf } from "@/kernel/events";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { notify } from "@/kernel/messaging/router";
import { calledMessage, dueSoonMessage } from "./message-words";
import { sendCalled, sendDueSoon } from "./quest-messages";
import { subscriptions } from "./subscriptions";

const URL = "https://edge8.test/team/asks";
const called = {
  questId: "q1",
  title: "Share one prompt that saved you an hour",
  giverId: "giver",
  giverName: "Dana",
  required: true,
  personIds: ["ana", "bao", "contact-1", "giver"],
  heads: [{ headId: "h1", ask: "Post it", closesAt: "2026-10-28T10:00:00.000Z" }],
};
const due = { questId: "q1", headId: "h1", title: "Share one prompt that saved you an hour", ask: "Post it in the thread", closesAt: "2026-10-28T10:00:00.000Z", personIds: ["ana", "bao", "contact-1"] };

beforeEach(() => {
  vi.clearAllMocks();
  mayOpenAsks.clear();
  ["ana", "giver"].forEach((p) => mayOpenAsks.add(p));
});

const sent = () => vi.mocked(notify).mock.calls.map(([input]) => input);

describe("the words", () => {
  it("say who asked, what, when it is due and what to do, with one link to the Asks page", () => {
    const m = calledMessage(called, URL);
    expect(m.text).toBe(`Dana asked you: “Share one prompt that saved you an hour”\nDue Wed 28 Oct, 17:00 (Vietnam time). Answer it on Asks.\n${URL}`);
    expect(m.text.match(/https?:\/\//g)).toHaveLength(1);
    expect(m.text).not.toMatch(/Bounty|Giver|Turn-in|Quests/);
  });

  it("say on an optional ask that nobody is expected to answer, and name nobody when the asker's name is unknown", () => {
    const m = calledMessage({ ...called, required: false, giverName: undefined }, URL);
    expect(m.text).toContain("Someone asked you:");
    expect(m.text).toContain("It's optional: nobody is expected to answer, but you can on Asks.");
  });

  it("remind privately: what is due and when, naming nobody else, and say a late answer shows as late (AK.9)", () => {
    const m = dueSoonMessage(due, URL);
    expect(m.text).toBe(`Reminder: “Share one prompt that saved you an hour” is due Wed 28 Oct, 17:00 (Vietnam time).\nYou haven't answered yet. An answer after the due time shows as late.\n${URL}`);
    expect(m.text.match(/https?:\/\//g)).toHaveLength(1);
  });
});

describe("an ask", () => {
  it("sends each person asked who is staff and may open the Asks page one Lark message, never the asker, keyed on the ask and person", async () => {
    await sendCalled(called);
    // Bao is staff but may not open Asks; the contact has no team address; the asker asked themselves.
    expect(sent()).toEqual([
      { kind: "quests.ask", to: { person: "ana@edge8.test" }, message: calledMessage(called, URL).text, subject: "An ask was made of you", dedupeKey: "quests:called:q1:ana" },
    ]);
  });

  it("links to /team/asks, and sends no email", async () => {
    await sendCalled(called);
    expect(vi.mocked(notify).mock.calls[0][0].message).toContain("https://edge8.test/team/asks");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("is not a failure when the router holds the message to the morning, calls it a repeat, or the person opted out of Lark", async () => {
    for (const status of ["held", "duplicate", "declined", "queued", "shadow"]) {
      vi.mocked(notify).mockResolvedValueOnce({ status, until: "x", reason: "r" } as never);
      await expect(sendCalled(called)).resolves.toBeUndefined();
    }
  });

  it("raises a message that failed, and sends nothing without a site origin to link to", async () => {
    vi.mocked(notify).mockResolvedValueOnce({ status: "failed", error: "code 99" });
    await expect(sendCalled(called)).rejects.toThrow("Lark message to person ana not sent: code 99");
    vi.clearAllMocks();
    vi.mocked(getSiteOrigin).mockResolvedValueOnce("");
    await expect(sendCalled(called)).rejects.toThrow("no site origin");
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("the reminder the working day before", () => {
  const hashed = (personId: string) => createHash("sha256").update(personId).digest("hex").slice(0, 16);
  // Tuesday 27 October 2026: 10:00 and 18:30 in Saigon (UTC+7).
  const IN_HOURS = new Date("2026-10-27T03:00:00.000Z");
  const AFTER_HOURS = new Date("2026-10-27T11:30:00.000Z");

  it("sends each person one private Lark message as the same notice kind, staff who may open Asks only, keyed per head and a hash of the person", async () => {
    await sendDueSoon(due, IN_HOURS);
    expect(sent()).toEqual([
      { kind: "quests.ask", to: { person: "ana@edge8.test" }, message: dueSoonMessage(due, URL).text, subject: "A reminder about an ask", dedupeKey: `quests:due-soon:h1:${hashed("ana")}` },
    ]);
    expect(sent()[0].urgency).toBeUndefined();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    // The router decides on the instant this check made, so the 18:00 edge cannot fall between them.
    expect(vi.mocked(notify).mock.calls[0][1]).toBe(IN_HOURS);
  });

  it("sends nothing outside working hours, so no held row in the router's queue says who was still out (Khoa, 17 November 2026)", async () => {
    mayOpenAsks.add("bao");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(sendDueSoon(due, AFTER_HOURS)).resolves.toBeUndefined();
      expect(notify).not.toHaveBeenCalled();
      // The console line names the head, never a person.
      expect(warn.mock.calls.map((c) => String(c[0]))).toEqual(["[quests/messages] quest.head.due_soon on head h1: outside working hours, so no reminder is sent or held"]);
    } finally {
      warn.mockRestore();
    }
  });

  it("raises a failure with the head and a count, never a person; who it failed for goes to the console only", async () => {
    mayOpenAsks.add("bao");
    vi.mocked(notify).mockResolvedValueOnce({ status: "failed", error: "code 99" });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const raised = await sendDueSoon(due, IN_HOURS).then(
        () => null,
        (err: unknown) => (err instanceof Error ? err.message : String(err)),
      );
      expect(raised).toBe("[quests/messages] quest.head.due_soon: 1 of 2 reminder(s) on head h1 not sent");
      expect(raised).not.toMatch(/ana|bao/);
      expect(consoleError.mock.calls.map((c) => String(c[0]))).toEqual(["[quests/messages] quest.head.due_soon on head h1: Lark message to person ana not sent: code 99"]);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("on the bus", () => {
  it("listens to its own ask and reminder, and a failed send never reaches the publisher", async () => {
    resetSubscribers();
    subscriptions();
    expect([subscribersOf("quest.called"), subscribersOf("quest.head.due_soon")]).toEqual([["quests"], ["quests"]]);
    vi.mocked(notify).mockResolvedValue({ status: "failed", error: "code 99" });
    await expect(publish("quest.called", called)).resolves.toBeUndefined();
    resetSubscribers();
  });
});
