import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// QS.2, AK.6. What Quests' facts say in the inbox, and to whom, in ask words.
// Every row leads to the one page where every answer is given, and nobody is
// told what they did themselves. The Lark message is Quests' (its
// quest-messages test); the Inbox's words agree with it.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/identity/access-of-person", () => ({
  accessOf: vi.fn(async (personId: string) => (personId === "nobody" ? null : { roles: [], permissions: () => ["quests.mine"], may: (p: string) => p === "quests.mine" })),
}));

import { EVENTS } from "@/kernel/events/catalogue";
import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";
import { NOTIFICATION_GROUPS } from "../ui/inbox-groups";
import { onQuestCalled } from "./deliver";
import { setMuted } from "./inbox";
import { ALWAYS_ON_KINDS, ASK_KINDS, NEEDS_YOU_KINDS } from "./kinds";
import { calledDrafts, reactedDraft } from "./quest-kinds";

registerPermissionRegistry({ atoms: {}, routes: { "/team/asks": "quests.mine" }, actions: {}, implies: {}, roles: {} });
beforeEach(() => resetFake());

const called = {
  questId: "q1",
  title: "Share one prompt that saved you an hour",
  giverId: "giver",
  giverName: "Dana",
  required: true,
  personIds: ["ana", "bao", "giver", "ana"],
  heads: [{ headId: "h1", ask: "Post it in the thread", closesAt: "2026-10-28T10:00:00.000Z" }],
};

describe("quest.called", () => {
  it("is a fact the catalogue accepts, and refuses one that asks nobody", () => {
    expect(EVENTS["quest.called"].safeParse(called).success).toBe(true);
    expect(EVENTS["quest.called"].safeParse({ ...called, personIds: [] }).success).toBe(false);
  });

  it("writes one inbox row per person asked, once each, leaving out the asker, leading to Asks", () => {
    const drafts = calledDrafts(called);
    expect(drafts.map((d) => d.personId)).toEqual(["ana", "bao"]);
    expect(drafts[0]).toEqual({
      personId: "ana",
      kind: "quest.called",
      title: "Dana asked you: “Share one prompt that saved you an hour”",
      body: "Due Wed 28 Oct, 17:00 (Vietnam time). Answer it on Asks.",
      adminHref: null,
      teamHref: "/team/asks",
      eventKey: "q1",
    });
  });

  it("says nobody is expected to answer an optional ask, and gives the earliest due time of several", () => {
    const several = { ...called, required: false, heads: [{ headId: "h2", ask: "Show it", closesAt: "2026-10-30T10:00:00.000Z" }, ...called.heads] };
    expect(calledDrafts(several)[0].body).toBe("Due Wed 28 Oct, 17:00 (Vietnam time). It's optional: nobody is expected to answer, but you can on Asks.");
  });

  it("names an asker it does not know as Someone", () => {
    expect(calledDrafts({ ...called, giverName: undefined })[0].title).toBe("Someone asked you: “Share one prompt that saved you an hour”");
  });

  it("is always on and waits in Waiting on you, From teammates, as TH.2 does for every ask made of you", () => {
    expect(ALWAYS_ON_KINDS).toContain("quest.called");
    expect(ASK_KINDS).toContain("quest.called");
    expect(NEEDS_YOU_KINDS).toContain("quest.called");
  });

  it("cannot be muted", async () => {
    await expect(setMuted("ana", "quest.called", true)).rejects.toThrow("always reach your inbox");
  });

  it("writes the rest when one person's row fails, then raises for the bus to record", async () => {
    script("notification_prefs", { data: null }, { data: null });
    script("notifications", { error: { message: "violates check constraint" } }, { error: null });
    await expect(onQuestCalled(called)).rejects.toThrow("1 row(s) not written; first: ana:");
    const written = calls.filter((c) => c.table === "notifications").flatMap((c) => c.payloads as { person_id: string; actor_id: string }[]);
    expect(written.map((r) => [r.person_id, r.actor_id])).toEqual([["ana", "giver"], ["bao", "giver"]]);
  });
});

describe("quest.reacted", () => {
  const reacted = { questId: "q1", headId: "h1", personId: "ana", giverId: "giver", giverName: "Dana", title: "Prompts", line: "This saved me a morning too." };

  it("tells the answerer they were thanked, in the asker's words, once per answer", () => {
    expect(reactedDraft(reacted)).toEqual({
      personId: "ana",
      kind: "quest.reacted",
      title: "Dana thanked you for your answer to “Prompts”",
      body: "This saved me a morning too.",
      adminHref: null,
      teamHref: "/team/asks",
      eventKey: "h1:ana",
    });
  });

  it("says nothing to an asker about their own answer", () => {
    expect(reactedDraft({ ...reacted, personId: "giver" })).toBeNull();
  });

  it("stays a mutable kind", () => {
    expect(ALWAYS_ON_KINDS).not.toContain("quest.reacted");
  });
});

describe("the Inbox settings name asks", () => {
  const rows = NOTIFICATION_GROUPS.flatMap((g) => g.rows);

  it("calls the group Coaching, reviews, training and asks", () => {
    expect(NOTIFICATION_GROUPS.map((g) => g.name)).toContain("Coaching, reviews, training and asks");
    expect(NOTIFICATION_GROUPS.map((g) => g.name)).not.toContain("Coaching, reviews, training and quests");
  });

  it("gives an ask and a thanks a row each, so only the thanks has a switch", () => {
    expect(rows.find((r) => r.kinds.includes("quest.called"))).toEqual({ label: "Someone asks you something", kinds: ["quest.called"] });
    expect(rows.find((r) => r.kinds.includes("quest.reacted"))).toEqual({ label: "Someone thanks you for an answer", kinds: ["quest.reacted"] });
  });
});
