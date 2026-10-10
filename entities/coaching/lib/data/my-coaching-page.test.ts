import { beforeEach, describe, expect, it, vi } from "vitest";

// What /team/my-coaching computes about a member, pinned before A.11 moved it.
//
// This mocks the data modules the page model composes rather than the Supabase
// client, deliberately. The entity's chainable fake keeps an ordered queue per
// table, and this composition reads a dozen-plus tables with several read more
// than once; a test coupled to consumption order would fail the moment those
// reads are allowed to run concurrently, which is the next ticket's whole job.
// The reads themselves move verbatim and cannot change. What had no cover at
// all — and what this locks — is the assembly: which fact is derived from which
// input, and where the cut-offs fall.
//
// Every assertion is on a VALUE, never on the shape of the object carrying it,
// so regrouping the return can change the paths below without touching a single
// expected result.

const TODAY = "2026-09-18";

vi.mock("@/kernel/config/dates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/config/dates")>()),
  saigonToday: () => TODAY,
}));

const getMyCoaching = vi.fn();
const getMyHistory = vi.fn();
const getMyGoals = vi.fn();
const getMyNotes = vi.fn();
const getGoalLadder = vi.fn();
const getSharedKeyResultGoals = vi.fn();
const getCardsCompletedSince = vi.fn();
const getTimelineExtras = vi.fn();
const getGoalMoveSince = vi.fn();

vi.mock("./member", () => ({ getMyCoaching: (...a: unknown[]) => getMyCoaching(...a) }));
vi.mock("./member-history", () => ({ getMyHistory: (...a: unknown[]) => getMyHistory(...a) }));
vi.mock("./my-goals", () => ({ getMyGoals: (...a: unknown[]) => getMyGoals(...a) }));
vi.mock("./goals", () => ({ getEdgesLadderOptions: async () => ({ objectives: [], keyResults: [] }) }));
vi.mock("./member-notes", () => ({ getMyNotes: (...a: unknown[]) => getMyNotes(...a) }));
vi.mock("./goal-bumps", () => ({
  getGoalBumpFacts: async () => new Map(),
  getGoalMoveSince: (...a: unknown[]) => getGoalMoveSince(...a),
}));
vi.mock("./goal-alignment", () => ({ getGoalAlignmentMeasures: async () => new Map() }));
vi.mock("./member-ladder", () => ({ getGoalLadder: (...a: unknown[]) => getGoalLadder(...a) }));
vi.mock("./shared-key-result", () => ({
  getSharedKeyResultGoals: (...a: unknown[]) => getSharedKeyResultGoals(...a),
}));
vi.mock("./moved-cards", () => ({ getCardsCompletedSince: (...a: unknown[]) => getCardsCompletedSince(...a) }));
vi.mock("./my-timeline", () => ({ getTimelineExtras: (...a: unknown[]) => getTimelineExtras(...a) }));
// Rendered markdown is echoed back with a marker so the test can prove each
// meeting kept ITS OWN html: the route used to index a parallel array by
// position, which is exactly the wiring a move like this can silently shift.
vi.mock("../markdown", () => ({ coachingMarkdownToHtml: async (md: string) => `html:${md}` }));

import { getMyCoachingPage } from "./my-coaching-page";
import type { TeamActor } from "@/kernel/identity/team-auth";

const actor = { teamMemberId: "tm-1", personId: "p-1" } as TeamActor;

const goal = (over: Record<string, unknown> = {}) =>
  ({
    id: "g-1",
    status: "active",
    metricUnit: "days",
    ladder: { kind: "key_result", id: "kr-1" },
    ...over,
  }) as never;

const commitment = (over: Record<string, unknown> = {}) =>
  ({
    id: "c-x",
    owner: "member",
    status: "open",
    statusUpdatedAt: null,
    oneOnOneId: null,
    ...over,
  }) as never;

const meeting = (over: Record<string, unknown> = {}) =>
  ({
    id: "m-1",
    heldOn: "2026-09-10",
    sharedSummaryMarkdown: null,
    movedFrom: null,
    moveReason: null,
    heldLate: false,
    heldSource: "coach",
    movedMd: null,
    stuckMd: null,
    talkMd: null,
    made: 0,
    kept: 0,
    ...over,
  }) as never;

const coaching = (over: Record<string, unknown> = {}) =>
  ({
    profileId: "cp-1",
    coachName: "Dave",
    goals: [goal()],
    priorities: [],
    ocean: null,
    cadenceDays: 14,
    nextOneOnOneOn: "2026-09-20",
    nextStartsAt: "09:00",
    preferredWeekday: null,
    preferredTime: null,
    proposedOn: null,
    missedOn: null,
    nextPrepMarkdown: null,
    nextPrepEdits: { struck: [], added: [] },
    commitments: [],
    talkingPoints: [],
    recaps: [],
    checkins: [],
    preMeeting: { answers: { moved: null, stuck: null, talk: null } },
    howIWork: null,
    coachLeave: [],
    myLeave: [],
    ...over,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  getMyCoaching.mockResolvedValue(coaching());
  getMyHistory.mockResolvedValue([]);
  getMyGoals.mockResolvedValue([]);
  getMyNotes.mockResolvedValue([]);
  getGoalLadder.mockResolvedValue([]);
  getSharedKeyResultGoals.mockResolvedValue([]);
  getCardsCompletedSince.mockResolvedValue([]);
  getTimelineExtras.mockResolvedValue([]);
  getGoalMoveSince.mockResolvedValue(null);
});

