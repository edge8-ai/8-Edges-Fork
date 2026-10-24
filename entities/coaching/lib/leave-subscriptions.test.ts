import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Coaching's side of an approved leave (S.2).
//
// Until this landed, the only thing that knew a booked 1-1 had fallen inside
// somebody's holiday was the page rendering it: `getLeaveSpans` reads time-off
// on every coach's picker and every member's pane, and the nightly coaching
// cycle stamps the meeting missed once the day has gone. The meeting itself sat
// on the calendar, in the holiday, until a person noticed.
//
// What is pinned here is the decision, not the SQL: which booked 1-1s an
// approval moves, where to, and the cases where it must move nothing at all.

/** Per table, the answers the kernel fake hands back in order. */
type Answers = Record<string, { data: unknown; error: { message: string } | null }[]>;
function scriptTables(answers: Answers) {
  for (const [table, list] of Object.entries(answers)) script(table, ...list);
}

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
// data/shared.ts reaches boards' door for the commitment-card helpers; nothing
// under test calls them.
vi.mock("@/entities/boards", () => ({
  SUBJECT_COMMITMENT: "coaching_commitment",
  selectTasks: () => undefined,
  selectBoardMembers: () => undefined,
  selectBoardColumns: () => undefined,
  selectBoards: () => undefined,
  listActiveBoards: () => [],
}));
// The member's other approved leave, through time-off's door.
let otherSpans: { startDate: string; endDate: string }[] = [];
vi.mock("./data/leave", () => ({
  getLeaveSpans: vi.fn(async () => otherSpans),
  getLeaveSpansByMember: vi.fn(async () => new Map()),
}));

import { moveOneOnOnesOffLeave, movesForLeave } from "./leave-subscriptions";

const LEAVE = {
  requestId: "req-1",
  teamMemberId: "tm-1",
  // Monday 5 October 2026 to Friday the 9th.
  startDate: "2026-10-05",
  endDate: "2026-10-09",
  leaveType: "annual",
};

beforeEach(() => {
  resetFake();
  otherSpans = [];
});

describe("movesForLeave", () => {
  const span = { startDate: LEAVE.startDate, endDate: LEAVE.endDate };

  it("moves a 1-1 booked inside the holiday to the same weekday after it", () => {
    // Wednesday the 7th goes to Wednesday the 14th, not to Saturday the 10th:
    // the first clear day is a weekend, and the rhythm is the pair's weekday.
    const moves = movesForLeave([{ id: "m1", heldOn: "2026-10-07", status: "scheduled" }], span, [span]);
    expect(moves).toEqual([{ meetingId: "m1", from: "2026-10-07", to: "2026-10-14" }]);
  });

  it("leaves a 1-1 outside the holiday exactly where it is", () => {
    // Both ends are inclusive, so the day before and the day after are outside.
    const meetings = [
      { id: "before", heldOn: "2026-10-04", status: "scheduled" },
      { id: "after", heldOn: "2026-10-10", status: "scheduled" },
    ];
    expect(movesForLeave(meetings, span, [span])).toEqual([]);
  });

  it("does not move a 1-1 that already happened, or one the coach skipped", () => {
    const meetings = [
      { id: "held", heldOn: "2026-10-06", status: "held" },
      { id: "skipped", heldOn: "2026-10-07", status: "skipped" },
    ];
    expect(movesForLeave(meetings, span, [span])).toEqual([]);
  });

  it("steps over leave that starts again the day the holiday ends", () => {
    // Two approved requests back to back: the first day after THIS one is still
    // a day away, and a move onto it would be a second holiday booking.
    const next = { startDate: "2026-10-10", endDate: "2026-10-13" };
    const moves = movesForLeave([{ id: "m1", heldOn: "2026-10-06", status: "scheduled" }], span, [span, next]);
    // Tuesday the 13th is still leave, so the Tuesday after it.
    expect(moves).toEqual([{ meetingId: "m1", from: "2026-10-06", to: "2026-10-20" }]);
  });

  it("keeps a Thursday 1-1 on a Thursday rather than quietly re-cadencing it", () => {
    const moves = movesForLeave([{ id: "m1", heldOn: "2026-10-08", status: "scheduled" }], span, [span]);
    expect(moves[0].to).toBe("2026-10-15");
  });

  it("gives two 1-1s inside one holiday two different days", () => {
    // One live row per profile per date — a partial unique index enforces it —
    // so stacking both on the same day would lose the second move silently.
    const meetings = [
      { id: "later", heldOn: "2026-10-08", status: "scheduled" },
      { id: "earlier", heldOn: "2026-10-06", status: "scheduled" },
    ];
    const moves = movesForLeave(meetings, span, [span]);
    expect(moves).toEqual([
      { meetingId: "earlier", from: "2026-10-06", to: "2026-10-13" },
      { meetingId: "later", from: "2026-10-08", to: "2026-10-15" },
    ]);
  });

  it("moves nothing when the whole horizon is leave", () => {
    // A real answer, not a failure: a coach facing a month away should be told
    // nothing moved rather than handed a date past the horizon.
    const long = { startDate: "2026-10-05", endDate: "2026-12-31" };
    expect(movesForLeave([{ id: "m1", heldOn: "2026-10-07", status: "scheduled" }], span, [long])).toEqual([]);
  });
});

