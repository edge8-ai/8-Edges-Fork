import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// training.attendance.marked (LD.2): every status the register's writers land
// is stated, after the write, with the session and the person on the row; a
// refused word and a row nobody wrote state nothing.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const published: [string, unknown][] = [];
vi.mock("@/kernel/events", () => ({ publish: vi.fn(async (name: string, payload: unknown) => void published.push([name, payload])) }));
beforeEach(() => {
  resetFake();
  published.length = 0;
});
afterEach(() => vi.clearAllMocks());

const NOW = new Date("2026-10-14T09:00:00Z");
const TRAINING = { organiser_id: "hoan", starts_at: "2026-10-14T07:00:00Z", ends_at: "2026-10-14T08:15:00Z", cancelled_at: null, self_logged: false, created_at: "2026-10-01T00:00:00Z" };
const row = (over: Record<string, unknown> = {}) => ({ id: "a1", person_id: "duc", status: "pending", source: "member", reviews: [], training: TRAINING, ...over });
const person = (full: string) => ({ display_name: null, preferred_name: null, full_name: full, email: null, first_name: null });

describe("training.attendance.marked", () => {
  it("states the organiser's mark, with the status written", async () => {
    const { organiserCorrects } = await import("./attendance-word");
    script("training_attendance", { data: [row({ status: "absent", source: "organiser" })] }, { data: null });
    expect(await organiserCorrects("hoan", { trainingId: "t1", personId: "duc" }, "attended", NOW)).toEqual({ ok: true });
    expect(published).toEqual([["training.attendance.marked", { trainingId: "t1", personId: "duc", status: "attended" }]]);
  });

  it("states a mark taken back too, so what it earned can be corrected", async () => {
    const { memberSays } = await import("./attendance-word");
    script("training_attendance", { data: [row({ status: "attended" })] }, { data: null });
    await memberSays({ trainingId: "t1", personId: "duc" }, { answer: "absent" }, NOW);
    expect(published).toEqual([["training.attendance.marked", { trainingId: "t1", personId: "duc", status: "absent" }]]);
  });

  it("states nothing when the word is refused or the write fails", async () => {
    const { memberSays, organiserCorrects } = await import("./attendance-word");
    script("training_attendance", { data: [row()] });
    await memberSays({ trainingId: "t1", personId: "duc" }, { answer: "attended" }, new Date("2026-10-30T00:00:00Z"));
    script("training_attendance", { data: [row({ status: "absent", source: "organiser" })] }, { data: null, error: { message: "boom" } });
    expect(await organiserCorrects("hoan", { trainingId: "t1", personId: "duc" }, "attended", NOW)).toMatchObject({ ok: false });
    expect(published).toEqual([]);
  });

  it("states a transcript reading once for the session, however many rows it wrote", async () => {
    const { transcriptHeard } = await import("./attendance-word");
    script(
      "training_attendance",
      { data: [row({ id: "r1", person: person("Nguyễn Văn Đức") }), row({ id: "r2", person_id: "lan", person: person("Trần Thị Lan") })] },
      { data: [{ id: "r1" }] },
      { data: [{ id: "r2" }] },
    );
    expect(await transcriptHeard("t1", ["Duc Nguyen", "Lan Tran"], NOW)).toEqual({ ok: true, changed: 2 });
    expect(published).toEqual([["training.attendance.marked", { trainingId: "t1", personId: null, status: null }]]);
  });

  it("states nothing for a transcript reading that wrote no row", async () => {
    const { transcriptHeard } = await import("./attendance-word");
    script("training_attendance", { data: [row({ id: "r1", person: person("Nguyễn Văn Đức") })] }, { data: [] });
    expect(await transcriptHeard("t1", ["Duc Nguyen"], NOW)).toEqual({ ok: true, changed: 0 });
    expect(published).toEqual([]);
  });
});