describe("no coaching profile", () => {
  it("returns null and leaves the redirect to the route", async () => {
    getMyCoaching.mockResolvedValue(null);
    expect(await getMyCoachingPage(actor)).toBeNull();
    // Nothing else is loaded for a member who has no profile.
    expect(getMyHistory).not.toHaveBeenCalled();
  });
});

describe("a member with an active goal and held 1-1s", () => {
  beforeEach(() => {
    getMyCoaching.mockResolvedValue(
      coaching({
        commitments: [
          // Kept AFTER the last 1-1, so it counts toward "kept since".
          commitment({ id: "c-1", status: "completed", statusUpdatedAt: "2026-09-12", oneOnOneId: "m-1" }),
          // Kept BEFORE it: counts toward the lifetime total, not the window.
          commitment({ id: "c-2", status: "completed", statusUpdatedAt: "2026-09-05", oneOnOneId: "m-2" }),
          // Kept ON the day of the last 1-1. The window is inclusive here, and
          // this row is the only thing holding that: with a strict comparison
          // the member loses credit for what they closed that morning.
          commitment({ id: "c-5", status: "completed", statusUpdatedAt: "2026-09-10", oneOnOneId: "m-2" }),
          // The coach's own commitment never counts as the member's.
          commitment({ id: "c-3", owner: "coach", status: "completed", statusUpdatedAt: "2026-09-12", oneOnOneId: "m-1" }),
          // Still open, promised at the last 1-1.
          commitment({ id: "c-4", oneOnOneId: "m-1" }),
        ],
      }),
    );
    getMyHistory.mockResolvedValue([
      meeting({ id: "m-1", heldOn: "2026-09-10", sharedSummaryMarkdown: "recap one", kept: 1, made: 2 }),
      meeting({ id: "m-2", heldOn: "2026-08-27", sharedSummaryMarkdown: null }),
    ]);
    getMyNotes.mockResolvedValue([
      { id: "n-1", createdAt: "2026-09-12T08:00:00Z", body: "after the meeting" },
      // Written ON the day of the 1-1, and deliberately NOT offered as draft
      // material: it was said out loud in the meeting. The opposite convention
      // to the commitment window above, which is why both need a row here.
      { id: "n-3", createdAt: "2026-09-10T08:00:00Z", body: "on the day" },
      { id: "n-2", createdAt: "2026-09-08T08:00:00Z", body: "before it" },
    ]);
  });

  it("counts only the member's own commitments kept since the last 1-1, the day itself included", async () => {
    const page = await getMyCoachingPage(actor);
    // c-1 (after) and c-5 (on the day). Not c-2 (before), not c-3 (the coach's).
    expect(page?.view.since.keptSince).toBe(2);
    expect(page?.view.growth.totalKept).toBe(3);
  });

  it("offers the notes written since the last 1-1 as draft material, the day itself excluded", async () => {
    const page = await getMyCoachingPage(actor);
    // "on the day" was said in the meeting; only what came after is a draft.
    expect(page?.view.since.recentNotes).toEqual(["after the meeting"]);
  });

  it("keeps each meeting's rendered recap with that meeting", async () => {
    const page = await getMyCoachingPage(actor);
    expect(page?.view.meetings.map((m) => [m.id, m.html])).toEqual([
      ["m-1", "html:recap one"],
      ["m-2", null],
    ]);
  });

  it("reads the ring from the last held 1-1 only", async () => {
    const page = await getMyCoachingPage(actor);
    // c-1 and c-4 were promised at m-1; c-3 is the coach's, c-2 an older meeting's.
    expect(page?.view.growth.ring).toEqual({ made: 2, kept: 1, closed: false });
  });

  it("opens History at one held 1-1 and holds the brag document back until three", async () => {
    const page = await getMyCoachingPage(actor);
    expect(page?.view.growth.unlocks.history).toBe(true);
    expect(page?.view.growth.unlocks.bragDocument).toBe(false);
  });

  it("is not a first visit, and says what has happened since", async () => {
    const page = await getMyCoachingPage(actor);
    expect(page?.view.firstVisit).toBe(false);
    expect(page?.view.since.line).not.toBeNull();
  });

  it("asks for the moved cards and the goal's movement from the last held date", async () => {
    await getMyCoachingPage(actor);
    expect(getCardsCompletedSince).toHaveBeenCalledWith(actor, "2026-09-10");
    expect(getGoalMoveSince).toHaveBeenCalledWith("g-1", "2026-09-10");
  });
});

