import { describe, expect, it, vi } from "vitest";

// hiring-grid reaches hiring through its front door, as the boundary rules
// require, but that barrel is server-only (it pulls in React's `cache`). The
// two helpers it actually uses are pure and live in a client-safe module, so
// the door is stubbed here with the real implementations from that module —
// the behaviour under test is unchanged.
vi.mock("@/entities/hiring", async () => {
  const panel = await vi.importActual<
    typeof import("@/entities/hiring/lib/interview-panel")
  >("@/entities/hiring/lib/interview-panel");
  return { isAiPanelist: panel.isAiPanelist, recommendationFromDb: panel.recommendationFromDb };
});

import {
  bookedLabel,
  buildInterviewIndex,
  cellForStep,
  cellsForRow,
  roundLabel,
  saigonDateKey,
  type CandidateMeta,
  type IvRow,
} from "./hiring-grid";

// Characterisation tests: these pin the grid rules exactly as they behaved
// while they were closures inside getTeamHiring.

const iv = (over: Partial<IvRow> & { id: string }): IvRow => ({
  loopStepId: "step-1",
  label: "Interview",
  scheduledAt: null,
  durationMinutes: 60,
  status: null,
  mode: null,
  humanSeats: 0,
  submittedHuman: 0,
  recommendations: [],
  avgScore: null,
  revealed: true,
  ...over,
});

// 2026-08-14 10:00 Saigon == 2026-08-14T03:00Z.
const NOW_MS = Date.parse("2026-08-14T03:00:00Z");
const TODAY_KEY = "2026-08-14";

describe("saigonDateKey", () => {
  it("reads the Saigon calendar date, not the UTC one", () => {
    // 18:00 UTC is already the next day in Saigon (+07).
    expect(saigonDateKey(new Date("2026-08-14T18:00:00Z"))).toBe("2026-08-15");
    expect(saigonDateKey(new Date("2026-08-14T03:00:00Z"))).toBe("2026-08-14");
  });
});

describe("roundLabel", () => {
  it("prefers the loop step name", () => {
    expect(roundLabel("  Hiring manager  ", "Calendar invite")).toBe("Hiring manager");
  });

  it("falls back to a short, non-invite title", () => {
    expect(roundLabel(null, "Culture chat")).toBe("Culture chat");
    expect(roundLabel("   ", "Culture chat")).toBe("Culture chat");
  });

  it("rejects invite-ish or over-long titles", () => {
    expect(roundLabel(null, "Invitation: chat with Mai")).toBe("Interview");
    expect(roundLabel(null, "x".repeat(41))).toBe("Interview");
    expect(roundLabel(null, null)).toBe("Interview");
  });
});

describe("bookedLabel", () => {
  it("says Today plus the Saigon time for a booking today", () => {
    expect(bookedLabel("2026-08-14T07:30:00Z", TODAY_KEY)).toBe("Today 14:30");
  });

  it("says a bare day and month otherwise", () => {
    expect(bookedLabel("2026-08-20T07:30:00Z", TODAY_KEY)).toBe("20 Aug");
  });
});

describe("cellForStep", () => {
  it("returns null when the candidate has no interview on that step", () => {
    expect(cellForStep("step-1", [], NOW_MS, TODAY_KEY)).toBeNull();
    expect(
      cellForStep("step-1", [iv({ id: "a", loopStepId: "step-2" })], NOW_MS, TODAY_KEY),
    ).toBeNull();
  });

  it("shows the soonest future booking", () => {
    const cell = cellForStep(
      "step-1",
      [
        iv({ id: "later", scheduledAt: "2026-08-20T07:30:00Z" }),
        iv({ id: "sooner", scheduledAt: "2026-08-15T07:30:00Z" }),
      ],
      NOW_MS,
      TODAY_KEY,
    );
    expect(cell).toEqual({
      status: "booked",
      label: "15 Aug",
      interviewId: "sooner",
      scheduledAt: "2026-08-15T07:30:00Z",
    });
  });

  it("shows pending with a submitted/seats count when scorecards are outstanding", () => {
    expect(
      cellForStep(
        "step-1",
        [iv({ id: "past", scheduledAt: "2026-08-01T07:30:00Z", humanSeats: 3, submittedHuman: 1 })],
        NOW_MS,
        TODAY_KEY,
      ),
    ).toEqual({
      status: "pending",
      label: "1/3",
      interviewId: "past",
      scheduledAt: "2026-08-01T07:30:00Z",
    });
  });

  it("shows done once every human seat has filed", () => {
    expect(
      cellForStep(
        "step-1",
        [iv({ id: "past", scheduledAt: "2026-08-01T07:30:00Z", humanSeats: 2, submittedHuman: 2 })],
        NOW_MS,
        TODAY_KEY,
      ),
    ).toEqual({
      status: "done",
      label: "Done",
      interviewId: "past",
      scheduledAt: "2026-08-01T07:30:00Z",
    });
  });

  it("shows done for a past interview with no human seats at all", () => {
    expect(
      cellForStep("step-1", [iv({ id: "ai-only", scheduledAt: "2026-08-01T07:30:00Z" })], NOW_MS, TODAY_KEY)
        ?.status,
    ).toBe("done");
  });

  it("lets the latest past interview decide when a step was run twice", () => {
    const cell = cellForStep(
      "step-1",
      [
        iv({ id: "first", scheduledAt: "2026-08-01T07:30:00Z", humanSeats: 1, submittedHuman: 1 }),
        iv({ id: "redo", scheduledAt: "2026-08-10T07:30:00Z", humanSeats: 1, submittedHuman: 0 }),
      ],
      NOW_MS,
      TODAY_KEY,
    );
    expect(cell).toMatchObject({ status: "pending", interviewId: "redo", label: "0/1" });
  });
});

