import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BEACON_HEAD_ASK, BeaconInput, planBeacon } from "./quest-rules";

// A Beacon's rows (QS.6; spec "Lighthouses": nothing counts views, likes or
// reach). The Beacon carries only the columns the ticket names: its kind and
// title, the Giver, the link, what it grew from, and the closed state it is
// written in. The author's own row carries the same link (the witness rule).
// And no column of the Quests tables stores reach, so nothing could count it.

const NOW = new Date("2026-10-24T03:00:00Z");
const AT = NOW.toISOString();
const LINK = "https://example.com/talk";

describe("planBeacon", () => {
  it("writes the Beacon with exactly these columns, and no other", () => {
    const { quest } = planBeacon({ title: "Talk at the meetup", url: LINK }, "khoa", null, NOW);
    expect(quest).toEqual({
      kind: "beacon",
      title: "Talk at the meetup",
      ask: "",
      giver_id: "khoa",
      lit_url: LINK,
      origin_quest_id: null,
      origin_idea_id: null,
      state: "closed",
      closed_at: AT,
      learning: false,
      required: false,
    });
  });

  it("puts the one link on the quest and on the author's own Turn-in", () => {
    const plan = planBeacon({ title: "Talk", url: LINK }, "khoa", null, NOW);
    expect(plan.head("b1")).toEqual({ quest_id: "b1", position: 1, ask: BEACON_HEAD_ASK, closes_at: AT, closed_at: AT });
    expect(plan.party("b1", "h1")).toEqual({ quest_id: "b1", head_id: "h1", person_id: "khoa", standing: "turned_in", accepted_at: AT, turned_in_at: AT, late: false, turn_in_url: LINK });
    expect(plan.party("b1", "h1").turn_in_url).toBe(plan.quest.lit_url);
  });

  it("records the held fire and its learning when it grew from one", () => {
    const { quest } = planBeacon({ title: "Talk", url: LINK }, "khoa", { questId: "r1", ideaId: "idea-1" }, NOW);
    expect(quest).toMatchObject({ origin_quest_id: "r1", origin_idea_id: "idea-1" });
    expect(planBeacon({ title: "Talk", url: LINK }, "khoa", { questId: "r1", ideaId: null }, NOW).quest.origin_idea_id).toBeNull();
  });
});

describe("BeaconInput", () => {
  it("trims, and takes an optional fire", () => {
    expect(BeaconInput.parse({ title: " Talk ", url: ` ${LINK} ` })).toEqual({ title: "Talk", url: LINK });
    expect(BeaconInput.parse({ title: "Talk", url: LINK, originQuestId: " r1 " }).originQuestId).toBe("r1");
    expect(BeaconInput.parse({ title: "Talk", url: LINK, originQuestId: null }).originQuestId).toBeNull();
  });

  it("refuses a missing title, a missing link and a link that is not http or https", () => {
    for (const bad of [{ title: "", url: LINK }, { title: "Talk", url: "" }, { title: "Talk", url: "mailto:a@b.c" }, { title: "Talk" }]) expect(BeaconInput.safeParse(bad).success).toBe(false);
  });
});

describe("no column stores reach", () => {
  // The generated types name every column production has; a reach, view, like
  // or click column on a Quests table would show here first.
  const types = readFileSync(fileURLToPath(new URL("../../../kernel/data/supabase/database.types.ts", import.meta.url)), "utf8");
  const rowColumns = (table: string): string[] => {
    const at = types.indexOf(`      ${table}: {\n        Row: {`);
    expect(at).toBeGreaterThan(-1);
    const body = types.slice(at, types.indexOf("        }", at + 1));
    return [...body.matchAll(/^ {10}([a-z_]+)\??:/gm)].map((m) => m[1]);
  };

  it.each(["quests", "quest_party", "quest_heads", "quest_reactions"])("%s", (table) => {
    const columns = rowColumns(table);
    expect(columns).toContain("id");
    expect(columns.filter((c) => /reach|view|like|click|impression|share_count|follower/.test(c))).toEqual([]);
  });
});
