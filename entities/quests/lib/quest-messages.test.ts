import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// QS.2. Quests' email and Lark DMs. Every send is mocked: the test checks who
// is sent to, through which channel, keyed on what, and that nobody outside
// the current staff who may open Quests is ever reached (the PR #2120 lesson),
// whatever ids the fact carries. Every message has one link and no button.
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: vi.fn(async () => "https://edge8.test") }));
vi.mock("@/kernel/identity/team-people", () => ({
  // Ana, Bao and the Giver are staff; "contact-1" is a CRM contact with no team row, so no address here.
  currentTeamEmails: vi.fn(async (ids: string[]) => new Map(ids.filter((id) => ["ana", "bao", "giver"].includes(id)).map((id) => [id, `${id}@edge8.test`]))),
  peopleOnRecord: vi.fn(async () => new Map()),
}));
const mayOpenQuests = vi.hoisted(() => new Set<string>());
vi.mock("@/kernel/identity/may-open", () => ({
  recipientMayOpen: vi.fn(async (personId: string) => (href: string) => href === "/team/quests" && mayOpenQuests.has(personId)),
}));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => true) }));
vi.mock("@/kernel/messaging/lark-api", () => ({ deliverLarkDm: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/kernel/audit/effects", () => ({
  once: vi.fn(async (_key: string, _kind: string, act: () => Promise<{ ok: boolean }>) => ({ acted: true, outcome: await act(), attempt: 1 })),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("@/kernel/events/deliveries", () => ({ recordDelivery: vi.fn(async () => undefined) }));

import { once } from "@/kernel/audit/effects";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { publish, resetSubscribers, subscribersOf } from "@/kernel/events";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { deliverLarkDm } from "@/kernel/messaging/lark-api";
import { calledMessage, dueSoonMessage } from "./message-words";
import { sendCalled, sendDueSoon } from "./quest-messages";
import { subscriptions } from "./subscriptions";

const URL = "https://edge8.test/team/quests";
const called = {
  questId: "q1",
  title: "Prompts",
  giverId: "giver",
  giverName: "Dana",
  required: true,
  personIds: ["ana", "bao", "contact-1", "giver"],
  heads: [{ headId: "h1", ask: "Post it", closesAt: "2026-10-28T10:00:00.000Z" }],
};
const due = { questId: "q1", headId: "h1", title: "Prompts", ask: "Post it in the thread", closesAt: "2026-10-28T10:00:00.000Z", personIds: ["ana", "bao", "contact-1"] };

beforeEach(() => {
  vi.clearAllMocks();
  mayOpenQuests.clear();
  ["ana", "giver"].forEach((p) => mayOpenQuests.add(p));
});

const emailed = () => vi.mocked(sendTransactionalEmail).mock.calls.map(([o]) => [o.to, o.idempotencyKey]);
const dmedTo = () => vi.mocked(deliverLarkDm).mock.calls.map(([to]) => to);

describe("the words", () => {
  it("say who called, the Bounty, when it is due and how to answer, with one link and no button, escaping what people typed", () => {
    const m = calledMessage({ ...called, title: "<b>Prompts</b> & you" }, URL);
    expect(m.subject).toBe("Dana called you on a Bounty: “<b>Prompts</b> & you”");
    expect(m.text).toBe(`Dana called you on a Bounty: “<b>Prompts</b> & you”\nDue Wed 28 Oct, 17:00 (Vietnam time). It's required: turn it in on Quests.\n${URL}`);
    expect(m.html).toContain("&lt;b&gt;Prompts&lt;/b&gt; &amp; you");
    expect(m.html.match(/<a /g)).toHaveLength(1);
    expect(m.html).not.toMatch(/<button|<form/i);
    expect(calledMessage({ ...called, required: false }, URL).text).toContain("Accept it on Quests if you're in, or decline it there.");
  });

  it("remind privately: what the head asks and when it is due, naming nobody else", () => {
    const m = dueSoonMessage(due, URL);
    expect(m.subject).toBe("Due at 17:00 Vietnam time: “Prompts”");
    expect(m.text).toBe(`“Prompts” is due at Wed 28 Oct, 17:00 (Vietnam time).\nThis head asks: Post it in the thread\nTurn it in on Quests. A late Turn-in still counts in full.\n${URL}`);
    expect(m.text.match(/https?:\/\//g)).toHaveLength(1);
  });
});

describe("a summon", () => {
  it("emails and DMs each person called who is staff and may open Quests, never the Giver, keyed on the quest and person", async () => {
    await sendCalled(called);
    // Bao is staff but may not open Quests; the contact has no team address; the Giver called themselves.
    expect(emailed()).toEqual([["ana@edge8.test", "quests:called:q1:ana"]]);
    expect(dmedTo()).toEqual(["ana@edge8.test"]);
    expect(vi.mocked(once).mock.calls.map(([key]) => key)).toEqual(["quests:called:q1:ana"]);
  });

  it("raises an email that did not go, and sends nothing without a site origin to link to", async () => {
    vi.mocked(sendTransactionalEmail).mockResolvedValueOnce(false);
    await expect(sendCalled(called)).rejects.toThrow("email to person ana not sent");
    vi.clearAllMocks();
    vi.mocked(getSiteOrigin).mockResolvedValueOnce("");
    await expect(sendCalled(called)).rejects.toThrow("no site origin");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(deliverLarkDm).not.toHaveBeenCalled();
  });
});

describe("the two-hour reminder", () => {
  const hashed = (personId: string) => createHash("sha256").update(personId).digest("hex").slice(0, 16);

  it("emails and DMs each person privately, staff who may open Quests only, keyed per head and a hash of the person", async () => {
    await sendDueSoon(due);
    expect(emailed()).toEqual([["ana@edge8.test", `quests:due-soon:h1:${hashed("ana")}`]]);
    expect(vi.mocked(once).mock.calls.map(([key]) => key)).toEqual([`quests:due-soon:h1:${hashed("ana")}`]);
    expect(vi.mocked(sendTransactionalEmail).mock.calls[0][0].to).toBe("ana@edge8.test");
    expect(dmedTo()).toEqual(["ana@edge8.test"]);
  });

  it("keeps the email and the DM off the CRM timeline, which a summon is not", async () => {
    await sendDueSoon(due);
    expect(vi.mocked(sendTransactionalEmail).mock.calls[0][0].crmLog).toBe(false);
    expect(vi.mocked(deliverLarkDm).mock.calls[0][2]).toEqual({ category: "other", crmLog: false });
    vi.clearAllMocks();
    await sendCalled(called);
    expect(vi.mocked(sendTransactionalEmail).mock.calls[0][0]).not.toHaveProperty("crmLog");
    expect(vi.mocked(deliverLarkDm).mock.calls[0][2]).toEqual({ category: "other" });
  });

  it("raises a failure with the head and a count, never a person; who it failed for goes to the console only", async () => {
    mayOpenQuests.add("bao");
    vi.mocked(sendTransactionalEmail).mockResolvedValueOnce(false);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const raised = await sendDueSoon(due).then(
        () => null,
        (err: unknown) => (err instanceof Error ? err.message : String(err)),
      );
      expect(raised).toBe("[quests/messages] quest.head.due_soon: 1 of 2 reminder(s) on head h1 not sent");
      expect(raised).not.toMatch(/ana|bao/);
      expect(consoleError.mock.calls.map((c) => String(c[0]))).toEqual(["[quests/messages] quest.head.due_soon on head h1: email to person ana not sent"]);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("on the bus", () => {
  it("listens to its own summon and reminder, and a failed send never reaches the publisher", async () => {
    resetSubscribers();
    subscriptions();
    expect([subscribersOf("quest.called"), subscribersOf("quest.head.due_soon")]).toEqual([["quests"], ["quests"]]);
    vi.mocked(sendTransactionalEmail).mockResolvedValue(false);
    await expect(publish("quest.called", called)).resolves.toBeUndefined();
    resetSubscribers();
  });
});
