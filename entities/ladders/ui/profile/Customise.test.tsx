import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isForkTree } from "@/scripts/fork-tree.mjs";
import { shapeStanding } from "../../lib/standing";
import { display } from "../../lib/testing";
import { CaseShelf, StatsStrip } from "./HeroParts";
import { PlayerCard, Ranks } from "./PlayerCard";
import { dressOwn, dressTeammate, titleOf } from "./profile-model";
import { addable, titleChoice, titleFor, titleOptions, titleValue, withAdded, withRemoved } from "./case-choices";

// Customise (LD.6, redrawn LD.10): the player card, the rank cards, the stats
// strip and the showcase as the owner's editor draws them. Every switch starts
// off; the Title select and the Add… slots wait for the badges (LD.7) and say
// so.

const ME = "person-me";
const person = { name: "Mai Tran", initials: "MT", handle: null, photoUrl: null };
const standing = shapeStanding({ personId: ME }, {
  positions: [
    { person_id: ME, ladder: "learn_share", points: 450, tier: "gold", division: 2, stars: null, immortal_band: null, counts: { hits: 37, sparks: 12, fires: 3, beacons: 1 }, computed_at: "2026-10-21T19:00:00Z" },
    { person_id: ME, ladder: "builder", points: 9_200.5, tier: "legend", division: null, stars: 3, immortal_band: null, counts: { cards: 148, humanTokens: 212.5 }, computed_at: "2026-10-21T19:00:00Z" },
  ],
  unlocks: [],
  display: [display({ person_id: ME })],
});
const dress = dressOwn(person, standing);
const may = { "ladders.mine": true };
const noop = { learnShare: () => {}, builder: () => {} };

describe("the rank cards in Customise", () => {
  it("carry the two wear switches, both off, and say teammates see neither", () => {
    const html = renderToStaticMarkup(<Ranks dress={dress} worn={{ learnShare: false, builder: false }} editing may={may} onWorn={noop} />);
    expect(html.match(/role="switch"/g)).toHaveLength(2);
    expect(html).toContain('aria-checked="false" aria-label="Show the Learn &amp; Share emblem"');
    expect(html).toContain('aria-checked="false" aria-label="Show the Builder emblem"');
    expect(html.match(/Hidden from teammates/g)).toHaveLength(2);
  });

  it("show the owner everything about their own place: division, stars, points and the next tier", () => {
    const html = renderToStaticMarkup(<Ranks dress={dress} worn={{ learnShare: false, builder: true }} editing={false} may={may} onWorn={noop} />);
    expect(html).toContain(">Gold II</h3>");
    expect(html).toContain('aria-label="Legend ★★★">Legend</h3><span class="pf-rank-stars" aria-hidden="true">★★★</span>');
    expect(html).toContain("<b>450</b> points");
    expect(html).toContain("<b>9,200</b> points");
    expect(html).toContain("Teammates see this");
    expect(html).not.toContain('role="switch"');
  });

  it("show a teammate a card only for a ladder its owner wears, the tier alone", () => {
    const theirs = dressTeammate(person, { learnShare: "gold", builder: null, banner: "meadow", titleBadge: null, stats: {}, displayCase: [] }, true);
    const html = renderToStaticMarkup(<Ranks dress={theirs} worn={{ learnShare: true, builder: false }} editing={false} may={{}} onWorn={noop} />);
    expect(html).toContain(">Gold</h3>");
    expect(html).not.toContain("Builder");
    expect(html).not.toContain("points");
    expect(html).not.toContain("teammates");
    const none = dressTeammate(person, { learnShare: null, builder: null, banner: "meadow", titleBadge: null, stats: {}, displayCase: [] }, true);
    expect(renderToStaticMarkup(<Ranks dress={none} worn={{ learnShare: false, builder: false }} editing={false} may={{}} onWorn={noop} />)).toBe("");
  });
});

