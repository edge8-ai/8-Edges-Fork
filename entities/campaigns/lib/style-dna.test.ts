import { describe, expect, it } from "vitest";
import {
  isStyleDnaDraft,
  parseStyleDna,
  serializeStyleDna,
  setStyleDnaDraft,
  styleDnaDecisionsFor,
  styleDnaForm,
  styleDnaFromForm,
  styleDnaGuidanceFor,
  styleDnaHeadingFor,
  styleDnaPalette,
  styleDnaText,
} from "./style-dna";

// A brand's Style DNA as the approved design writes it, abbreviated, with a
// label the format does not know and a stray line a person typed by hand.
const dna = `<!-- style-dna: draft -->
## Fixed
- Palette: Navy ground, Blue accent.
- Type: Manrope, sentence case.
- Signature: The founder's, bottom right.
Keep it calm.

## LinkedIn
- Composition: One idea in the middle third.
- Camera angle: Straight on.

## Facebook
- Composition: One figure or object, close.
- Environment: A wood table in daylight.

## X
- Energy: Punchy.`;

// The free text every brand had before Style DNA (the writer fixture's).
const legacy = "Edge8 palette, editorial. Navy ground, Blue and Mint accents, Manrope.";

describe("parseStyleDna / serializeStyleDna", () => {
  it("round-trips the text exactly, keeping unknown labels and stray lines", () => {
    expect(serializeStyleDna(parseStyleDna(dna))).toBe(dna);
  });
  it("reads the sections and the draft flag", () => {
    const parsed = parseStyleDna(dna);
    expect(parsed.draft).toBe(true);
    expect(parsed.sections.map((s) => s.heading)).toEqual(["Fixed", "LinkedIn", "Facebook", "X"]);
    expect(parsed.sections[0].lines).toContain("Keep it calm.");
  });
  it("round-trips legacy text unchanged", () => {
    expect(serializeStyleDna(parseStyleDna(legacy))).toBe(legacy);
    expect(serializeStyleDna(parseStyleDna("Line one.\n\nLine two.\n"))).toBe("Line one.\n\nLine two.\n");
  });
  it("leaves ### sub-headings inside their section", () => {
    const md = "## Fixed\n### Palette\nNavy.";
    expect(parseStyleDna(md).sections).toEqual([{ heading: "Fixed", lines: ["### Palette", "Navy."] }]);
  });
});

describe("the draft flag", () => {
  it("is set and cleared without touching any other line", () => {
    const approved = setStyleDnaDraft(dna, false);
    expect(approved).toBe(dna.replace("<!-- style-dna: draft -->\n", ""));
    expect(isStyleDnaDraft(approved)).toBe(false);
    expect(setStyleDnaDraft(approved, true)).toBe(dna);
    expect(isStyleDnaDraft(dna)).toBe(true);
  });
});

