import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Lighthouses as LighthousesValue } from "../lib/lighthouse-model";
import type { BeaconActions, QuestActions } from "./actions-type";
import type { QuestsPage } from "../lib/quests-read";

// Lighthouses on the page (QS.6; version 10, section 5), drawn as the server
// draws it, with the game style on and off: one lighthouse per lit Beacon with
// its author's face and a card that opens the link outside; the moon and a
// ghost lighthouse with the reader's own face, bare, while none is lit; a held
// fire's offer above the button; and nothing that counts views, likes or reach.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { QuestsView } = await import("./QuestsView");
const { BeaconForm } = await import("./BeaconForm");

const ok = async () => ({ ok: true as const });
const actions = { summonBounty: ok, acceptQuest: ok, turnIn: ok, handBack: ok, reactToTurnIn: ok, closeQuest: ok, withdrawQuest: ok } as unknown as QuestActions;
const beaconActions: BeaconActions = { lightBeacon: ok };
const NOW = "2026-10-24T03:00:00.000Z";
const me = { personId: "me", name: "Kim Dao", initials: "KD" };
const mai = { personId: "mai", name: "Mai Tran", initials: "MT" };
const page: QuestsPage = { season: { name: "Q4 2026", hits: 0, campfires: 0, beacons: 2, discoveries: 0 }, boss: null, board: [], me };
const full: LighthousesValue = {
  lit: [
    { questId: "b1", title: "Talk at the meetup", url: "https://example.com/talk", author: mai, mine: false },
    { questId: "b2", title: "The digest that writes itself", url: "https://example.com/digest", author: me, mine: true },
    { questId: "b3", title: "A link we will not draw", url: null, author: mai, mine: false },
  ],
  heldFires: [
    { questId: "r1", title: "Prompt evals", originIdeaId: null },
    { questId: "r2", title: "Our proposal template", originIdeaId: "idea-1" },
  ],
  beacons: { lit: 1, canLight: true },
};
const dark: LighthousesValue = { lit: [], heldFires: [], beacons: { lit: 0, canLight: true } };
const render = (lighthouses: LighthousesValue, gameOn: boolean, borders: Record<string, string> = {}) =>
  renderToStaticMarkup(<QuestsView page={page} party={[]} now={NOW} actions={actions} gameOn={gameOn} lighthouses={lighthouses} beaconActions={beaconActions} borders={borders} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Lighthouses", () => {
  it("stands one lit lighthouse per Beacon, each with its author's face, and a card that opens the link outside", () => {
    const html = render(full, true, { mai: "gold" });
    const t = text(html);
    expect(t).toContain("Lighthouses");
    expect(t).toContain("Beacons: a learning taken outside Edge8. Every one lit stands on this horizon; tap one to read it.");
    expect(html.match(/data-beacon="/g)).toHaveLength(3);
    expect(html.match(/qn-beam"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="3 Beacons lit"');
    expect(html).toContain('aria-label="Talk at the meetup, by Mai Tran"');
    expect(html).toContain('aria-label="The digest that writes itself, by you"');
    // The author wears their border at the foot of their lighthouse.
    expect(html).toMatch(/frame-gold[\s\S]{0,400}Talk at the meetup/);
    // Open link goes outside, and never hands the page to it.
    expect(html).toContain('href="https://example.com/talk" target="_blank" rel="noopener noreferrer"');
    expect(html.match(/qn-lh-open/g)).toHaveLength(2);
    // The moon is up whatever is lit, and no ghost stands among lit lighthouses.
    expect(html).toContain("qn-moon");
    expect(html).not.toContain("qn-lh-ghost");
  });

  it("is never blank: the moon, and a ghost lighthouse with the reader's own face, bare, where their Beacon would stand", () => {
    const html = render(dark, true, { me: "gold" });
    expect(html).toContain("qn-moon");
    expect(html).toMatch(/qn-lh-ghost[\s\S]*qn-lh-art--dark[\s\S]*aria-label="Kim Dao"/);
    expect(html).not.toContain("frame-gold");
    expect(text(html)).toContain("The horizon is dark. Your Beacon would stand here.");
    expect(html).toContain('aria-label="0 Beacons lit"');
  });

  it("offers each held fire lit from Hands on one line above the button, and leaves a learning's fire to the Lore", () => {
    const t = text(render(full, true));
    // No points here: the figure is the ladders' slot's (QS.13), and this render has none.
    expect(t).toContain("Your fire Prompt evals was held Light it as a Beacon Publish the recording or a post.");
    expect(t).not.toContain("Our proposal template");
    // The offer line sits above the Light a Beacon button (the last "Light a Beacon" on the page is the button).
    expect(t.indexOf("Your fire Prompt evals")).toBeLessThan(t.lastIndexOf("Light a Beacon"));
    expect(t).toContain("A post, a talk, a video the world can see.");
  });

  it("puts the Light a Beacon button where the next move can find and focus it", () => {
    expect(render(dark, true)).toMatch(/<button type="button" id="qn-light-beacon" data-move="light-beacon"/);
  });

  it("counts no views, likes or reach, in either style", () => {
    for (const game of [true, false]) expect(text(render(full, game))).not.toMatch(/\bviews?\b|\blikes?\b|\breach\b|\bfollowers?\b/i);
    // The glossary's Avoid list for a Beacon, in both styles.
    for (const game of [true, false]) expect(text(render(full, game))).not.toMatch(/world event|public share|\bevent\b|\bbroadcast\b/i);
  });

  it("stands between the Lore and the tavern board", () => {
    const t = text(render(full, true));
    expect(t.indexOf("Lighthouses")).toBeGreaterThan(t.indexOf("The Lore"));
    expect(t.indexOf("Lighthouses")).toBeLessThan(t.indexOf("Tavern board"));
  });

  it("says the same in plain words with the game style off: no horizon, sea, moon or lighthouse", () => {
    const whole = render(full, false);
    const at = whole.indexOf('id="qn-lighthouses"');
    const html = whole.slice(whole.indexOf(">", at) + 1, whole.indexOf("</section>", at));
    const t = text(html);
    expect(t).toContain("Taken outside");
    expect(t).toContain("Your session Prompt evals happened Take it outside");
    expect(t).toContain("Talk at the meetup");
    expect(t).toContain("Open link");
    expect(html).not.toMatch(/qn-horizon|qn-moon|qn-sea|qn-lh-art/);
    expect(t).not.toMatch(/horizon|lighthouse|\bmoon\b|\bsea\b|Beacons? lit|\blit\b/i);
    expect(text(render(dark, false))).toContain("Nothing taken outside yet. Yours would show here.");
  });
});

describe("BeaconForm", () => {
  it("asks the two questions, fills in a held fire's title, and switches off the browser's own URL check", () => {
    const html = renderToStaticMarkup(<BeaconForm prefill={{ title: "Prompt evals", originQuestId: "r1" }} actions={beaconActions} points={250} onLit={() => {}} onCancel={() => {}} />);
    const t = text(html);
    expect(t).toContain("What did you put out?");
    expect(t).toContain("Link to the public thing");
    expect(t).toContain("Light it · +250");
    expect(html).toContain('value="Prompt evals"');
    expect(html).toMatch(/novalidate/i);
    expect(html).toMatch(/type="url" inputMode="url"/);
  });

  it("shows no points when the slot gives none", () => {
    expect(text(renderToStaticMarkup(<BeaconForm actions={beaconActions} points={null} onLit={() => {}} onCancel={() => {}} />))).not.toContain("+");
  });
});
