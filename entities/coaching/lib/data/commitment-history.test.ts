import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// K.14: a commitment is a target, and a target can change whenever. The rule the
// board relies on is that the SAME call that changes a commitment records the
// change, so the current wording and status on coaching_commitments and the
// history behind them can never disagree — and that a rejected write records
// nothing, because nothing changed.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("@/entities/boards", () => ({
  selectTasks: () => builderFor("tasks"),
  selectBoardMembers: () => builderFor("board_members"),
  selectBoardColumns: () => builderFor("board_columns"),
  insertTasks: async () => ({ error: null }),
  SUBJECT_COMMITMENT: "commitment",
}));

import { coachUpdateCommitment } from "./commitments";
import { myUpdateCommitmentStatus } from "./member";
import { myUpdateCommitmentDetails } from "./member-commitments";
import { columnFor } from "../types";
import type { TeamActor } from "@/kernel/identity/team-auth";

const actor = { teamMemberId: "tm-1", personId: "p-1", isAdmin: false } as unknown as TeamActor;
const historyInserts = () =>
  calls
    .filter((c) => c.table === "coaching_commitment_history" && c.ops.includes("insert"))
    .map((c) => c.payloads);

// Each flow's queries in the order it makes them, answered the way the
// ownership check and the write need; the kernel fake throws on any other.
/** A member's status change: the owned row, its update, the history row, the check-in read. */
function scriptStatusChange(row: Record<string, unknown>) {
  script("coaching_commitments", { data: row }, { data: row });
  script("coaching_commitment_history", { data: null });
  script("coaching_checkins", { data: null });
}

beforeEach(() => resetFake());

describe("columnFor maps the status vocabulary onto the board", () => {
  it("open, on_track and needs_attention all read as On it", () => {
    expect(columnFor("open")).toBe("on_it");
    expect(columnFor("on_track")).toBe("on_it");
    expect(columnFor("needs_attention")).toBe("on_it");
  });

  it("blocked and completed have a column of their own", () => {
    expect(columnFor("blocked")).toBe("blocked");
    expect(columnFor("completed")).toBe("done");
  });

  it("dropped is off the board", () => {
    expect(columnFor("dropped")).toBeNull();
  });
});

describe("the writer records the change it made", () => {
  it("writes a history row on a member's status change", async () => {
    scriptStatusChange({
      id: "c-1",
      coaching_profile_id: "pr-1",
      status: "on_track",
      coaching_profiles: { team_member_id: "tm-1" },
    });
    const res = await myUpdateCommitmentStatus(actor, "c-1", "blocked", "waiting on the vendor");
    expect(res.ok).toBe(true);
    expect(historyInserts()).toEqual([
      [
        {
          commitment_id: "c-1",
          changed_by: "tm-1",
          title_before: null,
          title_after: null,
          status_before: "on_track",
          status_after: "blocked",
        },
      ],
    ]);
  });

  it("writes a history row on a title change", async () => {
    // The member's profile, the owned row, its update, the history row.
    const row = { id: "c-1", created_by: "tm-1", title: "Old wording" };
    script("coaching_profiles", { data: { id: "pr-1" } });
    script("coaching_commitments", { data: row }, { data: row });
    script("coaching_commitment_history", { data: null });
    const res = await myUpdateCommitmentDetails(actor, "c-1", { title: "New wording", dueOn: null });
    expect(res.ok).toBe(true);
    expect(historyInserts()).toEqual([
      [
        {
          commitment_id: "c-1",
          changed_by: "tm-1",
          title_before: "Old wording",
          title_after: "New wording",
          status_before: null,
          status_after: null,
        },
      ],
    ]);
  });

  it("writes nothing when ownership rejects the change", async () => {
    // A commitment on someone else's profile: the member tier refuses it, and a
    // refused write must leave no trace in the history either.
    script("coaching_commitments", {
      data: { id: "c-1", coaching_profile_id: "pr-9", status: "on_track", coaching_profiles: { team_member_id: "tm-other" } },
    });
    const res = await myUpdateCommitmentStatus(actor, "c-1", "completed", "");
    expect(res.ok).toBe(false);
    expect(historyInserts()).toEqual([]);
  });

  it("writes nothing when the coach does not own the commitment", async () => {
    script("coaching_commitments", {
      data: { id: "c-1", title: "Theirs", status: "on_track", coaching_profiles: { coach_id: "tm-other" } },
    });
    const res = await coachUpdateCommitment(actor, "c-1", { status: "completed" });
    expect(res.ok).toBe(false);
    expect(historyInserts()).toEqual([]);
  });
});