describe("a member on their first visit", () => {
  it("has no goal, no history, and nothing to say about since", async () => {
    getMyCoaching.mockResolvedValue(coaching({ goals: [], nextOneOnOneOn: null }));
    const page = await getMyCoachingPage(actor);

    expect(page?.view.firstVisit).toBe(true);
    expect(page?.view.since.line).toBeNull();
    expect(page?.view.growth.ring).toEqual({ made: 0, kept: 0, closed: false });
    expect(page?.view.growth.unlocks.history).toBe(false);
    expect(page?.view.next).toBeNull();
    // With no active goal the ascent is whatever the ladder gave, un-chained.
    expect(page?.view.ascent).toEqual([]);
  });

  it("never asks for a goal's movement when there is no goal", async () => {
    getMyCoaching.mockResolvedValue(coaching({ goals: [] }));
    await getMyCoachingPage(actor);
    expect(getGoalMoveSince).not.toHaveBeenCalled();
  });

  it("never asks for the goal ladder when there is no goal", async () => {
    // The ladder read takes the active goal itself, so this guard is the only
    // thing standing between no goal and a call with null. Asserting the empty
    // result is not enough: a dropped guard returns the same empty ladder.
    getMyCoaching.mockResolvedValue(coaching({ goals: [] }));
    await getMyCoachingPage(actor);
    expect(getGoalLadder).not.toHaveBeenCalled();
  });
});

describe("a member whose last 1-1 was missed", () => {
  // A booking that did not happen (K.36) keeps its row, and the reader marks it
  // held late; the profile carries the day it was missed on. Both have to
  // survive the assembly, because the page asks the member about it rather than
  // rolling the date on silently.
  beforeEach(() => {
    getMyCoaching.mockResolvedValue(
      coaching({
        missedOn: "2026-09-16",
        nextOneOnOneOn: null,
        commitments: [
          commitment({ id: "c-1", status: "completed", statusUpdatedAt: "2026-09-12", oneOnOneId: "m-2" }),
          commitment({ id: "c-4", oneOnOneId: "m-2" }),
        ],
      }),
    );
    getMyHistory.mockResolvedValue([
      meeting({ id: "m-9", heldOn: "2026-09-16", heldLate: true, sharedSummaryMarkdown: null }),
      meeting({ id: "m-2", heldOn: "2026-09-02", sharedSummaryMarkdown: "the one before" }),
    ]);
  });

  it("carries held-late through to the meeting the page renders", async () => {
    const page = await getMyCoachingPage(actor);
    expect(page?.view.meetings.map((m) => [m.id, m.heldLate])).toEqual([
      ["m-9", true],
      ["m-2", false],
    ]);
  });

  it("keeps the day it was missed on, so the page can ask about it", async () => {
    const page = await getMyCoachingPage(actor);
    expect(page?.view.my.missedOn).toBe("2026-09-16");
    // No date was rolled in its place, so there is nothing to prepare for.
    expect(page?.view.next).toBeNull();
  });

  it("still measures the window from the most recent row, missed or not", async () => {
    await getMyCoachingPage(actor);
    // Today's behaviour, pinned rather than endorsed: the cut-off is the newest
    // history row's date even when that row is a 1-1 that never happened.
    expect(getCardsCompletedSince).toHaveBeenCalledWith(actor, "2026-09-16");
  });
});

describe("the pre-meeting form's window", () => {
  it("opens four days before the 1-1", async () => {
    getMyCoaching.mockResolvedValue(coaching({ nextOneOnOneOn: "2026-09-22" }));
    expect((await getMyCoachingPage(actor))?.view.next?.formOpen).toBe(true);
  });

  it("stays shut when the 1-1 is further out than that", async () => {
    getMyCoaching.mockResolvedValue(coaching({ nextOneOnOneOn: "2026-09-30" }));
    expect((await getMyCoachingPage(actor))?.view.next?.formOpen).toBe(false);
  });

  it("stays open once anything is written, whatever the date says", async () => {
    getMyCoaching.mockResolvedValue(
      coaching({
        nextOneOnOneOn: "2026-10-30",
        preMeeting: { answers: { moved: "shipped the thing", stuck: null, talk: null } },
      }),
    );
    expect((await getMyCoachingPage(actor))?.view.next?.formOpen).toBe(true);
  });
});

describe("the shared bet", () => {
  it("is read when the goal ladders to a key result", async () => {
    getSharedKeyResultGoals.mockResolvedValue([{ id: "g-9" }]);
    const page = await getMyCoachingPage(actor);
    expect(getSharedKeyResultGoals).toHaveBeenCalledWith("kr-1", "g-1");
    expect(page?.view.sharedGoals).toHaveLength(1);
  });

  it("is not read at all when the goal ladders to nothing", async () => {
    getMyCoaching.mockResolvedValue(coaching({ goals: [goal({ ladder: { kind: "none" } })] }));
    const page = await getMyCoachingPage(actor);
    expect(getSharedKeyResultGoals).not.toHaveBeenCalled();
    expect(page?.view.sharedGoals).toEqual([]);
  });
});
