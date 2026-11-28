import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.1.4: the rule the daily scheduler asks about client reviews. The
// member's reminder moved to the due date in CR.5.5 (member-email-scheduler).
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { ReadFailure } from "@/kernel/data/read";
import { membersInRecentClientCycles } from "./schedule";

beforeEach(() => resetFake());

describe("membersInRecentClientCycles", () => {
  it("names the members placed at a client with a cycle in the last year", async () => {
    script("review_cycles", { data: [{ company_id: "client-1" }, { company_id: "client-1" }] });
    script("staff_assignments", { data: [{ team_member_id: "ana", company_id: "client-1" }, { team_member_id: "bao", company_id: "client-1" }] });
    expect(await membersInRecentClientCycles("2026-11-12")).toEqual(new Set(["ana", "bao"]));
  });

  it("asks nothing about placements when no client held a cycle", async () => {
    script("review_cycles", { data: [] });
    expect(await membersInRecentClientCycles("2026-11-12")).toEqual(new Set());
  });

  it("raises when the cycles cannot be read, rather than opening every mid-year review", async () => {
    script("review_cycles", { error: { message: "connection reset" } });
    await expect(membersInRecentClientCycles("2026-11-12")).rejects.toBeInstanceOf(ReadFailure);
  });
});