describe("the player card in Customise", () => {
  it("offers no Title yet, and says Titles come with badges", () => {
    const html = renderToStaticMarkup(<PlayerCard dress={dress} title={null} worn={{ learnShare: false, builder: false }} editing />);
    expect(html).toMatch(/<select class="pf-title-sel" aria-label="Title"[^>]*disabled/);
    expect(html).toContain("Titles come with badges");
  });

  it("lists the facts the team entity hands in, and wears the Builder medal only when it is shown", () => {
    const withFacts = dressOwn({ ...person, facts: [{ label: "Role", value: "AI Engineer" }] }, standing);
    const hidden = renderToStaticMarkup(<PlayerCard dress={withFacts} title={null} worn={{ learnShare: false, builder: false }} editing={false} />);
    expect(hidden).toContain("<dt>Role</dt><dd>AI Engineer</dd>");
    expect(hidden).not.toContain("pf-card-medal");
    const worn = renderToStaticMarkup(<PlayerCard dress={withFacts} title={null} worn={{ learnShare: false, builder: true }} editing={false} />);
    expect(worn).toContain('aria-label="Builder: Legend"');
  });

  // The fork ships a plain emblem set in place of the private art (ADR 0021),
  // so the art's file names are not there to find.
  it.skipIf(isForkTree(process.cwd()))("draws the worn medal with no star: a star is for its owner's rank card alone", () => {
    const html = renderToStaticMarkup(<PlayerCard dress={dress} title={null} worn={{ learnShare: true, builder: true }} editing={false} />);
    expect(html).toMatch(/medal-legend/);
    expect(html).not.toContain("ladder-emblem-stars");
    expect(html).not.toContain('role="switch"');
  });
});

describe("the Title select with badges found", () => {
  const found = [
    { id: "fire-keeper-i", name: "Fire keeper I", family: "Fire keeper" },
    { id: "fire-keeper-ii", name: "Fire keeper II", family: "Fire keeper" },
    { id: "first-hit", name: "First hit", family: "First hit" },
  ];

  it("offers one Title per found family, worn without its numeral, and No title", () => {
    expect(titleOptions(found)).toEqual([{ value: "fire-keeper-i", label: "Fire keeper" }, { value: "first-hit", label: "First hit" }]);
    const html = renderToStaticMarkup(
      <PlayerCard dress={dress} title={null} worn={{ learnShare: false, builder: false }} editing titleEdit={{ options: titleOptions(found), value: "", onChange: () => {} }} />,
    );
    expect(html).toContain('<option value="" selected="">No title</option>');
    expect(html).toContain('<option value="fire-keeper-i">Fire keeper</option>');
    expect(html).not.toContain("Fire keeper II");
    expect(html).not.toContain("Hydra");
    expect(html).not.toMatch(/<select class="pf-title-sel"[^>]*disabled/);
    expect(html).not.toContain("Titles come with badges");
  });

  it("selects the family of the badge worn, and No title clears it", () => {
    expect(titleValue(found, "fire-keeper-ii")).toBe("fire-keeper-i");
    expect(titleFor(found, "fire-keeper-ii")).toBe("Fire keeper");
    expect(titleValue(found, null)).toBe("");
    expect(titleChoice("")).toBeNull();
    expect(titleChoice("first-hit")).toBe("first-hit");
    // A badge that is not among those found gives no Title.
    expect(titleFor(found, "hydra-slayer")).toBeNull();
  });

  it("carries the reader's found badges in their own dress, and none in a teammate's", () => {
    const withBadge = shapeStanding({ personId: ME }, {
      positions: [],
      unlocks: [{ id: "u9", person_id: ME, kind: "badge", ladder: "learn_share", key: "fire-keeper-i", unlocked_at: "2026-10-22T00:00:00Z", source: "replay", shown_at: null }],
      display: [display({ person_id: ME })],
    });
    expect(dressOwn(person, withBadge).found).toEqual([{ id: "fire-keeper-i", name: "Fire keeper I", family: "Fire keeper" }]);
    expect(dressTeammate(person, { learnShare: null, builder: null, banner: "meadow", titleBadge: null, stats: {}, displayCase: [] }, true).found).toEqual([]);
  });
});

