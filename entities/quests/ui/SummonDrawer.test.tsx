import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { QuestActions } from "./actions-type";
import type { BountyDraft } from "../lib/bounty-draft";
import { GameStyleContext } from "./game-style";

// A Bounty Claude drafted lands in the Summon drawer (QS.9; the approved
// prototype's Draft board, 2026-10-27): every field filled in, a banner that
// says Claude drafted it, quotes the person's own words and says nobody is
// called until they press Summon, and Discard draft in place of Cancel.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
const { SummonDrawer } = await import("./SummonDrawer");
const { QuestsView } = await import("./QuestsView");

const ok = async () => ({ ok: true as const });
const actions = { summonBounty: ok, acceptQuest: ok, turnIn: ok, handBack: ok, reactToTurnIn: ok, closeQuest: ok, withdrawQuest: ok } as unknown as QuestActions;
const NOW = "2026-10-27T03:00:00.000Z";
const me = { personId: "me", name: "Kim Dao", initials: "KD" };
const an = { personId: "an", name: "An Pham", initials: "AP" };
const binh = { personId: "binh", name: "Binh Tran", initials: "BT" };
const DRAFT: BountyDraft = {
  title: "Watch the launch",
  note: "Watch the launch recording and turn in one thing you noticed.",
  learning: false,
  partyPersonIds: ["an", "stranger"],
  heads: [
    { ask: "Watch the launch", date: "2026-10-30", time: "17:00" },
    { ask: "Say one thing you noticed", date: "", time: "" },
  ],
  from: "give everyone a quest to watch the launch by Friday",
};

function draw(draft: BountyDraft | null, gameOn = true): string {
  return renderToStaticMarkup(
    <GameStyleContext.Provider value={gameOn}>
      <SummonDrawer open onClose={() => {}} party={[me, an, binh]} me={me} now={NOW} actions={actions} summonerIsManager={false} draft={draft} />
    </GameStyleContext.Provider>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("the Summon drawer with Claude's draft", () => {
  it("says Claude drafted it, quotes the person's words, and says nobody is called until they press Summon", () => {
    const said = text(draw(DRAFT));
    expect(said).toContain("Drafted by Claude");
    expect(said).toContain("From your ask: “give everyone a quest to watch the launch by Friday”.");
    expect(said).toContain("Nobody is called until you press Summon. Change anything first.");
  });

  it("fills in every field from the draft, the drawer's default for a blank due time, and only staff it may call", () => {
    const html = draw(DRAFT);
    expect(html).toContain('value="Watch the launch"');
    expect(html).toContain(">Watch the launch recording and turn in one thing you noticed.</textarea>");
    expect(html).toMatch(/type="checkbox"(?![^>]*checked)/);
    expect(html).toContain('value="2026-10-30"');
    expect(html).toContain('value="17:00"');
    expect(html).toContain('value="Say one thing you noticed"');
    // The blank head takes the drawer's own default: a week from today at 18:00.
    expect(html).toContain('value="2026-11-03"');
    expect(html).toContain('value="18:00"');
    const chip = (name: string) => html.split("<button").find((b) => b.includes("qs-pp") && b.includes(name)) ?? "";
    expect(chip("An Pham")).toContain('aria-pressed="true"');
    expect(chip("Binh Tran")).toContain('aria-pressed="false"');
    expect(text(html)).toContain("1 called");
  });

  it("offers Discard draft and Summon, and no Cancel", () => {
    const said = text(draw(DRAFT));
    expect(said).toContain("Discard draft");
    expect(said).toMatch(/\bSummon\b/);
    expect(said).not.toContain("Cancel");
  });

  it("says it in the plain view's words when the game style is off", () => {
    expect(text(draw(DRAFT, false))).toContain("Nobody is asked until you press Post. Change anything first.");
  });

  it("draws the drawer as ever with no draft: no banner, blank fields, Cancel", () => {
    const html = draw(null);
    expect(html).not.toContain("qs-draft-note");
    expect(text(html)).toContain("Cancel");
    expect(text(html)).not.toContain("Discard draft");
  });

  it("opens the drawer with the draft when the page is drawn with one", () => {
    const page = { season: { name: "Q4 2026", hits: 0, campfires: 0, beacons: 0, discoveries: 0 }, boss: null, board: [], me };
    const html = renderToStaticMarkup(<QuestsView page={page} party={[me, an, binh]} now={NOW} actions={actions} draft={DRAFT} />);
    expect(html).toContain("qs-draft-note");
    expect(renderToStaticMarkup(<QuestsView page={page} party={[me, an, binh]} now={NOW} actions={actions} />)).not.toContain("qs-draft-note");
  });
});
