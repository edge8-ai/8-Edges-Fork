// The team chat's Quests section speaks asks (AK.7): it answers in ask words,
// links the Asks page, and leaves the assistant no way to send an ask itself.
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./system-prompt";

const prompt = buildSystemPrompt({ userName: null });
const section = prompt.slice(prompt.indexOf("## Asks"), prompt.indexOf("## Finding people and giving links"));

describe("the Asks section of the team chat prompt", () => {
  it("exists and links the Asks page", () => {
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain("[Asks](/team/asks)");
  });

  it("says nothing is sent until the person presses Send ask", () => {
    expect(section).toMatch(/Send ask/);
    expect(section).toMatch(/Never say an ask was sent/);
  });

  it("uses no quest, game or old-page words anywhere in the prompt", () => {
    expect(prompt).not.toMatch(/\/team\/quests/);
    expect(prompt).not.toMatch(/Raid|Beacon|Evolve|Summon|Bounty|bounties|\bseats?\b|raise a hand|Turn-in/);
  });
});
