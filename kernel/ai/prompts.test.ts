import { describe, expect, it } from "vitest";
import { definePrompt, fillPrompt, isPrompt, promptSite, promptVersionOf } from "@/kernel/ai/prompts";

// The version is the contract between a prompt's text, the ai_calls rows it
// leaves and the eval record in scripts/prompt-evals.json, so these tests pin
// what changes it and what does not. Every text below is invented.

const TEXTS = { system: "You sort invented fruit.", user: "Fruit: {{fruit}}" };

describe("prompt versions", () => {
  it("is the same hash on every run, pinned so a change to the derivation is a visible diff", () => {
    // Pinned literally: a derivation change would silently re-version every
    // prompt and turn the eval gate red everywhere at once.
    expect(definePrompt("demo-site", TEXTS).version).toBe("deb02d46feac");
    expect(definePrompt("demo-site", { ...TEXTS }).version).toBe(definePrompt("demo-site", TEXTS).version);
  });

  it("records name@version as the ref", () => {
    const p = definePrompt("demo-site/variant", TEXTS);
    expect(p.ref).toBe(`demo-site/variant@${p.version}`);
    expect(p.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it("changes on a whitespace-only edit, because the model reads every character", () => {
    const base = promptVersionOf(TEXTS);
    expect(promptVersionOf({ ...TEXTS, system: `${TEXTS.system} ` })).not.toBe(base);
    expect(promptVersionOf({ ...TEXTS, user: "Fruit:  {{fruit}}" })).not.toBe(base);
    expect(promptVersionOf({ ...TEXTS, system: "You sort invented\nfruit." })).not.toBe(base);
  });

  it("changes when the user template or a part changes, and not with the order parts are listed in", () => {
    const withParts = promptVersionOf({ ...TEXTS, parts: { retry: "Try again.", note: "Be brief." } });
    expect(promptVersionOf({ ...TEXTS, parts: { note: "Be brief.", retry: "Try again." } })).toBe(withParts);
    expect(promptVersionOf({ ...TEXTS, parts: { note: "Be brief.", retry: "Try once more." } })).not.toBe(withParts);
    expect(promptVersionOf({ system: TEXTS.system })).not.toBe(promptVersionOf(TEXTS));
  });

  it("does not depend on the prompt's name, so a renamed prompt keeps its text's version", () => {
    expect(definePrompt("demo-site", TEXTS).version).toBe(definePrompt("other-site", TEXTS).version);
  });

  it("refuses a name that is not a site or site/variant, and a prompt with no text at all", () => {
    expect(() => definePrompt("Demo Site", TEXTS)).toThrow(/not a prompt name/);
    expect(() => definePrompt("a/b/c", TEXTS)).toThrow(/not a prompt name/);
    expect(() => definePrompt("demo-site", { system: "  " })).toThrow(/neither system text nor a user template/);
    expect(definePrompt("demo-site", { user: "Fruit: {{fruit}}" }).system).toBeNull();
  });

  it("is recognisable and frozen", () => {
    const p = definePrompt("demo-site", TEXTS);
    expect(isPrompt(p)).toBe(true);
    expect(isPrompt({ ...p })).toBe(false);
    expect(Object.isFrozen(p)).toBe(true);
    expect(promptSite(p)).toBe("demo-site");
    expect(promptSite("demo-site/variant")).toBe("demo-site");
  });
});

describe("fillPrompt", () => {
  it("fills every slot", () => {
    expect(fillPrompt("Fruit: {{fruit}}, again {{fruit}}; count {{n}}", { fruit: "quince", n: 3 })).toBe("Fruit: quince, again quince; count 3");
  });

  it("fills in one pass, so a value that looks like a slot is left as written", () => {
    expect(fillPrompt("Note: {{note}}", { note: "{{fruit}} and $& and $1" })).toBe("Note: {{fruit}} and $& and $1");
  });

  it("throws on a slot without a value and on a value without a slot", () => {
    expect(() => fillPrompt("Fruit: {{fruit}}", {})).toThrow(/\{\{fruit\}\} has no value/);
    expect(() => fillPrompt("Fruit: {{fruit}}", { fruit: "fig", colour: "green" })).toThrow(/no slot for \{\{colour\}\}/);
  });

  it("leaves text without slots alone", () => {
    expect(fillPrompt("No slots { here } {{ spaced }}")).toBe("No slots { here } {{ spaced }}");
  });
});
