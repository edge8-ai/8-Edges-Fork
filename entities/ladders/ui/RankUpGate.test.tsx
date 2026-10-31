import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadFailure } from "@/kernel/data/read";
import type { Tier } from "../lib/points";
import type { PositionRow, UnlockRow } from "../lib/rows";
import { display, memoryStore, type MemoryStore } from "../lib/testing";

// The rank-up gate as the team shell mounts it (LD.5; spec "The rank-up"),
// serialised as the server draws it. It opens for the signed-in reader's own
// waiting tier and for nobody else: a teammate's render of any team page, with
// the reader's unlock waiting in the same table, has no gate and no word of it.
// It still opens under reduced motion and with the game style off, stilled,
// and with the game style off in plain words with no art.

const ME = "person-me";
const MATE = "person-mate";
const T0 = "2026-10-23T09:00:00.000Z";

let store: MemoryStore = memoryStore();
type FakeAccess = { personId: string; impersonation: unknown; may: (p: string, t?: { person?: string }) => boolean };
let access: FakeAccess | null = null;
vi.mock("@/kernel/identity/access-request", () => ({ getAccess: async () => access }));
vi.mock("../lib/store", () => ({
  get liveStore() {
    return store;
  },
}));
// The answers are server actions; the gate only hands them to the screen.
vi.mock("../lib/display-actions", () => ({ setWear: async () => ({ ok: true }) }));
vi.mock("../lib/shown-actions", () => ({ markShown: async () => ({ ok: true }) }));

const { RankUpGate } = await import("./RankUpGate");

const ls = (person_id: string, points: number, tier: Tier, division: 1 | 2 | 3 | 4): PositionRow => ({
  person_id, ladder: "learn_share", points, tier, division, stars: null, immortal_band: null, counts: { hits: 4, sparks: 0, fires: 0, beacons: 0 }, computed_at: T0,
});
const b = (person_id: string, points: number, tier: Tier, stars: 1 | 2 | 3 | 4 | 5): PositionRow => ({
  person_id, ladder: "builder", points, tier, division: null, stars, immortal_band: null, counts: { cards: 0, humanTokens: 0 }, computed_at: T0,
});
const unlock = (person_id: string, ladder: "learn_share" | "builder", key: string, shown_at: string | null): UnlockRow => ({
  id: `${person_id}-${key}`, person_id, kind: "tier", ladder, key, unlocked_at: T0, source: shown_at ? "launch" : "event", shown_at,
});
const may = (who: string) => (p: string, t?: { person?: string }) => p === "ladders.mine" && (!t?.person || t.person === who);
const as = (who: string, over: Partial<FakeAccess> = {}): FakeAccess => ({ personId: who, impersonation: null, may: may(who), ...over });
const render = async () => {
  const node = await RankUpGate();
  return node === null ? "" : renderToStaticMarkup(node);
};

beforeEach(() => {
  // The reader turned in on a Bounty at 30 Learn & Share points: 40, Bronze, waiting.
  store = memoryStore({
    positions: [ls(ME, 40, "bronze", 4), b(ME, 0, "herald", 1), ls(MATE, 120, "silver", 4), b(MATE, 0, "herald", 1)],
    unlocks: [
      unlock(ME, "learn_share", "iron", T0),
      unlock(ME, "builder", "herald", T0),
      unlock(ME, "learn_share", "bronze", null),
      unlock(MATE, "learn_share", "iron", T0),
      unlock(MATE, "learn_share", "bronze", T0),
      unlock(MATE, "learn_share", "silver", T0),
      unlock(MATE, "builder", "herald", T0),
    ],
    display: [display({ person_id: ME }), display({ person_id: MATE })],
  });
  access = as(ME);
});

describe("RankUpGate", () => {
  it("opens the Bronze rank-up full screen for the reader, with the helm, the words and the two answers", async () => {
    const html = await render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("rankup rankup--helm rankup--t-bronze");
    expect(html).toContain('aria-label="Bronze"'); // the helm
    expect(html).toContain("rankup-glow");
    expect(html).toContain('id="rankup-tier">Bronze</h2>');
    expect(html).toContain("Learn &amp; Share · Bronze IV");
    expect(html).toContain("Every hit, every spark, every fire you lit added up. Bronze suits you.");
    expect(html).toContain("Only you see this. Showing it is your call.");
    expect(html).toMatch(/>Show it<\/button>.*>Later<\/button>/);
    expect(html).not.toContain("rankup--still");
  });

  it("shows a teammate's page nothing: no gate and no word of the reader's unlock", async () => {
    access = as(MATE);
    const html = await render();
    expect(html).toBe("");
    expect(html).not.toMatch(/Bronze|rankup|Only you see this/);
  });

  it("shows the mover nothing when their act lifted someone else", async () => {
    // A teammate moved the reader's card to Done: the unlock is the reader's, the render is the mover's.
    store.unlocks.push({ ...unlock(ME, "builder", "guardian", null), witness_table: null, witness_id: null });
    access = as(MATE);
    expect(await render()).toBe("");
    access = as(ME);
    expect(await render()).toContain("rankup");
  });

  it("opens nothing without ladders.mine, signed out, or while an admin views the page as the reader", async () => {
    access = as(ME, { may: () => false });
    expect(await render()).toBe("");
    access = null;
    expect(await render()).toBe("");
    access = as(ME, { impersonation: { adminEmail: "admin@example.test" } });
    expect(await render()).toBe("");
  });

  it("opens nothing once the unlock has been shown", async () => {
    store.unlocks.find((u) => u.id === `${ME}-bronze`)!.shown_at = T0;
    expect(await render()).toBe("");
  });

  it("opens stilled and in plain words, with no art, when the reader's game style is off", async () => {
    store.display = [display({ person_id: ME, game_style: false })];
    const html = await render();
    expect(html).toContain("rankup--still rankup--plain");
    expect(html).not.toMatch(/<img|rankup-glow|rankup-confetti|rankup-tw/);
    expect(html).toContain('id="rankup-tier">Bronze</h2>');
    expect(html).toContain("Learn &amp; Share · Bronze, division IV");
    expect(html).toContain("Every answer, every spark, every session you held added up. Bronze suits you.");
    expect(html).toMatch(/>Show it<\/button>.*>Later<\/button>/);
  });

  it("draws no rank-up rather than failing the page when the standing cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    store.unlocksOf = async () => {
      throw new ReadFailure("ladder_unlocks", "timeout");
    };
    expect(await render()).toBe("");
    expect(error).toHaveBeenCalledWith("[ladders] rank-up:", "read failed: ladder_unlocks: timeout");
    error.mockRestore();
  });

  it("surfaces anything that is not a failed read, as the Your ladders panel does", async () => {
    store.unlocksOf = async () => {
      throw new Error("a bug in the picker");
    };
    await expect(render()).rejects.toThrow("a bug in the picker");
  });
});

describe("the rank-up under prefers-reduced-motion", () => {
  const css = readFileSync(new URL("./rank-up.css", import.meta.url), "utf8");

  it("still opens: the markup does not depend on motion, so the screen is drawn the same", async () => {
    expect(await render()).toContain('role="dialog"');
  });

  it("is stilled by the stylesheet: every animation off and the confetti gone", () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(block).toMatch(/\.rankup, \.rankup \* \{ animation: none !important; \}/);
    expect(block).toMatch(/\.rankup-confetti \{ display: none; \}/);
    // Nothing hides the screen itself under reduced motion.
    expect(block).not.toMatch(/\.rankup \{[^}]*display: none/);
  });
});