describe("cellsForRow", () => {
  const steps = ["step-1", "step-2", "step-3"];

  it("blanks every unbooked step for a candidate not at the interview stage", () => {
    expect(cellsForRow(steps, [], false, NOW_MS, TODAY_KEY).map((c) => [c.status, c.label])).toEqual([
      ["none", "-"],
      ["none", "-"],
      ["none", "-"],
    ]);
  });

  it("marks the first unbooked step as the action for a candidate at interview", () => {
    expect(cellsForRow(steps, [], true, NOW_MS, TODAY_KEY).map((c) => [c.status, c.label])).toEqual([
      ["action", "Nothing booked"],
      ["open", "Not booked"],
      ["open", "Not booked"],
    ]);
  });

  it("skips past the steps that already have interviews", () => {
    const ivs = [iv({ id: "done-1", loopStepId: "step-1", scheduledAt: "2026-08-01T07:30:00Z" })];
    expect(cellsForRow(steps, ivs, true, NOW_MS, TODAY_KEY).map((c) => c.status)).toEqual([
      "done",
      "action",
      "open",
    ]);
  });
});

describe("buildInterviewIndex", () => {
  const cand = new Map<string, CandidateMeta>([
    ["app-1", { name: "Mai", reqId: "req-1", stageName: "Interview", rating: 4 }],
  ]);

  const rawRow = (over: Record<string, unknown>): Record<string, unknown> => ({
    id: "iv-1",
    application_id: "app-1",
    loop_step_id: "step-1",
    scheduled_at: "2026-08-20T07:30:00Z",
    duration_minutes: 45,
    status: "scheduled",
    mode: "video",
    title: null,
    requisition_loop_steps: { name: "Hiring manager" },
    interview_interviewers: [],
    interview_scorecards: [],
    ...over,
  });

  it("skips rows whose application has no candidate metadata", () => {
    const idx = buildInterviewIndex([rawRow({ application_id: "ghost" })], cand, "me");
    expect(idx.ivByApp.size).toBe(0);
    expect(idx.bookedByStep.size).toBe(0);
    expect(idx.unassignedByReq.size).toBe(0);
  });

  it("indexes a booked interview by application and by loop step", () => {
    const idx = buildInterviewIndex([rawRow({})], cand, "me");
    expect(idx.ivByApp.get("app-1")).toEqual([
      {
        id: "iv-1",
        loopStepId: "step-1",
        label: "Hiring manager",
        scheduledAt: "2026-08-20T07:30:00Z",
        durationMinutes: 45,
        status: "scheduled",
        mode: "video",
        humanSeats: 0,
        submittedHuman: 0,
        recommendations: [],
        avgScore: null,
        revealed: true,
      },
    ]);
    expect(idx.bookedByStep.get("step-1")).toEqual([
      {
        interviewId: "iv-1",
        candidateName: "Mai",
        scheduledAt: "2026-08-20T07:30:00Z",
        durationMinutes: 45,
        status: "scheduled",
        mode: "video",
      },
    ]);
    expect(idx.unassignedByReq.size).toBe(0);
  });

  it("counts a step-less interview against the req instead of booking it", () => {
    const idx = buildInterviewIndex([rawRow({ loop_step_id: null })], cand, "me");
    expect(idx.unassignedByReq.get("req-1")).toBe(1);
    expect(idx.bookedByStep.size).toBe(0);
    expect(idx.ivByApp.get("app-1")?.[0].loopStepId).toBeNull();
  });

  it("sorts each step's bookings soonest first", () => {
    const idx = buildInterviewIndex(
      [
        rawRow({ id: "late", scheduled_at: "2026-08-25T07:30:00Z" }),
        rawRow({ id: "early", scheduled_at: "2026-08-18T07:30:00Z" }),
      ],
      cand,
      "me",
    );
    expect(idx.bookedByStep.get("step-1")?.map((b) => b.interviewId)).toEqual(["early", "late"]);
  });

  it("counts only submitted human scorecards and averages their scores", () => {
    const idx = buildInterviewIndex(
      [
        rawRow({
          interview_interviewers: [
            { interviewer_id: "h1", people: { email: "h1@example.com", metadata: {} } },
            { interviewer_id: "h2", people: { email: "h2@example.com", metadata: {} } },
          ],
          interview_scorecards: [
            { interviewer_id: "h1", submitted_at: "2026-08-21T00:00:00Z", recommendation: "yes", overall_score: 4 },
            { interviewer_id: "h2", submitted_at: null, recommendation: "no", overall_score: 1 },
            { interviewer_id: "stranger", submitted_at: "2026-08-21T00:00:00Z", recommendation: "yes", overall_score: 5 },
          ],
        }),
      ],
      cand,
      "me",
    );
    const row = idx.ivByApp.get("app-1")?.[0];
    expect(row).toMatchObject({ humanSeats: 2, submittedHuman: 1, avgScore: 4, revealed: true });
    expect(row?.recommendations).toHaveLength(1);
  });

  it("stays blind while a panelist viewer has not filed their own scorecard", () => {
    const seats = [{ interviewer_id: "me", people: { email: "me@example.com", metadata: {} } }];
    const blind = buildInterviewIndex([rawRow({ interview_interviewers: seats })], cand, "me");
    expect(blind.ivByApp.get("app-1")?.[0].revealed).toBe(false);

    const filed = buildInterviewIndex(
      [
        rawRow({
          interview_interviewers: seats,
          interview_scorecards: [
            { interviewer_id: "me", submitted_at: "2026-08-21T00:00:00Z", recommendation: "yes", overall_score: 3 },
          ],
        }),
      ],
      cand,
      "me",
    );
    expect(filed.ivByApp.get("app-1")?.[0].revealed).toBe(true);
  });
});
