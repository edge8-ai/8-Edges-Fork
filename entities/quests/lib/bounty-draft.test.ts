import { describe, expect, it } from "vitest";
import { internalPath } from "@/kernel/ui/url";
import { draftFromCall, draftLink, isDraftRef, planDraft, resolveDay } from "./bounty-draft";

// A Bounty drafted by Claude (QS.9; spec story 54): the assistant's reading of
// an instruction becomes a draft and a link that opens the Summon drawer with
// it filled in. The link carries only the id of the draft_bounty call, never
// the draft: no words, no names, no person ids in an address. The page
// rebuilds the draft from the call the reader's own history kept, and only
// staff the drawer may call come back out of it.

// Tuesday 27 October 2026, 10:00 in Saigon.
const NOW = new Date("2026-10-27T03:00:00Z");
const CALL = "toolu_01AbCdEfGhIjKlMnOpQr";
const who = (personId: string, name: string) => ({ personId, name, initials: name.slice(0, 2) });
const PARTY = [who("me", "Kim Dao"), who("an", "An Pham"), who("binh", "Binh Tran"), who("chi", "Chi Le"), who("chi2", "Chi Nguyen")];

const ask = (over: Record<string, unknown> = {}) => ({
  instruction: "give everyone a quest to watch the launch by Friday",
  title: "Watch the launch",
  note: "Watch the launch recording and turn in one thing you noticed.",
  call: "everyone",
  heads: [{ ask: "Watch the launch (recording is fine)", date: "friday" }],
  ...over,
});

describe("resolveDay", () => {
  it("reads a weekday as its next one, today included, and today, tomorrow and a date as themselves", () => {
    expect(resolveDay("friday", "2026-10-27")).toBe("2026-10-30");
    expect(resolveDay("Fri", "2026-10-27")).toBe("2026-10-30");
    expect(resolveDay("tuesday", "2026-10-27")).toBe("2026-10-27");
    expect(resolveDay("monday", "2026-10-27")).toBe("2026-11-02");
    expect(resolveDay("tomorrow", "2026-10-27")).toBe("2026-10-28");
    expect(resolveDay("2026-11-05", "2026-10-27")).toBe("2026-11-05");
    expect(resolveDay("next week", "2026-10-27")).toBeNull();
  });
});

