import { describe, expect, it } from "vitest";
import type { BountyDraft } from "../lib/bounty-draft";
import { askFormFromDraft, askRefusal, askTitle, askToSummon, blankAskForm, matchPeople, type AskForm } from "./ask-form";

// The New ask drawer's rules (AK.3; spec 2026-11-16, "New ask"), pure so the
// drawer's words and the payload it posts are decided and tested once. Every
// name is invented.
const me = { personId: "me", name: "Kim Dao", initials: "KD" };
const an = { personId: "an", name: "An Pham", initials: "AP" };
const binh = { personId: "binh", name: "Binh Tran", initials: "BT" };
const cuong = { personId: "cuong", name: "Cuong Le", initials: "CL" };
const PARTY = [me, an, binh, cuong];

// Wednesday 18 November 2026, 10:00 in Saigon.
const NOW = Date.parse("2026-11-18T03:00:00.000Z");
const TODAY = "2026-11-18";

const form = (patch: Partial<AskForm> = {}): AskForm => ({ ...blankAskForm(TODAY), text: "Share one takeaway", everyone: true, ...patch });

describe("askTitle", () => {
  it("is the ask itself, on one line", () => {
    expect(askTitle("  Share one takeaway\nfrom the launch  ")).toBe("Share one takeaway from the launch");
  });
  it("is cut with an ellipsis inside the title limit", () => {
    const long = askTitle("word ".repeat(100));
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("askRefusal", () => {
  it("passes a filled form", () => {
    expect(askRefusal(form(), NOW)).toBeNull();
  });
  it("asks for the ask first", () => {
    expect(askRefusal(form({ text: "   " }), NOW)).toBe("Write what you are asking.");
  });
  it("asks for someone to ask when nobody is picked", () => {
    expect(askRefusal(form({ everyone: false, picked: new Set() }), NOW)).toBe("Pick who to ask, or choose Everyone.");
    expect(askRefusal(form({ everyone: false, picked: new Set(["an"]) }), NOW)).toBeNull();
  });
  it("asks for a date, and refuses a day that has passed with a clear message", () => {
    expect(askRefusal(form({ date: "" }), NOW)).toBe("Pick an Answer by date.");
    expect(askRefusal(form({ date: "2026-11-17" }), NOW)).toBe("Answer by is in the past. Pick today or a later day.");
  });
  it("accepts today while its due time is still ahead, and refuses it once it has gone", () => {
    expect(askRefusal(form({ date: TODAY }), NOW)).toBeNull();
    const evening = Date.parse("2026-11-18T11:30:00.000Z"); // 18:30 in Saigon
    expect(askRefusal(form({ date: TODAY }), evening)).toBe("Today's 18:00 has passed. Pick tomorrow or a later day.");
  });
});

describe("askToSummon", () => {
  it("posts one head, learning off, due at the end of the Saigon working day", () => {
    const input = askToSummon(form({ date: "2026-11-20" }), PARTY, "me", null);
    expect(input.heads).toEqual([{ ask: "Share one takeaway", closesAt: "2026-11-20T11:00:00.000Z" }]);
    expect(input.learning).toBe(false);
  });
  it("keeps the whole ask as the head and a one-line title", () => {
    const input = askToSummon(form({ text: "Share one takeaway\nfrom the launch" }), PARTY, "me", null);
    expect(input.heads[0]!.ask).toBe("Share one takeaway\nfrom the launch");
    expect(input.title).toBe("Share one takeaway from the launch");
  });
  it("asks everyone except the asker", () => {
    expect(askToSummon(form(), PARTY, "me", null).partyPersonIds).toEqual(["an", "binh", "cuong"]);
  });
  it("asks only the people picked, never the asker, never someone who is not in the list", () => {
    const input = askToSummon(form({ everyone: false, picked: new Set(["binh", "me", "stranger"]) }), PARTY, "me", null);
    expect(input.partyPersonIds).toEqual(["binh"]);
  });
  it("sends no optional flag unless the person who may untick it did", () => {
    expect(askToSummon(form(), PARTY, "me", null)).not.toHaveProperty("optional");
    expect(askToSummon(form(), PARTY, "me", true)).not.toHaveProperty("optional");
    expect(askToSummon(form(), PARTY, "me", false)).toMatchObject({ optional: true });
  });
});

describe("matchPeople", () => {
  it("finds people by any part of their name, leaving out the picked and the asker", () => {
    expect(matchPeople(PARTY, "pham", new Set(), "me").map((p) => p.personId)).toEqual(["an"]);
    expect(matchPeople(PARTY, "T", new Set(), "me").map((p) => p.personId)).toEqual(["binh"]);
    expect(matchPeople(PARTY, "pham", new Set(["an"]), "me")).toEqual([]);
    expect(matchPeople(PARTY, "kim", new Set(), "me")).toEqual([]);
  });
  it("lists nobody for a blank search", () => {
    expect(matchPeople(PARTY, "  ", new Set(), "me")).toEqual([]);
  });
});

describe("askFormFromDraft", () => {
  const draft = (patch: Partial<BountyDraft> = {}): BountyDraft => ({
    title: "Watch the launch",
    note: "",
    learning: true,
    partyPersonIds: ["an", "stranger"],
    heads: [{ ask: "Watch the launch and share one takeaway", date: "2026-11-20", time: "17:00" }],
    from: "ask An to watch the launch",
    ...patch,
  });

  it("fills the ask, the people and the date from the draft, keeping only people who can be asked", () => {
    const f = askFormFromDraft(draft(), PARTY, "me", TODAY);
    expect(f.text).toBe("Watch the launch and share one takeaway");
    expect(f.everyone).toBe(false);
    expect([...f.picked]).toEqual(["an"]);
    expect(f.date).toBe("2026-11-20");
  });
  it("is Everyone when the draft names everybody who can be asked", () => {
    const f = askFormFromDraft(draft({ partyPersonIds: ["an", "binh", "cuong", "me"] }), PARTY, "me", TODAY);
    expect(f.everyone).toBe(true);
  });
  it("takes the title when the draft's head has no ask, and a week out when it has no date", () => {
    const f = askFormFromDraft(draft({ heads: [{ ask: "", date: "", time: "" }] }), PARTY, "me", TODAY);
    expect(f.text).toBe("Watch the launch");
    expect(f.date).toBe("2026-11-25");
  });
  it("leaves the extra heads and the learning flag behind: the page offers neither", () => {
    const f = askFormFromDraft(
      draft({ heads: [{ ask: "First", date: "2026-11-20", time: "" }, { ask: "Second", date: "2026-11-21", time: "" }] }),
      PARTY,
      "me",
      TODAY,
    );
    expect(f.text).toBe("First");
    expect(askToSummon(f, PARTY, "me", null).heads).toHaveLength(1);
    expect(askToSummon(f, PARTY, "me", null).learning).toBe(false);
  });
});
