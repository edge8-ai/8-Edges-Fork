import { beforeEach, describe, expect, it, vi } from "vitest";

// The sprint brief drafted from a meeting moved from boards to crm (ADR 0032).
// It is still gated on the sprint's board through boards' boardMutation, and it
// still returns a draft for review rather than saving anything.
const gate = vi.hoisted(() => ({ result: null as unknown }));
const boards = vi.hoisted(() => ({
  boardMutation: vi.fn(async () => gate.result),
  boardClientName: vi.fn(async () => ({ ok: true, name: "Example Client" })),
}));
vi.mock("@/entities/boards", () => boards);
const extract = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, draft: { goal: "Ship the intake", focus_improvement: "Fewer handoffs", going_well: "Demos", meeting_summary: "Agreed the scope." } })),
);
vi.mock("./sprint-extract", () => ({ extractSprintBrief: extract }));

const { draftSprintBriefFromMeeting } = await import("./sprint-meetings-actions");

beforeEach(() => {
  vi.clearAllMocks();
  gate.result = { ok: true, actor: { label: "Delivery Lead" }, row: { board_id: "board-1", meeting_id: "meeting-1" } };
});

describe("drafting a sprint's brief from its meeting", () => {
  it("is gated on the sprint's board, and a refusal reads nothing", async () => {
    gate.result = { ok: false, error: "You do not have access to this board." };
    expect(await draftSprintBriefFromMeeting("sprint-1")).toEqual({ ok: false, error: "You do not have access to this board." });
    expect(boards.boardMutation).toHaveBeenCalledWith({ table: "sprints", id: "sprint-1", select: "board_id, meeting_id", label: "sprint" });
    expect(extract).not.toHaveBeenCalled();
  });

  it("asks for a meeting first when none is attached", async () => {
    gate.result = { ok: true, actor: {}, row: { board_id: "board-1", meeting_id: null } };
    expect(await draftSprintBriefFromMeeting("sprint-1")).toEqual({ ok: false, error: "Attach a meeting first." });
    expect(extract).not.toHaveBeenCalled();
  });

  it("drafts the board's client's slice of the attached meeting", async () => {
    expect(await draftSprintBriefFromMeeting("sprint-1")).toEqual({
      ok: true,
      draft: { goal: "Ship the intake", focusImprovement: "Fewer handoffs", goingWell: "Demos", meetingSummary: "Agreed the scope." },
    });
    expect(boards.boardClientName).toHaveBeenCalledWith("board-1");
    expect(extract).toHaveBeenCalledWith("meeting-1", "Example Client");
  });
});
