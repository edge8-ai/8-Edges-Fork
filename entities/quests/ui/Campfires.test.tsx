import { renderToStaticMarkup } from "react-dom/server";
import { campfireWords } from "./campfire-words";
import { describe, expect, it, vi } from "vitest";
import type { Campfires as CampfiresValue } from "../lib/campfires-model";
import type { CampfireActions, QuestActions } from "./actions-type";
import type { QuestsPage } from "../lib/quests-read";

// Campfires on the page (QS.5; version 10, section 3), drawn as the server
// draws it, with the game style on and off. Wanted above Burning; a cold fire
// at three hands; the lines under it; the Host's own line; and, in the plain
// style, the same moves with no fire words and no art.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { QuestsView } = await import("./QuestsView");

const ok = async () => ({ ok: true as const });
const actions = { summonBounty: ok, acceptQuest: ok, turnIn: ok, handBack: ok, reactToTurnIn: ok, closeQuest: ok, withdrawQuest: ok } as unknown as QuestActions;
const campfireActions: CampfireActions = { raiseHand: ok, lowerHand: ok, lightFire: ok, takeSeat: ok, leaveSeat: ok };
const NOW = "2026-10-23T03:00:00.000Z";
const me = { personId: "me", name: "Member Me", initials: "MM" };
const page: QuestsPage = { season: { name: "Q4 2026", hits: 0, campfires: 0, beacons: 0, discoveries: 0 }, boss: null, board: [], me };
const host = { personId: "h", name: "Hoa Le", initials: "HL" };
const full: CampfiresValue = {
  wanted: [
    { key: "prompt evals", topic: "prompt evals", hands: 3, mine: true },
    { key: "figma to code", topic: "Figma to code", hands: 2, mine: false },
    { key: "rls", topic: "Supabase RLS", hands: 1, mine: false },
  ],
  burning: [
    { questId: "q1", title: "Claude for proposals", host, youHost: false, startsAt: "2026-10-29T09:00:00.000Z", seats: 2, faces: [{ personId: "s", name: "Duc Vo", initials: "DV" }], seated: true, sessionHref: null, endedAt: null },
    { questId: "q2", title: "Lark bots", host: me, youHost: true, startsAt: "2026-10-24T09:00:00.000Z", seats: 0, faces: [], seated: false, sessionHref: "/team/training/sessions/t2", endedAt: null },
  ],
};
const render = (campfires: CampfiresValue, gameOn: boolean) =>
  renderToStaticMarkup(<QuestsView page={page} party={[]} now={NOW} actions={actions} gameOn={gameOn} campfires={campfires} campfireActions={campfireActions} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Campfires", () => {
  it("draws a cold fire at three hands, lines under it, and the one-line ask", () => {
    const t = text(render(full, true));
    expect(t).toContain("Campfires");
    expect(t).toContain("Topics people raised a hand for. Three hands make a fire.");
    expect(t).toMatch(/3 hands no Host yet/);
    expect(t).toContain("You want this too");
    expect(t).toContain("Light it");
    expect(t).toContain("2 hands · one more makes a fire");
    expect(t).toContain("1 hand · two more make a fire");
    expect(t).toContain("Raise a hand");
  });

  it("draws the burning fires with their Host, Saigon time and seats, and the Host's own line", () => {
    const html = render(full, true);
    const t = text(html);
    expect(t).toContain("Host Hoa Le");
    expect(t).toContain("Thu 29 Oct · 16:00 Saigon");
    expect(t).toContain("2 by the fire");
    expect(t).toContain("Leave your seat");
    expect(t).toContain("You're by the fire.");
    expect(t).toContain("Host you");
    // Outside the page's act-points context the line has no figure to give; the figure itself is the slot's (QS.13).
    expect(t).toContain("You host · It lands once someone who came is marked");
    expect(campfireWords(true).hostLine(100)).toBe("+100 once someone who came is marked");
    expect(campfireWords(false).hostLine(100)).toBe("+100 points once someone who came is marked");
    expect(t).toContain("Be the first by the fire");
    expect(html).toContain("qn-flame");
  });

  it("draws the Host's ended fire, still to mark, with Mark who came in both styles, and no seat or burning art (QS.5c)", () => {
    const ended = { questId: "q-ended", title: "prompt evals", host: me, youHost: true, startsAt: "2026-10-23T09:00:00.000Z", seats: 3, faces: [], seated: false, sessionHref: "/team/training/sessions/t-ended", endedAt: "2026-10-23T09:20:00.000Z" };
    const game = render({ wanted: [], burning: [ended] }, true);
    const g = text(game);
    expect(g).toContain("Burnt down · yours to mark");
    expect(g).toContain("Fri 23 Oct · 16:00 Saigon ended 16:20 3 sat by the fire");
    expect(g).toContain("You host · It lands once someone who came is marked");
    // One button on the card; the next-move strip names the same move above it.
    expect(game.match(/>Mark who came</g)).toHaveLength(1);
    expect(game).toContain('href="/team/training/sessions/t-ended"');
    expect(game).toContain("qn-fire--ended");
    expect(game).not.toContain("qn-flame");
    expect(g).not.toMatch(/Take a seat|Leave your seat|Open the session/);
    const plain = render({ wanted: [], burning: [ended] }, false);
    const p = text(plain);
    expect(p).toContain("Ended · yours to mark");
    expect(p).toContain("3 seats taken");
    expect(plain).toContain('href="/team/training/sessions/t-ended"');
    expect(plain).not.toContain("qn-fire-art");
    expect(p).not.toMatch(/\b(fire|fires|flame|smoke|campfire|burning|burnt|lit)\b/i);
  });

  it("offers the Host the session's page, in both styles, and everyone else a seat (QS.5b)", () => {
    for (const on of [true, false]) {
      const html = render(full, on);
      expect(html.match(/Open the session/g)).toHaveLength(1);
      expect(html).toContain('href="/team/training/sessions/t2"');
      // The other fire's reader takes a seat; no link to its session is drawn.
      expect(text(html)).toContain("Leave your seat");
    }
    // A Host whose session Training does not name them organiser of is offered nothing to open.
    const notOrganiser = render({ ...full, burning: full.burning.map((f) => ({ ...f, sessionHref: null, endedAt: null })) }, true);
    expect(notOrganiser).not.toContain("Open the session");
    expect(notOrganiser).not.toContain("/team/training/sessions/");
  });

  it("names nobody next to a wanted topic: the only names are the Hosts and the seats", () => {
    const t = text(render(full, true));
    const wanted = t.slice(t.indexOf("Wanted"), t.indexOf("Burning"));
    for (const name of ["Hoa Le", "Duc Vo", "Member Me"]) expect(wanted).not.toContain(name);
  });

  it("says the same moves plainly with the game style off: no fire words and no art", () => {
    const html = render(full, false);
    const t = text(html);
    expect(t).toContain("Topics people want to learn");
    expect(t).toContain("Host it");
    expect(t).toContain("Sessions with a time");
    expect(t).toContain("2 seats taken");
    expect(t).toContain("2 hands · one more and anyone can host it");
    expect(html).not.toContain("qn-fire-art");
    expect(t).not.toMatch(/\b(fire|fires|flame|smoke|campfire|burning|lit)\b/i);
  });

  it("shows each section's empty line", () => {
    const t = text(render({ wanted: [], burning: [] }, true));
    expect(t).toContain("Nobody has raised a hand yet. Name something you want to learn below.");
    expect(t).toContain("No fire is lit. Light a wanted one above, or raise a hand for what you want to learn.");
  });

  it("uses no word the glossary lists under Avoid for a Hand, a fire or a Seat", () => {
    for (const on of [true, false]) {
      // Campfires' own section: the Beacon line beside it ("A post, a talk, a
      // video", QS.6) is the spec's own copy for a Beacon, not a Raid word.
      const page = render(full, on);
      // The section must be found: an empty slice would pass the Avoid check without reading a word.
      const start = page.indexOf('aria-labelledby="qn-fires-h"');
      expect(start).toBeGreaterThanOrEqual(0);
      const t = text(page.slice(start, page.indexOf("</section>", start)));
      expect(t).not.toMatch(/\b(vote|upvote|request|like|cold campfire|poll|wishlist|proposal|event|booking|RSVP|registration|attendance|organiser|workshop|lesson|talk|presenter|speaker|upcoming sessions?)\b/i);
    }
  });
});