describe("planDraft", () => {
  it("drafts everyone but the person drafting, due on Friday at the drawer's 18:00", () => {
    const out = planDraft(ask(), PARTY, "me", CALL, NOW);
    expect(out).toEqual({
      ok: true,
      draft: {
        title: "Watch the launch",
        note: "Watch the launch recording and turn in one thing you noticed.",
        learning: true,
        heads: [{ ask: "Watch the launch (recording is fine)", due: "Fri 30 Oct, 18:00 Saigon" }],
        call: { everyone: 4 },
      },
      link: `/team/quests?draft=${CALL}`,
    });
  });

  it("puts no personal text in the link: only the call's id, a path on this site the chat draws as one link", () => {
    const out = planDraft(ask({ call: ["An Pham", "binh"], note: "Mail lan@example.com" }), PARTY, "me", CALL, NOW);
    if (!out.ok) throw new Error(out.error);
    expect(out.link).toBe(`/team/quests?draft=${CALL}`);
    for (const said of ["launch", "Friday", "An", "an,", "binh", "@", "Pham"]) expect(out.link).not.toContain(said);
    expect(internalPath(out.link)).toBe(out.link);
    expect(`[Open the draft](${out.link})`).toMatch(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
  });

  it("resolves named people against the drawer's staff list", () => {
    const out = planDraft(ask({ call: ["an pham", "Binh"] }), PARTY, "me", CALL, NOW);
    if (!out.ok) throw new Error(out.error);
    expect(out.draft.call).toEqual({ people: ["An Pham", "Binh Tran"] });
  });

  it("asks back when a name matches more than one person, and refuses one that matches nobody who can be called", () => {
    expect(planDraft(ask({ call: ["Chi"] }), PARTY, "me", CALL, NOW)).toEqual({ ok: false, error: '"Chi" matches more than one person: Chi Le, Chi Nguyen. Ask which one.' });
    expect(planDraft(ask({ call: ["Dung"] }), PARTY, "me", CALL, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('matches "Dung"') });
    // The person drafting is never called on their own Bounty.
    expect(planDraft(ask({ call: ["Kim"] }), PARTY, "me", CALL, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('matches "Kim"') });
  });

  it("refuses a due time already passed, a day it cannot read, and a draft with no title or no head, in the summon's own words", () => {
    expect(planDraft(ask({ heads: [{ ask: "Now", date: "today", time: "09:00" }] }), PARTY, "me", CALL, NOW)).toMatchObject({ ok: false, error: expect.stringContaining("already passed") });
    expect(planDraft(ask({ heads: [{ ask: "Soon", date: "next week" }] }), PARTY, "me", CALL, NOW)).toMatchObject({ ok: false, error: expect.stringContaining("must be a date") });
    expect(planDraft(ask({ title: " " }), PARTY, "me", CALL, NOW)).toMatchObject({ ok: false, error: "Give the bounty a title." });
    expect(planDraft(ask({ heads: [] }), PARTY, "me", CALL, NOW)).toMatchObject({ ok: false, error: "A bounty needs at least one head." });
    const thirteen = Array.from({ length: 13 }, (_, i) => ({ ask: `Ask ${i}`, date: "friday" }));
    expect(planDraft(ask({ heads: thirteen }), PARTY, "me", CALL, NOW)).toMatchObject({ ok: false, error: "A bounty has at most twelve heads." });
  });
});

describe("isDraftRef", () => {
  it("takes a tool call's id and nothing else, so anything else is read as no draft without a read", () => {
    expect(isDraftRef(CALL)).toBe(true);
    expect(isDraftRef("claude")).toBe(false);
    expect(isDraftRef("toolu_x; drop")).toBe(false);
    expect(isDraftRef(undefined)).toBe(false);
    expect(draftLink(CALL)).toBe(`/team/quests?draft=${CALL}`);
  });
});

describe("draftFromCall", () => {
  it("rebuilds the drawer's draft from the call: the words, the due times and everyone it may call", () => {
    expect(draftFromCall(ask({ heads: [{ ask: "First (part one)", date: "friday", time: "17:00" }, { ask: "Second & last", date: "2026-11-03" }] }), PARTY, "me", NOW)).toEqual({
      title: "Watch the launch",
      note: "Watch the launch recording and turn in one thing you noticed.",
      learning: true,
      partyPersonIds: ["an", "binh", "chi", "chi2"],
      heads: [
        { ask: "First (part one)", date: "2026-10-30", time: "17:00" },
        { ask: "Second & last", date: "2026-11-03", time: "18:00" },
      ],
      from: "give everyone a quest to watch the launch by Friday",
    });
  });

  it("keeps only staff the drawer may call: a name that now means nobody, or several, or the reader, is left out", () => {
    expect(draftFromCall(ask({ call: ["An Pham", "Chi", "Dung", "Kim"] }), PARTY, "me", NOW)?.partyPersonIds).toEqual(["an"]);
  });

  it("leaves a day it cannot read blank for the drawer's default, and reads nothing from a call that is not a draft", () => {
    expect(draftFromCall(ask({ heads: [{ ask: "A", date: "soon" }] }), PARTY, "me", NOW)?.heads).toEqual([{ ask: "A", date: "", time: "" }]);
    expect(draftFromCall({ sql: "select 1" }, PARTY, "me", NOW)).toBeNull();
    expect(draftFromCall(null, PARTY, "me", NOW)).toBeNull();
  });

  it("cuts a long instruction with an ellipsis, and quotes none when the assistant passed none", () => {
    const from = draftFromCall(ask({ instruction: "x".repeat(400) }), PARTY, "me", NOW)?.from ?? "";
    expect(from).toHaveLength(200);
    expect(from.endsWith("…")).toBe(true);
    expect(draftFromCall(ask({ instruction: undefined }), PARTY, "me", NOW)?.from).toBe("");
  });
});
