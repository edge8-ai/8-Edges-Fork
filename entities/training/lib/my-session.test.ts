import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The learner's session (PR 8): a session the reader is not on reads as not
// found; a recap reaches them only once published and only their own line;
// the programme splits into what is next and what has started.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const DUC = "8d06e46e-f4ea-4879-b2f7-2f168c0be03b";
const HARRY = "b38d7bf2-643b-4d11-8ecc-af3b25b8f2ca";
const person = (full: string) => ({ display_name: null, preferred_name: null, full_name: full, email: null });
const training = (over: Record<string, unknown>) => ({
  id: "t1", title: "ECP", starts_at: "2026-10-14T07:00:00Z", ends_at: "2026-10-14T08:15:00Z", cancelled_at: null, plan_id: "p1", plan_state: "checked", materials: [{ label: "Slides", url: "https://x" }],
  recap: { covered: "Drills.", learners: [{ person_id: DUC, md: "Your line." }, { person_id: HARRY, md: "Harry's line." }], homework_suggestion: "Record." }, recap_state: "published",
  plan: { title: "ECP" }, organiser: person("Hoan Ngo"), attendance: [{ person_id: DUC, removed_at: null, person: person("Nguyễn Văn Đức") }, { person_id: HARRY, removed_at: null, person: person("Lê Vinh") }],
  blocks: [{ position: 1, side: "reactive", minutes: 20, text: "Ask back", exercise: null }, { position: 0, side: "presentation", minutes: 10, text: null, exercise: { title: "Drill" } }],
  assignments: [], ...over,
});

describe("readMySession", () => {
  it("is null for a session the reader is not on", async () => {
    const { readMySession } = await import("./my-session");
    script("training_attendance", { data: [] });
    expect(await readMySession(DUC, "t1")).toBeNull();
  });

  it("gives the reader their own recap line and nobody else's, the blocks in order, the materials", async () => {
    const { readMySession } = await import("./my-session");
    script("training_attendance", { data: [{ id: "a1", status: "attended", source: "transcript", training: training({}) }] });
    const s = await readMySession(DUC, "t1");
    expect(s?.recap).toEqual({ covered: "Drills.", mine: "Your line.", homeworkSuggestion: "Record." });
    expect(JSON.stringify(s)).not.toContain("Harry's line");
    expect(s?.blocks.map((b) => b.label)).toEqual(["Drill", "Ask back"]);
    expect(s?.with).toEqual(["Lê Vinh"]);
    expect(s?.attendance).toEqual({ attendanceId: "a1", status: "attended", source: "transcript" });
  });

  it("hides a recap that is only drafted", async () => {
    const { readMySession } = await import("./my-session");
    script("training_attendance", { data: [{ id: "a1", status: "pending", source: "member", training: training({ recap_state: "drafted" }) }] });
    const s = await readMySession(DUC, "t1");
    expect(s?.recap).toBeNull();
    expect(s?.recapState).toBe("drafted");
  });
});

describe("splitProgramme", () => {
  it("puts the soonest three ahead and the started ones behind, newest first", async () => {
    const { splitProgramme } = await import("./my-session");
    const now = new Date("2026-10-14T00:00:00Z");
    const s = (d: string) => ({ startsAt: `2026-10-${d}T07:00:00Z` });
    const out = splitProgramme([s("20"), s("09"), s("16"), s("07"), s("27"), s("14")], now);
    expect(out.next.map((x) => x.startsAt.slice(8, 10))).toEqual(["14", "16", "20"]);
    expect(out.past.map((x) => x.startsAt.slice(8, 10))).toEqual(["09", "07"]);
  });
});