describe("moveOneOnOnesOffLeave", () => {
  const profile = { id: "prof-1" };

  it("does nothing for somebody nobody coaches", async () => {
    scriptTables({ coaching_profiles: [{ data: null, error: null }] });
    await moveOneOnOnesOffLeave(LEAVE);
    // One read, no write: a deployment with time off and no coaching roster is
    // an ordinary deployment.
    expect(calls.filter((c) => c.ops.includes("update"))).toHaveLength(0);
  });

  it("moves the booked 1-1 and says why on the row", async () => {
    scriptTables({
      coaching_profiles: [{ data: profile, error: null }],
      coaching_one_on_ones: [
        { data: [{ id: "m1", held_on: "2026-10-07", status: "scheduled" }], error: null },
        // liveScheduledRowOn: the target day is free.
        { data: null, error: null },
        { data: null, error: null },
      ],
    });
    await moveOneOnOnesOffLeave(LEAVE);

    const update = calls.find((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"));
    expect(update).toBeDefined();
    const body = update!.payloads[0] as Record<string, unknown>;
    expect(body.held_on).toBe("2026-10-14");
    expect(body.moved_from).toBe("2026-10-07");
    // A move answers a passed booking by itself, exactly as a coach's own move
    // does: nothing is stamped or cleared (ADR-0010).
    expect(body).not.toHaveProperty("missed_at");
    expect(String(body.move_reason)).toMatch(/leave/i);
    // The rhythm is the member's, not the system's: a move never decides that a
    // meeting happened or did not.
    expect(body).not.toHaveProperty("status");
  });

  it("leaves the day alone when another 1-1 already holds it", async () => {
    scriptTables({
      coaching_profiles: [{ data: profile, error: null }],
      coaching_one_on_ones: [
        { data: [{ id: "m1", held_on: "2026-10-07", status: "scheduled" }], error: null },
        // liveScheduledRowOn finds a booking already on the 14th.
        { data: { id: "other", status: "scheduled" }, error: null },
      ],
    });
    await moveOneOnOnesOffLeave(LEAVE);
    expect(calls.filter((c) => c.ops.includes("update"))).toHaveLength(0);
  });

  it("throws when the move cannot be written, so the bus audits the drop", async () => {
    scriptTables({
      coaching_profiles: [{ data: profile, error: null }],
      coaching_one_on_ones: [
        { data: [{ id: "m1", held_on: "2026-10-07", status: "scheduled" }], error: null },
        { data: null, error: null },
        { data: null, error: { message: "connection reset" } },
      ],
    });
    // Silence here would leave the member's 1-1 sitting in their holiday with
    // nothing anywhere saying so.
    await expect(moveOneOnOnesOffLeave(LEAVE)).rejects.toThrow(/m1/);
  });

  it("counts the member's other approved leave, not just the one just approved", async () => {
    // Leave the week after as well: Wednesday the 14th is taken, so the 21st.
    otherSpans = [{ startDate: "2026-10-12", endDate: "2026-10-16" }];
    scriptTables({
      coaching_profiles: [{ data: profile, error: null }],
      coaching_one_on_ones: [
        { data: [{ id: "m1", held_on: "2026-10-07", status: "scheduled" }], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    });
    await moveOneOnOnesOffLeave(LEAVE);
    const update = calls.find((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"))!;
    const body = update.payloads[0] as Record<string, unknown>;
    expect(body.held_on).toBe("2026-10-21");
  });
});
