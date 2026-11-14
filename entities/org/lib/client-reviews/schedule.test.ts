import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.1.4: the two rules the nightly scheduler asks about client reviews.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { ReadFailure } from "@/kernel/data/read";
import { membersInRecentClientCycles, membersToRemind } from "./schedule";

beforeEach(() => resetFake());

describe("membersToRemind", () => {
  const part = (rater_kind: string, created_at: string, team_member_id = "ana") => ({ team_member_id, rater_kind, created_at });

  it("reminds a member whose own part has waited exactly three days", () => {
    expect(membersToRemind([part("self", "2026-11-09T02:00:00Z")], "2026-11-12")).toEqual(["ana"]);
  });

  it("reminds once: not on day two, not again on day four", () => {
    expect(membersToRemind([part("self", "2026-11-10T02:00:00Z")], "2026-11-12")).toEqual([]);
    expect(membersToRemind([part("self", "2026-11-08T02:00:00Z")], "2026-11-12")).toEqual([]);
  });

  it("never reminds a client manager or a skip-manager", () => {
    expect(membersToRemind([part("client_manager", "2026-11-09T02:00:00Z"), part("skip_manager", "2026-11-09T02:00:00Z")], "2026-11-12")).toEqual([]);
  });
});

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
