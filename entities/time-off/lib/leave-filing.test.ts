import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// fileOwnLeave carries the rule team's funnel applied until A.88.6
// (teamInsertOwn): an employee's leave is always filed for their own team
// member id. A row that names someone else is overwritten, never trusted.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { fileOwnLeave } = await import("./leave-filing");

beforeEach(() => resetFake());

describe("fileOwnLeave", () => {
  it("files the row for the actor's own team member id, whatever the row says", async () => {
    script("time_off", { data: { id: "new" } });
    const row = { team_member_id: "tm-someone-else", leave_type: "vacation", start_date: "2026-12-01", end_date: "2026-12-02", status: "requested" };
    await expect(fileOwnLeave({ teamMemberId: "tm-me" }, row as never)).resolves.toMatchObject({ data: { id: "new" }, error: null });
    const insert = calls.find((c) => c.table === "time_off" && c.ops.includes("insert"));
    expect(insert?.payloads[0]).toMatchObject({ team_member_id: "tm-me", leave_type: "vacation" });
  });
});
