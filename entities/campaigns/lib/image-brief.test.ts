import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/kernel/ai/response";
import { brandWriterOutput } from "./ai/brand-writer";
import { channelsOutput } from "./writer/step-channels";
import { imageBriefHeadings, imageBriefInstruction, imageBriefPlaceholder } from "./image-brief";

// The two briefs, by their headings in order, as the approved designs name
// them: the code-drawn hero's three (R3.350) for a blog post or an email, and
// the five of MS19 (R3.343) for a social post.
const HERO = ["## Point", "## Figures", "## Layout"];
const SOCIAL = ["## Subject", "## Style", "## Environment", "## Lighting and mood", "## Details"];

function inOrder(text: string, headings: string[]): boolean {
  const at = headings.map((h) => text.indexOf(h));
  return at.every((i) => i >= 0) && at.every((i, n) => n === 0 || i > at[n - 1]);
}

// The instruction asks for both briefs, one after the other, so the part
// that asks for each is the text from its "For a ..." line to the next.
function partFor(text: string, opener: string): string {
  const from = text.indexOf(opener);
  if (from < 0) throw new Error(`no part opening "${opener}"`);
  const next = text.indexOf(" For a ", from + opener.length);
  return text.slice(from, next < 0 ? undefined : next);
}
const heroPart = (text: string) => partFor(text, "For a blog post or an email");
const socialPart = (text: string) => partFor(text, "For a LinkedIn, Facebook or X post");

type Schema = { properties: { outputs: { items: { properties: { image_brief_md: { description: string } } } } } };
const briefDescription = (schema: unknown) => (schema as Schema).properties.outputs.items.properties.image_brief_md.description;

describe("imageBriefHeadings", () => {
  it("asks a blog post and an email for the point, the figures and the layout", () => {
    expect(imageBriefHeadings("blog")).toEqual(["Point", "Figures", "Layout"]);
    expect(imageBriefHeadings("email")).toEqual(["Point", "Figures", "Layout"]);
  });

  it("keeps the five headings for a social post", () => {
    for (const channel of ["linkedin", "facebook", "twitter"]) {
      expect(imageBriefHeadings(channel)).toEqual(["Subject", "Style", "Environment", "Lighting and mood", "Details"]);
    }
  });
});

describe("imageBriefInstruction", () => {
  it("opens with the lead", () => {
    expect(imageBriefInstruction("The image brief for this post.").startsWith("The image brief for this post.")).toBe(true);
  });

  it("asks a blog post or an email for the three sections, in order, with what each one is", () => {
    const part = heroPart(imageBriefInstruction("The image brief."));
    expect(inOrder(part, HERO)).toBe(true);
    expect(part).toContain("## Point (the one thing the picture says)");
    expect(part).toContain("## Figures (the numbers to show, as the post states them)");
    expect(part).toContain("## Layout (stat, pair, row or steps, or your choice)");
    expect(part).not.toContain("## Subject");
  });

  it("tells a blog post or an email nothing about Style DNA fixing the palette", () => {
    expect(heroPart(imageBriefInstruction("The image brief."))).not.toMatch(/Style DNA|palette/);
  });

  // No image maker reads Style DNA since R3.350: a social post's set is drawn
  // by code in the brand's look, so the brief is told that, not that Style DNA
  // is sent with the image.
  it("asks a social post for the five sections, in order, and not to restate what the brand's look decides", () => {
    const part = socialPart(imageBriefInstruction("The image brief."));
    expect(inOrder(part, SOCIAL)).toBe(true);
    expect(part).not.toContain("## Point");
    expect(part).not.toMatch(/Style DNA/);
    expect(part).toMatch(/drawn by code in the brand's look/);
    expect(part).toMatch(/never restate colours, hex codes or fonts/);
  });
});

// The instruction reaches the model only through the schemas the two writer
// steps send, so this pins that each one carries both briefs.
describe("the writer's image_brief_md", () => {
  it("asks the campaign writer for the hero's brief and the social brief", () => {
    const text = briefDescription(jsonSchemaFor(brandWriterOutput));
    expect(inOrder(heroPart(text), HERO)).toBe(true);
    expect(inOrder(socialPart(text), SOCIAL)).toBe(true);
  });

  it("asks the channel step for the hero's brief and the social brief", () => {
    const text = briefDescription(jsonSchemaFor(channelsOutput));
    expect(inOrder(heroPart(text), HERO)).toBe(true);
    expect(inOrder(socialPart(text), SOCIAL)).toBe(true);
  });
});

describe("imageBriefPlaceholder", () => {
  it("starts a blog post's or an email's empty brief from the point, the figures and the layout", () => {
    expect(imageBriefPlaceholder("blog")).toBe("## Point\n\n## Figures\n\n## Layout");
    expect(imageBriefPlaceholder("email")).toBe("## Point\n\n## Figures\n\n## Layout");
  });

  it("starts a social post's empty brief from the five headings", () => {
    expect(imageBriefPlaceholder("linkedin")).toBe("## Subject\n\n## Style\n\n## Environment\n\n## Lighting and mood\n\n## Details");
  });
});