describe("the stats strip", () => {
  it("in Customise shows all six with a switch each, every one off", () => {
    const html = renderToStaticMarkup(<StatsStrip stats={dress.stats} shown={[]} editing onFlip={() => {}} />);
    expect(html.match(/role="switch"/g)).toHaveLength(6);
    expect(html).not.toContain('aria-checked="true"');
    for (const words of ["hits landed", "sparks", "fires hosted", "beacons lit", "cards shipped", "Human Tokens shipped"]) expect(html).toContain(`aria-label="Show ${words}"`);
    expect(html).toContain("<b>212.5</b>");
  });

  it("outside Customise shows only the stats switched on, and nothing with none", () => {
    expect(renderToStaticMarkup(<StatsStrip stats={dress.stats} shown={[]} editing={false} />)).toBe("");
    const two = renderToStaticMarkup(<StatsStrip stats={dress.stats} shown={["hits", "cards"]} editing={false} />);
    expect(two.match(/class="pf-stat"/g)).toHaveLength(2);
    expect(two).not.toContain("role=\"switch\"");
  });
});

describe("the showcase", () => {
  it("in Customise with nothing found shows five empty slots, each Add… disabled, and says why", () => {
    const html = renderToStaticMarkup(<CaseShelf badges={[]} editing own edit={{ addable: [], onAdd: () => {}, onRemove: () => {} }} />);
    expect(html.match(/Add…/g)).toHaveLength(5);
    expect(html.match(/<select [^>]*disabled/g)).toHaveLength(5);
    expect(html).toContain("You have not found one yet.");
  });

  it("offers each found badge not already in the case, and never an unfound one", () => {
    const found = [{ id: "first-hit", name: "First hit", family: "First hit" }, { id: "spark-struck", name: "Spark struck", family: "Spark struck" }];
    const offered = addable(found, ["first-hit"]);
    expect(offered.map((b) => b.id)).toEqual(["spark-struck"]);
    const html = renderToStaticMarkup(<CaseShelf badges={[{ id: "first-hit", name: "First hit" }]} editing own edit={{ addable: offered, onAdd: () => {}, onRemove: () => {} }} />);
    // Four empty slots, each offering Spark struck and nothing else; no select is disabled.
    expect(html.match(/<option value="spark-struck">Spark struck<\/option>/g)).toHaveLength(4);
    expect(html).not.toContain('value="first-hit"');
    expect(html).not.toContain("hydra-slayer");
    expect(html).not.toMatch(/<select [^>]*disabled/);
    // The filled slot is its name alone, with the switch that takes it out.
    expect(html).toContain('aria-checked="true" aria-label="Show First hit in the display case"');
    expect(html).not.toContain("<img");
  });

  it("takes a badge out when its switch goes off, and adds at the end up to five", () => {
    expect(withRemoved(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(withRemoved(["a"], "a")).toEqual([]);
    expect(withAdded(["a"], "b")).toEqual(["a", "b"]);
    expect(withAdded(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(withAdded(["a", "b", "c", "d", "e"], "f")).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("outside Customise says how to fill it, or, to a teammate, that it is empty", () => {
    expect(renderToStaticMarkup(<CaseShelf badges={[]} editing={false} own />)).toContain("Pick up to five badges in Customise.");
    expect(renderToStaticMarkup(<CaseShelf badges={[]} editing={false} own={false} />)).toContain("Nothing in the showcase yet.");
  });
});

describe("the dress", () => {
  it("starts with everything hidden for a person who chose nothing", () => {
    expect(dress.title).toBeNull();
    expect(dress.emblems.learnShare).toEqual({ tier: "gold", worn: false });
    expect(dress.stats.every((s) => !s.shown)).toBe(true);
    expect(dress.displayCase).toEqual([]);
  });

  it("gives a teammate only what the owner switched on", () => {
    const theirs = dressTeammate(person, { learnShare: "gold", builder: null, banner: "hydra", titleBadge: null, stats: { cards: 148 }, displayCase: [] }, true);
    expect(theirs.emblems).toEqual({ learnShare: { tier: "gold", worn: true }, builder: null });
    expect(theirs.stats).toEqual([{ key: "cards", value: 148, shown: true }]);
  });

  it("wears a badge's name as a Title without its tier numeral", () => {
    expect(titleOf("fire-keeper-i")).toBe("Fire keeper");
    expect(titleOf(null)).toBeNull();
    expect(titleOf("no-such-badge")).toBeNull();
  });
});
