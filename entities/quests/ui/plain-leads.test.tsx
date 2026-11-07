import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { QuestsPage } from "../lib/quests-read";
import type { Campfires } from "../lib/campfires-model";
import { NO_LIGHTHOUSES } from "../lib/lighthouse-model";
import type { BeaconActions, CampfireActions, QuestActions } from "./actions-type";
import { calendarLeaf, handsMeter } from "./plain-leads";
import { fireDayAndHour } from "../lib/campfires-model";
import { PLAIN_BOARD } from "./plain-model";

// The plain view of the version 10 sections (QS.14 Part C), as Khoa approved
// the plain artboard on 2026-10-25: a calendar leaf on a session with a time
// and the hour alone beside it, a three-dot hands meter on a topic, the
// reader's own bare face where nothing has been taken outside yet, and the
// board as Optional bounties. The game view keeps its fires and its horizon.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { QuestsView } = await import("./QuestsView");

const ok = async () => ({ ok: true as const });
const actions = { summonBounty: ok, acceptQuest: ok, turnIn: ok, handBack: ok, reactToTurnIn: ok, closeQuest: ok, withdrawQuest: ok } as unknown as QuestActions;
const campfireActions: CampfireActions = { raiseHand: ok, lowerHand: ok, lightFire: ok, takeSeat: ok, leaveSeat: ok };
const beaconActions: BeaconActions = { lightBeacon: ok };
const NOW = "2026-10-25T03:00:00.000Z";
const me = { personId: "me", name: "Kim Dao", initials: "KD" };
const hoa = { personId: "hoa", name: "Hoa Le", initials: "HL" };
const page: QuestsPage = { season: { name: "Q4 2026", hits: 0, campfires: 0, beacons: 0, discoveries: 0 }, boss: null, board: [], me };
const fires: Campfires = {
  wanted: [
    { key: "prompt evals", topic: "prompt evals", hands: 4, mine: false },
    { key: "figma to code", topic: "Figma to code", hands: 2, mine: true },
  ],
  burning: [{ questId: "r1", title: "Claude for client decks", host: hoa, youHost: false, startsAt: "2026-10-29T09:00:00.000Z", seats: 2, faces: [], seated: true, sessionHref: null, endedAt: null }],
};
const draw = (gameOn: boolean) =>
  renderToStaticMarkup(<QuestsView page={page} party={[]} now={NOW} actions={actions} gameOn={gameOn} campfires={fires} campfireActions={campfireActions} lighthouses={NO_LIGHTHOUSES} beaconActions={beaconActions} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("the plain leads", () => {
  it("reads a session's day for its leaf, and the hour for its meta line, in Saigon", () => {
    expect(calendarLeaf("2026-10-29T09:00:00.000Z")).toEqual({ weekday: "Thu", day: "29", month: "Oct" });
    // 23:30 UTC on Saturday the 31st is already Sunday 1 November in Saigon.
    expect(calendarLeaf("2026-10-31T23:30:00.000Z")).toEqual({ weekday: "Sun", day: "1", month: "Nov" });
    expect(fireDayAndHour("2026-10-29T09:00:00.000Z")).toEqual({ day: "Thu 29 Oct", hour: "16:00 Saigon" });
  });

  it("fills one dot a hand up to three, and says the hands past three", () => {
    expect([0, 1, 2, 3, 4, 7].map(handsMeter)).toEqual([
      { filled: 0, past: null },
      { filled: 1, past: null },
      { filled: 2, past: null },
      { filled: 3, past: null },
      { filled: 3, past: "+1" },
      { filled: 3, past: "+4" },
    ]);
  });
});

describe("the plain view of the version 10 sections", () => {
  it("draws a calendar leaf on a session with a time and keeps the hour alone beside it", () => {
    const html = draw(false);
    expect(html).toMatch(/<div class="qn-cal" aria-hidden="true"><span class="qn-cal-d">Thu<\/span><b>29<\/b><span class="qn-cal-m">Oct<\/span><\/div>/);
    // The visible line keeps the hour; the day is said to a screen reader, which cannot read the leaf.
    expect(html).toContain('<span class="qn-sr">Thu 29 Oct · </span>16:00 Saigon');
  });

  it("draws the hands meter on a topic at three, with +1 for the fourth hand, and two of three dots on a line", () => {
    const html = draw(false);
    const cold = html.match(/<div class="qn-hands"[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(cold.match(/<i class="on"><\/i>/g)).toHaveLength(3);
    expect(cold).toContain("<small>+1</small>");
    const line = html.match(/<li class="qn-line">[\s\S]*?<\/li>/)?.[0] ?? "";
    expect(line.match(/<i class="on"><\/i>/g)).toHaveLength(2);
    expect(line.match(/<i><\/i>/g)).toHaveLength(1);
  });

  it("shows the reader's own face, bare, where nothing has been taken outside yet", () => {
    const html = draw(false);
    const empty = html.match(/<div class="qn-none qn-out-empty">[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(empty).toContain('<span class="qn-ghost" aria-hidden="true">');
    expect(empty).toContain("KD");
    expect(text(empty)).toContain("Nothing taken outside yet. Yours would show here.");
  });

  it("titles the plain board Optional bounties, with its line and its empty line", () => {
    const t = text(draw(false));
    expect(t).toContain(`${PLAIN_BOARD.title} ${PLAIN_BOARD.why}`);
    expect(t).toContain(PLAIN_BOARD.empty);
    expect(t).not.toContain("All quests");
  });

  it("leaves the game view its fires and its horizon, with no plain lead", () => {
    const html = draw(true);
    expect(html).not.toMatch(/qn-cal|qn-hands|qn-dots|qn-out-empty/);
    expect(html).toContain("qn-fire-art");
    expect(text(html)).toContain("Thu 29 Oct · 16:00 Saigon");
  });
});
