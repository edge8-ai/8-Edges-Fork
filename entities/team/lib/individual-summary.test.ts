import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The Tuesday DM's "1-1: recorded <date>" (A.35.2). Of sixteen queries that
// read held 1-1s, this was the one that counted an archived 1-1 — a duplicate
// recording a coach threw away still read as "recorded" — and that bounded its
// fourteen days from UTC Date.now(), ignoring the `now` it is handed, while
// every other held read keeps Saigon's day.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/boards", () => ({
  readBoardState: async () => ({}),
  personBoardState: () => ({ done: [], doing: [], waiting: [] }),
}));

const { gatherIndividualSummaries } = await import("./individual-summary");

const oneOnOneRead = () => calls.find((c) => c.table === "coaching_one_on_ones" && c.ops[0] === "select");

beforeEach(() => {
  resetFake();
  script("team_directory", { data: [{ person_id: "p-1", first_name: "An", last_name: "Le", email: "an@example.com", department_name: "EO" }] });
  script("ideas", { data: [] });
  script("coaching_profiles", { data: [{ id: "cp-1", team_members: { person_id: "p-1" } }] });
  script("coaching_one_on_ones", { data: [{ coaching_profile_id: "cp-1", held_on: "2026-10-01" }] });
});

describe("the summary's recorded 1-1", () => {
  it("never counts an archived 1-1, like every other held read", async () => {
    await gatherIndividualSummaries(new Date("2026-10-06T09:00:00Z"));
    expect(oneOnOneRead()?.filters).toEqual(expect.arrayContaining([["eq", "status", "held"], ["is", "archived_at", null]]));
  });

  // The cron runs at 09:00 UTC, when the two dates agree; at 22:00 UTC Saigon
  // is already on the next day, which is where a UTC bound would be a day off.
  it("counts its fourteen days back from Saigon's today, from the moment it is given", async () => {
    await gatherIndividualSummaries(new Date("2026-10-06T22:00:00Z"));
    expect(oneOnOneRead()?.filters).toEqual(expect.arrayContaining([["gte", "held_on", "2026-09-23"]]));
  });

  it("reports the most recent held 1-1 it read", async () => {
    const [summary] = await gatherIndividualSummaries(new Date("2026-10-06T09:00:00Z"));
    expect(summary).toMatchObject({ personId: "p-1", oneOnOneRecorded: true, oneOnOneDate: "2026-10-01" });
  });
});