describe("styleDnaGuidanceFor", () => {
  it("maps twitter to the ## X section", () => {
    expect(styleDnaHeadingFor("twitter")).toBe("X");
    const g = styleDnaGuidanceFor(dna, "twitter");
    expect(g).toContain("## X\n- Energy: Punchy.");
    expect(g).not.toContain("## LinkedIn");
  });
  it("gives a Facebook entry Fixed and Facebook, and nothing from LinkedIn", () => {
    expect(styleDnaGuidanceFor(dna, "facebook")).toBe(`## Fixed
- Palette: Navy ground, Blue accent.
- Type: Manrope, sentence case.
- Signature: The founder's, bottom right.
Keep it calm.

## Facebook
- Composition: One figure or object, close.
- Environment: A wood table in daylight.`);
  });
  it("gives a channel without a section (email, the blog) the Fixed guidance alone", () => {
    for (const channel of ["email", "blog", null]) {
      const g = styleDnaGuidanceFor(dna, channel);
      expect(g).toContain("- Palette: Navy ground, Blue accent.");
      expect(g).not.toMatch(/## (LinkedIn|Facebook|X)/);
    }
  });
  it("never carries the draft marker", () => {
    for (const channel of ["linkedin", "facebook", "twitter", "email", "blog"]) {
      expect(styleDnaGuidanceFor(dna, channel)).not.toContain("style-dna");
    }
    expect(styleDnaGuidanceFor(`<!-- style-dna: draft -->\n${legacy}`, "linkedin")).toBe(legacy);
  });
  it("returns legacy text unchanged for every channel", () => {
    for (const channel of ["linkedin", "facebook", "twitter", "email", "blog", null]) {
      expect(styleDnaGuidanceFor(legacy, channel)).toBe(legacy);
    }
  });
  it("is null when the brand has no image style", () => {
    expect(styleDnaGuidanceFor(null, "linkedin")).toBeNull();
    expect(styleDnaGuidanceFor("  \n", "linkedin")).toBeNull();
    expect(styleDnaGuidanceFor("<!-- style-dna: draft -->", "linkedin")).toBeNull();
  });
});

describe("the wordmark line", () => {
  const withWordmark = dna.replace("Keep it calm.", "- Wordmark: A small tracked EDGE8 at the bottom centre.\nKeep it calm.");
  it("stays where a person reads it", () => {
    expect(styleDnaGuidanceFor(withWordmark, "linkedin")).toContain("- Wordmark:");
    expect(styleDnaDecisionsFor(withWordmark, "linkedin")).toMatchObject({
      legacy: false,
      fixed: expect.arrayContaining(["- Wordmark: A small tracked EDGE8 at the bottom centre."]),
    });
  });
});

describe("styleDnaDecisionsFor", () => {
  it("splits one channel's guidance into the Fixed lines and that channel's own", () => {
    expect(styleDnaDecisionsFor(dna, "facebook")).toEqual({
      legacy: false,
      fixed: ["- Palette: Navy ground, Blue accent.", "- Type: Manrope, sentence case.", "- Signature: The founder's, bottom right.", "Keep it calm.", ""],
      channel: ["- Composition: One figure or object, close.", "- Environment: A wood table in daylight.", ""],
    });
  });
  it("reads the twitter channel from the X section", () => {
    expect(styleDnaDecisionsFor(dna, "twitter")).toMatchObject({ legacy: false, channel: ["- Energy: Punchy."] });
  });
  it("gives a channel with no section of its own the Fixed lines alone", () => {
    expect(styleDnaDecisionsFor(dna, "email")).toMatchObject({ legacy: false, channel: [] });
  });
  it("counts text above the sections as Fixed, since every channel reads it", () => {
    expect(styleDnaDecisionsFor("Never stock.\n## Fixed\n- Mood: Calm.", "linkedin")).toEqual({
      legacy: false,
      fixed: ["Never stock.", "- Mood: Calm."],
      channel: [],
    });
  });
  it("returns legacy text whole, as the image prompt gets it", () => {
    expect(styleDnaDecisionsFor(legacy, "facebook")).toEqual({ legacy: true, text: legacy });
    expect(styleDnaDecisionsFor(null, "facebook")).toEqual({ legacy: true, text: null });
  });
});

describe("styleDnaText", () => {
  it("is the whole DNA, every channel, without the draft marker", () => {
    expect(styleDnaText(dna)).toBe(dna.replace("<!-- style-dna: draft -->\n", ""));
    expect(styleDnaText(legacy)).toBe(legacy);
    expect(styleDnaText(null)).toBeNull();
  });
});

// The Style DNA card on the brand's Visuals tab edits a StyleDnaForm and saves
// what styleDnaFromForm writes, so these cases are what the card saves.
describe("styleDnaForm", () => {
  it("reads each labelled field, by section", () => {
    const form = styleDnaForm(dna);
    expect(form.draft).toBe(true);
    expect(form.freeText).toBe("");
    expect(form.fixed.Palette).toBe("Navy ground, Blue accent.");
    expect(form.fixed.Mood).toBe("");
    expect(form.channels.linkedin["Camera angle"]).toBe("Straight on.");
    expect(form.channels.twitter.Energy).toBe("Punchy.");
    expect(form.channels.facebook["Camera angle"]).toBe("");
  });
  it("reads legacy text as one free-text field and no labelled fields", () => {
    const form = styleDnaForm(legacy);
    expect(form.freeText).toBe(legacy);
    expect(form.draft).toBe(false);
    expect(Object.values(form.fixed).every((v) => v === "")).toBe(true);
  });
});

describe("styleDnaFromForm", () => {
  it("writes the fields in the Style DNA format, a section only where a field is set", () => {
    const form = styleDnaForm(null);
    form.fixed.Palette = "Navy, Blue accent.";
    form.fixed.Type = "Manrope, sentence case.";
    form.channels.linkedin.Composition = "One idea in the middle third.";
    form.channels.linkedin["Camera angle"] = "Straight on.";
    form.channels.twitter.Energy = "Punchy.";
    expect(styleDnaFromForm(form, null)).toBe(`## Fixed
- Palette: Navy, Blue accent.
- Type: Manrope, sentence case.

## LinkedIn
- Composition: One idea in the middle third.
- Camera angle: Straight on.

## X
- Energy: Punchy.`);
  });
  it("saves an untouched draft exactly as stored, unknown labels and stray lines kept", () => {
    expect(styleDnaFromForm(styleDnaForm(dna), dna)).toBe(dna);
  });
  it("changes only the edited lines", () => {
    const form = styleDnaForm(dna);
    form.fixed.Palette = "";
    form.fixed.Type = "Inter.";
    form.fixed.Mood = "Calm.";
    form.channels.facebook["Camera angle"] = "Slightly above.";
    expect(styleDnaFromForm(form, dna)).toBe(
      dna
        .replace("- Palette: Navy ground, Blue accent.\n", "")
        .replace("- Type: Manrope, sentence case.", "- Type: Inter.")
        .replace("- Signature: The founder's, bottom right.\n", "- Signature: The founder's, bottom right.\n- Mood: Calm.\n")
        .replace("- Environment: A wood table in daylight.", "- Environment: A wood table in daylight.\n- Camera angle: Slightly above."),
    );
  });
  it("approving writes the same text without the draft marker", () => {
    const approved = styleDnaFromForm({ ...styleDnaForm(dna), draft: false }, dna);
    expect(approved).toBe(dna.replace("<!-- style-dna: draft -->\n", ""));
    expect(isStyleDnaDraft(approved)).toBe(false);
  });
  it("keeps each value on its own line", () => {
    const form = styleDnaForm(null);
    form.fixed.Mood = "Calm.\n  Never hype. ";
    expect(styleDnaFromForm(form, null)).toBe("## Fixed\n- Mood: Calm. Never hype.");
  });
  it("saves legacy text unchanged while no field is set", () => {
    expect(styleDnaFromForm(styleDnaForm(legacy), legacy)).toBe(legacy);
    const drafted = `<!-- style-dna: draft -->\n${legacy}`;
    expect(styleDnaFromForm(styleDnaForm(drafted), drafted)).toBe(drafted);
  });
  it("keeps legacy text above the sections once a field is set, so every image still reads it", () => {
    const form = styleDnaForm(legacy);
    form.fixed.Mood = "Calm.";
    const saved = styleDnaFromForm(form, legacy);
    expect(saved).toBe(`${legacy}\n\n## Fixed\n- Mood: Calm.`);
    expect(styleDnaGuidanceFor(saved, "linkedin")).toBe(`${legacy}\n\n## Fixed\n- Mood: Calm.`);
  });
  it("drops the free text once a person clears it", () => {
    const form = styleDnaForm(legacy);
    form.freeText = "";
    form.fixed.Mood = "Calm.";
    expect(styleDnaFromForm(form, legacy)).toBe("## Fixed\n- Mood: Calm.");
  });
});

describe("styleDnaPalette", () => {
  it("reads each named colour with its hex and role from the Palette line", () => {
    const line =
      "Navy #04102D ground, " + // colour-ok: brand data under test, not a UI colour
      "Warm Amber #e9a23b sparingly, " + // colour-ok: brand data under test, not a UI colour
      "Mint accent";
    expect(styleDnaPalette(line)).toEqual([
      { name: "Navy", role: "Ground", hex: "#04102D" }, // colour-ok: brand data under test, not a UI colour
      { name: "Warm Amber", role: "Sparingly", hex: "#E9A23B" }, // colour-ok: brand data under test, not a UI colour
    ]);
  });
  it("is empty when the line names no hex", () => {
    expect(styleDnaPalette("Navy ground, Blue accent.")).toEqual([]);
    expect(styleDnaPalette("")).toEqual([]);
  });
});
