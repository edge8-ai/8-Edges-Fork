import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The register's writers (A.40), through their own interface over the house
// fake: that each carries out what decide returned, writes the source with the
// status, removes a review before the status leaves attended, and writes
// nothing when it refuses. The rules themselves are in attendance-word.test.ts.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const NOW = new Date("2026-10-14T09:00:00Z");
const TRAINING = { organiser_id: "hoan", starts_at: "2026-10-14T07:00:00Z", ends_at: "2026-10-14T08:15:00Z", cancelled_at: null, self_logged: false, created_at: "2026-10-01T00:00:00Z" };
const row = (over: Record<string, unknown> = {}) => ({ id: "a1", person_id: "duc", status: "attended", source: "transcript", reviews: [], training: TRAINING, ...over });
const writes = (table: string) => calls.filter((c) => c.table === table && c.ops.some((op) => ["update", "insert", "upsert", "delete"].includes(op)));

describe("memberSays", () => {
  it("records the member as the source, so the next transcript reading keeps their word", async () => {
    const { memberSays } = await import("./attendance-word");
    script("training_attendance", { data: [row()] }, { data: null });
    expect(await memberSays({ trainingId: "t1", personId: "duc" }, { answer: "skipped", reason: "clashed" }, NOW)).toEqual({ ok: true });
    const [update] = writes("training_attendance");
    expect(update?.payloads[0]).toEqual({ status: "skipped", source: "member", skip_reason: "clashed", answered_at: NOW.toISOString() });
    expect(update?.filters).toEqual(expect.arrayContaining([["eq", "id", "a1"], ["eq", "person_id", "duc"]]));
  });

  it("names the row by the training and the member's own person id", async () => {
    const { memberSays } = await import("./attendance-word");
    script("training_attendance", { data: [row()] }, { data: null });
    await memberSays({ trainingId: "t1", personId: "duc" }, { answer: "attended" }, NOW);
    const read = calls.find((c) => c.table === "training_attendance" && c.ops.includes("select"));
    expect(read?.filters).toEqual(expect.arrayContaining([["eq", "training_id", "t1"], ["eq", "person_id", "duc"]]));
  });

  it("removes the member's review before their status leaves attended", async () => {
    const { memberSays } = await import("./attendance-word");
    script("training_attendance", { data: [row({ source: "member", reviews: [{ id: "rv1" }] })] }, { data: null });
    script("training_reviews", { data: null });
    expect(await memberSays({ trainingId: "t1", personId: "duc" }, { answer: "absent" }, NOW)).toEqual({ ok: true });
    const order = calls.filter((c) => c.ops.includes("delete") || c.ops.includes("update")).map((c) => `${c.table}:${c.ops.includes("delete") ? "delete" : "update"}`);
    expect(order).toEqual(["training_reviews:delete", "training_attendance:update"]);
  });

  it("writes nothing when the window has closed", async () => {
    const { memberSays } = await import("./attendance-word");
    script("training_attendance", { data: [row()] });
    expect(await memberSays({ trainingId: "t1", personId: "duc" }, { answer: "attended" }, new Date("2026-10-30T00:00:00Z"))).toEqual({ ok: false, error: "That one is final now." });
    expect(writes("training_attendance")).toEqual([]);
  });

  it("answers not found when the member is not on the session", async () => {
    const { memberSays } = await import("./attendance-word");
    script("training_attendance", { data: [] });
    expect(await memberSays({ trainingId: "t1", personId: "duc" }, { answer: "attended" }, NOW)).toEqual({ ok: false, error: "That training was not found." });
  });
});

