import { describe, expect, it } from "vitest";
import { cardTemplateList, MAX_TEMPLATES, readCardTemplates } from "./card-templates";

// boards.metadata is jsonb with no constraint, which is exactly where a
// schema literal needs runtime proof (AR-02). The acceptance is blunt: a
// malformed template in the jsonb cannot crash the drawer.

describe("readCardTemplates (W.58)", () => {
  it("reads a well-formed list", () => {
    const list = readCardTemplates({
      card_templates: [{ name: "Client onboarding", description: "Kickoff, access, first review.", priority: "p2", humanTokens: 2, epicId: "e1" }],
    });
    expect(list).toEqual([
      { name: "Client onboarding", description: "Kickoff, access, first review.", priority: "p2", humanTokens: 2, epicId: "e1" },
    ]);
  });

  it("a board with none reads as none, in every shape that could mean that", () => {
    for (const metadata of [null, undefined, {}, { card_templates: null }, { card_templates: "oops" }, { card_templates: 3 }]) {
      expect(readCardTemplates(metadata)).toEqual([]);
    }
  });

  it("DROPS a malformed entry and keeps the good ones beside it", () => {
    // The whole point: one bad row in the jsonb must not take the drawer, or
    // the other templates, down with it.
    const list = readCardTemplates({
      card_templates: [
        { name: "Good" },
        { name: "" }, // no name
        { name: "Bad priority", priority: "p9" },
        { name: "Bad tokens", humanTokens: "two" },
        "not an object",
        null,
        { name: "Also good", priority: "p1" },
      ],
    });
    expect(list.map((t) => t.name)).toEqual(["Good", "Also good"]);
  });

  it("snaps a stored estimate onto the 0.05 grid, as a typed one is", () => {
    expect(readCardTemplates({ card_templates: [{ name: "x", humanTokens: 0.31 }] })[0].humanTokens).toBe(0.3);
  });

  it("refuses to read past the cap, so a runaway write cannot bloat every board page", () => {
    const many = Array.from({ length: MAX_TEMPLATES + 5 }, (_, i) => ({ name: `T${i}` }));
    expect(readCardTemplates({ card_templates: many })).toHaveLength(MAX_TEMPLATES);
  });
});

describe("cardTemplateList (the write boundary)", () => {
  it("accepts what the editor produces", () => {
    expect(cardTemplateList.safeParse([{ name: "Content publish", priority: "p3" }]).success).toBe(true);
  });

  it("refuses a nameless template and an unknown priority", () => {
    expect(cardTemplateList.safeParse([{ name: "  " }]).success).toBe(false);
    expect(cardTemplateList.safeParse([{ name: "x", priority: "urgent" }]).success).toBe(false);
  });

  it("refuses a negative estimate and a list over the cap", () => {
    expect(cardTemplateList.safeParse([{ name: "x", humanTokens: -1 }]).success).toBe(false);
    expect(cardTemplateList.safeParse(Array.from({ length: MAX_TEMPLATES + 1 }, () => ({ name: "x" }))).success).toBe(false);
  });

  it("what the boundary accepts, the reader reads back unchanged", () => {
    // The producer-against-pattern check: a schema that refuses the only
    // value its own form produces is a real failure mode here.
    const written = [{ name: "Migration", description: "Idempotent SQL, repair the ledger.", priority: "p1" as const, humanTokens: 1.5 }];
    const parsed = cardTemplateList.parse(written);
    expect(readCardTemplates({ card_templates: parsed })).toEqual(written);
  });
});
