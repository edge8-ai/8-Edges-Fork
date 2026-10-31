import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// QS.2. What Quests' facts say in the inbox, and to whom. Every row leads to
// the one page where every answer is given, and nobody is told what they did
// themselves. The email and the Lark DM are Quests' (its quest-messages test).
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/identity/access-of-person", () => ({
  accessOf: vi.fn(async (personId: string) => (personId === "nobody" ? null : { roles: [], permissions: () => ["quests.mine"], may: (p: string) => p === "quests.mine" })),
}));

import { EVENTS } from "@/kernel/events/catalogue";
import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";
import { onQuestCalled } from "./deliver";
import { calledDrafts, reactedDraft } from "./quest-kinds";

registerPermissionRegistry({ atoms: {}, routes: { "/team/quests": "quests.mine" }, actions: {}, implies: {}, roles: {} });
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
  it("is a fact the catalogue accepts, and refuses one that calls nobody", () => {
    expect(EVENTS["quest.called"].safeParse(called).success).toBe(true);
    expect(EVENTS["quest.called"].safeParse({ ...called, personIds: [] }).success).toBe(false);
  });

  it("writes one inbox row per person called, once each, leaving out the Giver, leading to Quests", () => {
    const drafts = calledDrafts(called);
    expect(drafts.map((d) => d.personId)).toEqual(["ana", "bao"]);
    expect(drafts[0]).toEqual({
      personId: "ana",
      kind: "quest.called",
      title: "Dana called you on a Bounty: “Share one prompt that saved you an hour”",
      body: "Due Wed 28 Oct, 17:00 (Vietnam time). It's required: turn it in on Quests.",
      adminHref: null,
      teamHref: "/team/quests",
      eventKey: "q1",
    });
  });

  it("asks an optional Bounty's party to accept or decline on the page, and names a Hydra's first due time", () => {
    const hydra = { ...called, required: false, heads: [{ headId: "h2", ask: "Show it", closesAt: "2026-10-30T10:00:00.000Z" }, ...called.heads] };
    expect(calledDrafts(hydra)[0].body).toBe("2 heads, the first due Wed 28 Oct, 17:00 (Vietnam time). Accept it on Quests if you're in, or decline it there.");
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

  it("tells the Turn-in's author, in the Giver's words, once per Turn-in", () => {
    expect(reactedDraft(reacted)).toEqual({
      personId: "ana",
      kind: "quest.reacted",
      title: "Dana reacted to your Turn-in on “Prompts”",
      body: "This saved me a morning too.",
      adminHref: null,
      teamHref: "/team/quests",
      eventKey: "h1:ana",
    });
  });

  it("says nothing to a Giver about their own Turn-in", () => {
    expect(reactedDraft({ ...reacted, personId: "giver" })).toBeNull();
  });
});