describe("organiserCorrects", () => {
  it("records the organiser as the source", async () => {
    const { organiserCorrects } = await import("./attendance-word");
    script("training_attendance", { data: [row({ status: "absent" })] }, { data: null });
    expect(await organiserCorrects("hoan", { trainingId: "t1", personId: "duc" }, "attended", NOW)).toEqual({ ok: true });
    expect(writes("training_attendance")[0]?.payloads[0]).toMatchObject({ status: "attended", source: "organiser" });
  });

  it("refuses a reviewed row's move off attended without touching the review", async () => {
    const { organiserCorrects } = await import("./attendance-word");
    script("training_attendance", { data: [row({ source: "member", reviews: [{ id: "rv1" }] })] });
    expect(await organiserCorrects("hoan", { trainingId: "t1", personId: "duc" }, "absent", NOW)).toEqual({ ok: false, error: "This learner reviewed the session, so it stays attended. Ask them to change it." });
    expect([...writes("training_attendance"), ...writes("training_reviews")]).toEqual([]);
  });

  it("writes nothing on a session the caller does not run, or before it starts", async () => {
    const { organiserCorrects } = await import("./attendance-word");
    script("training_attendance", { data: [row()] });
    expect(await organiserCorrects("someone-else", { trainingId: "t1", personId: "duc" }, "absent", NOW)).toEqual({ ok: false, error: "You can correct only a session you run." });
    script("training_attendance", { data: [row()] });
    expect(await organiserCorrects("hoan", { trainingId: "t1", personId: "duc" }, "absent", new Date("2026-10-14T06:00:00Z"))).toEqual({ ok: false, error: "The session has not started." });
    expect(writes("training_attendance")).toEqual([]);
  });
});

describe("transcriptHeard", () => {
  const person = (full: string) => ({ display_name: null, preferred_name: null, full_name: full, email: null, first_name: null });

  it("fills a pending row from the speakers and keeps a member's correction", async () => {
    const { transcriptHeard } = await import("./attendance-word");
    script(
      "training_attendance",
      {
        data: [
          row({ id: "r1", person_id: "duc", status: "pending", source: "member", person: person("Nguyễn Văn Đức") }),
          row({ id: "r2", person_id: "lan", status: "skipped", source: "member", person: person("Trần Thị Lan") }),
        ],
      },
      { data: [{ id: "r1" }] },
    );
    expect(await transcriptHeard("t1", ["Duc Nguyen", "Lan Tran"], NOW)).toEqual({ ok: true, changed: 1 });
    const updates = writes("training_attendance");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.payloads[0]).toMatchObject({ status: "attended", source: "transcript" });
    // The word the reading saw, and the row's place on the register, are repeated on the write.
    expect(updates[0]?.filters).toEqual(expect.arrayContaining([["eq", "id", "r1"], ["eq", "status", "pending"], ["eq", "source", "member"], ["is", "removed_at", null]]));
  });

  it("does not count a row someone spoke on between the read and the write", async () => {
    const { transcriptHeard } = await import("./attendance-word");
    script("training_attendance", { data: [row({ id: "r1", person_id: "duc", status: "pending", source: "member", person: person("Nguyễn Văn Đức") })] }, { data: [] });
    expect(await transcriptHeard("t1", ["Duc Nguyen"], NOW)).toEqual({ ok: true, changed: 0 });
  });
});

describe("saveReview and removeReview", () => {
  it("reviews only an attended row, keyed on that row", async () => {
    const { saveReview } = await import("./attendance-word");
    script("training_attendance", { data: [row({ status: "skipped", source: "member" })] });
    expect(await saveReview({ trainingId: "t1", personId: "duc" }, { stars: 4, load: null, tags: [], note: null, signed: false }, NOW)).toEqual({ ok: false, error: "Say you went first." });
    script("training_attendance", { data: [row({ source: "member" })] });
    script("training_reviews", { data: null });
    expect(await saveReview({ trainingId: "t1", personId: "duc" }, { stars: 4, load: null, tags: [], note: null, signed: false }, NOW)).toEqual({ ok: true });
    expect(writes("training_reviews")[0]?.payloads[0]).toMatchObject({ attendance_id: "a1", stars: 4 });
  });

  it("removes a review only inside the window", async () => {
    const { removeReview } = await import("./attendance-word");
    script("training_attendance", { data: [row({ source: "member", reviews: [{ id: "rv1" }] })] });
    expect(await removeReview({ trainingId: "t1", personId: "duc" }, new Date("2026-10-30T00:00:00Z"))).toEqual({ ok: false, error: "That one is final now." });
    expect(writes("training_reviews")).toEqual([]);
  });
});
