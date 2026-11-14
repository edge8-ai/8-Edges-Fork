import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TR.6: outcomes. The record is the member's own: they write it, or accept a
// suggestion, and every write names them. A credit is refused unless they went
// to the training or are on the plan, which the tables' keys cannot see
// (db-review on #2467). An organiser's suggestion waits for the member's word,
// and a certificate is offered once per track.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/config/dates", async (orig) => ({ ...(await orig<typeof import("@/kernel/config/dates")>()), saigonToday: () => "2026-11-02" }));
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const T1 = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const O1 = "33333333-3333-4333-8333-333333333333";
const HELD = "2026-10-27T07:00:00Z";
const input = (over: Partial<{ happenedOn: string; description: string; credits: { kind: "training" | "plan"; id: string }[] }> = {}) => ({ happenedOn: "2026-10-29", description: "Gave the client demo in English", credits: [], ...over });
const writes = (table: string, verb: string) => calls.filter((c) => c.table === table && c.ops[0] === verb);
const filtersOf = (c: { filters: [string, ...unknown[]][] }) => c.filters.map((f) => f.join(":"));

describe("recording an outcome", () => {
  it("puts the member's own words on their record, accepted, with what they credited", async () => {
    const { recordOutcome } = await import("./outcomes");
    script("training_attendance", { data: [{ training_id: T1, training: { plan_id: null } }] });
    script("training_plan_members", { data: [{ plan_id: P1, plan: { open_to_learners: true } }] });
    script("training_outcomes", { data: { id: O1 } });
    script("training_outcome_credits", { data: null }, { data: null });
    expect(await recordOutcome("duc", input({ credits: [{ kind: "training", id: T1 }, { kind: "plan", id: P1 }] }))).toEqual({ ok: true });
    expect(writes("training_outcomes", "insert")[0].payloads[0]).toEqual({ person_id: "duc", happened_on: "2026-10-29", description: "Gave the client demo in English", source: "member", status: "accepted" });
    expect(writes("training_outcome_credits", "insert")[0].payloads[0]).toEqual([
      { outcome_id: O1, person_id: "duc", training_id: T1, plan_id: null },
      { outcome_id: O1, person_id: "duc", training_id: null, plan_id: P1 },
    ]);
  });

  it("asks only for trainings the member went to and is still on", async () => {
    const { recordOutcome } = await import("./outcomes");
    script("training_attendance", { data: [] });
    expect(await recordOutcome("duc", input({ credits: [{ kind: "training", id: T1 }] }))).toEqual({ ok: false, error: "You can credit only trainings you went to." });
    const read = calls.find((c) => c.table === "training_attendance")!;
    expect(filtersOf(read)).toEqual(expect.arrayContaining(["eq:person_id:duc", "eq:status:attended", "is:removed_at:"]));
    expect(writes("training_outcomes", "insert")).toHaveLength(0);
  });

  it("refuses a plan closed to its learners, which tells them nothing", async () => {
    const { recordOutcome } = await import("./outcomes");
    script("training_plan_members", { data: [{ plan_id: P1, plan: { open_to_learners: false } }] });
    expect(await recordOutcome("duc", input({ credits: [{ kind: "plan", id: P1 }] }))).toEqual({ ok: false, error: "You can credit only plans you are on." });
  });

  it("refuses a session on a plan since closed to its learners, as My Training hides it", async () => {
    const { recordOutcome } = await import("./outcomes");
    script("training_attendance", { data: [{ training_id: T1, training: { plan_id: P1, plan_flag: { open_to_learners: false } } }] });
    expect(await recordOutcome("duc", input({ credits: [{ kind: "training", id: T1 }] }))).toEqual({ ok: false, error: "You can credit only trainings you went to." });
    expect(writes("training_outcomes", "insert")).toHaveLength(0);
  });

  it("asks only for plans the member is still on and that are not archived, as My Training shows them", async () => {
    const { recordOutcome } = await import("./outcomes");
    script("training_plan_members", { data: [] });
    expect(await recordOutcome("duc", input({ credits: [{ kind: "plan", id: P1 }] }))).toEqual({ ok: false, error: "You can credit only plans you are on." });
    expect(filtersOf(calls.find((c) => c.table === "training_plan_members")!)).toEqual(expect.arrayContaining(["eq:person_id:duc", "is:removed_at:", "is:plan.archived_at:"]));
  });

  it("refuses a day that has not come yet", async () => {
    const { recordOutcome } = await import("./outcomes");
    expect((await recordOutcome("duc", input({ happenedOn: "2026-11-03" }))).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("takes the outcome back when what helped could not be saved, so no half outcome is left", async () => {
    const { recordOutcome } = await import("./outcomes");
    script("training_attendance", { data: [{ training_id: T1, training: { plan_id: null } }] });
    script("training_outcomes", { data: { id: O1 } }, { data: null });
    script("training_outcome_credits", { data: null }, { error: { message: "down" } });
    expect((await recordOutcome("duc", input({ credits: [{ kind: "training", id: T1 }] }))).ok).toBe(false);
    const undo = writes("training_outcomes", "delete")[0];
    expect(filtersOf(undo)).toEqual(expect.arrayContaining([`eq:id:${O1}`, "eq:person_id:duc"]));
  });
});

describe("the member's own record", () => {
  it("edits and removes only their own accepted outcomes", async () => {
    const { editOutcome, removeOutcome } = await import("./outcomes");
    script("training_outcomes", { data: [{ id: O1 }] }, { data: [] });
    script("training_outcome_credits", { data: null });
    expect(await editOutcome("duc", O1, input())).toEqual({ ok: true });
    expect(filtersOf(writes("training_outcomes", "update")[0])).toEqual(expect.arrayContaining([`eq:id:${O1}`, "eq:person_id:duc", "eq:status:accepted"]));
    expect(await removeOutcome("duc", O1)).toEqual({ ok: false, error: "That outcome was not found." });
    expect(filtersOf(writes("training_outcomes", "delete")[0])).toEqual(expect.arrayContaining([`eq:id:${O1}`, "eq:person_id:duc", "eq:status:accepted"]));
  });

  it("does not hand back a credit on a session whose plan has since closed to its learners", async () => {
    const { myOutcomes } = await import("./outcomes");
    script("training_outcomes", { data: [{ id: O1, happened_on: "2026-10-29", description: "Demo", source: "member", status: "accepted", certification_track: null, suggester: null }] });
    script("training_outcome_credits", { data: [{ outcome_id: O1, training_id: T1, plan_id: null }, { outcome_id: O1, training_id: "t-open", plan_id: null }] });
    script("trainings", { data: [{ id: T1, plan_id: P1, plan_flag: { open_to_learners: false } }, { id: "t-open", plan_id: null }] });
    const { accepted } = await myOutcomes("duc");
    expect(accepted[0].credits).toEqual([{ kind: "training", id: "t-open" }]);
  });

  it("reads accepted outcomes and waiting suggestions apart, each with its credits", async () => {
    const { myOutcomes } = await import("./outcomes");
    script("training_outcomes", {
      data: [
        { id: O1, happened_on: "2026-10-29", description: "Demo", source: "member", status: "accepted", certification_track: null, suggester: null },
        { id: "o2", happened_on: "2026-10-28", description: "Earned the AI Officer certificate", source: "certification", status: "suggested", certification_track: "ai_officer", suggester: null },
      ],
    });
    script("training_outcome_credits", { data: [{ outcome_id: O1, training_id: T1, plan_id: null }, { outcome_id: O1, training_id: null, plan_id: P1 }, { outcome_id: O1, training_id: null, plan_id: "p-open" }] });
    // P1 has since been closed to its learners, so its credit, id and all, is not handed back.
    script("training_plans", { data: [{ id: P1, open_to_learners: false }, { id: "p-open", open_to_learners: true }] });
    script("trainings", { data: [{ id: T1, plan_id: null }] });
    const { accepted, waiting } = await myOutcomes("duc");
    expect(accepted.map((o) => [o.id, o.credits])).toEqual([[O1, [{ kind: "training", id: T1 }, { kind: "plan", id: "p-open" }]]]);
    expect(waiting.map((o) => [o.id, o.source, o.credits])).toEqual([["o2", "certification", []]]);
    expect(filtersOf(calls[0])).toEqual(expect.arrayContaining(["eq:person_id:duc"]));
  });
});

describe("a suggestion", () => {
  it("becomes the member's own, in their words, only while it waits", async () => {
    const { acceptSuggestion, dismissSuggestion } = await import("./outcomes");
    script("training_outcomes", { data: [{ id: O1 }] }, { data: [] });
    script("training_outcome_credits", { data: null });
    expect(await acceptSuggestion("duc", O1, input({ description: "Led the discussion" }))).toEqual({ ok: true });
    const accept = writes("training_outcomes", "update")[0];
    expect(accept.payloads[0]).toMatchObject({ status: "accepted", description: "Led the discussion" });
    expect(filtersOf(accept)).toEqual(expect.arrayContaining(["eq:person_id:duc", "eq:status:suggested"]));
    expect(await dismissSuggestion("duc", O1)).toEqual({ ok: false, error: "That suggestion was already answered." });
  });

  it("is kept when dismissed, so it is never offered again", async () => {
    const { dismissSuggestion } = await import("./outcomes");
    script("training_outcomes", { data: [{ id: O1 }] });
    expect(await dismissSuggestion("duc", O1)).toEqual({ ok: true });
    expect(writes("training_outcomes", "update")[0].payloads[0]).toMatchObject({ status: "dismissed" });
    expect(writes("training_outcomes", "delete")).toHaveLength(0);
  });
});

describe("an organiser's suggestion", () => {
  const suggest = { happenedOn: "2026-10-27", description: "Led the class discussion in English", creditThis: true };

  it("waits on the member's My Training, credited to the session they went to", async () => {
    const { suggestOutcome } = await import("./outcomes");
    script("trainings", { data: [{ id: T1, starts_at: HELD, plan: { open_to_learners: true } }] });
    script("training_attendance", { data: [{ status: "attended" }] });
    script("training_outcomes", { data: { id: O1 } });
    script("training_outcome_credits", { data: null });
    expect(await suggestOutcome("hoan", T1, "duc", suggest)).toEqual({ ok: true });
    expect(writes("training_outcomes", "insert")[0].payloads[0]).toEqual({ person_id: "duc", happened_on: "2026-10-27", description: suggest.description, source: "organiser", status: "suggested", suggested_by: "hoan" });
    expect(writes("training_outcome_credits", "insert")[0].payloads[0]).toEqual({ outcome_id: O1, person_id: "duc", training_id: T1, plan_id: null });
    expect(filtersOf(calls.find((c) => c.table === "trainings")!)).toEqual(expect.arrayContaining(["eq:organiser_id:hoan"]));
  });

  it("waits until the session has started", async () => {
    const { suggestOutcome } = await import("./outcomes");
    script("trainings", { data: [{ id: T1, starts_at: "2099-01-01T07:00:00Z", plan: null }] });
    expect(await suggestOutcome("hoan", T1, "duc", suggest)).toEqual({ ok: false, error: "Suggest an outcome once the session has started." });
    expect(writes("training_outcomes", "insert")).toHaveLength(0);
  });

  it("credits nothing for a session the member did not go to", async () => {
    const { suggestOutcome } = await import("./outcomes");
    script("trainings", { data: [{ id: T1, starts_at: HELD, plan: null }] });
    script("training_attendance", { data: [{ status: "absent" }] });
    script("training_outcomes", { data: { id: O1 } });
    expect(await suggestOutcome("hoan", T1, "duc", suggest)).toEqual({ ok: true });
    expect(writes("training_outcome_credits", "insert")).toHaveLength(0);
  });

  it("is refused for someone else's training, a plan closed to learners, someone not on it, or the organiser themselves", async () => {
    const { suggestOutcome } = await import("./outcomes");
    expect((await suggestOutcome("hoan", T1, "hoan", suggest)).ok).toBe(false);
    script("trainings", { data: [] }, { data: [{ id: T1, starts_at: HELD, plan: { open_to_learners: false } }] }, { data: [{ id: T1, starts_at: HELD, plan: null }] });
    script("training_attendance", { data: [] });
    expect(await suggestOutcome("hoan", T1, "duc", suggest)).toEqual({ ok: false, error: "That training was not found." });
    expect(await suggestOutcome("hoan", T1, "duc", suggest)).toEqual({ ok: false, error: "This plan is closed to its learners. Open it to them before suggesting an outcome." });
    expect(await suggestOutcome("hoan", T1, "duc", suggest)).toEqual({ ok: false, error: "That person is not on this training." });
    expect(writes("training_outcomes", "insert")).toHaveLength(0);
  });
});

describe("a certificate", () => {
  it("is offered once per track: a second offer, or one already dismissed, is left alone", async () => {
    const { offerCertifications } = await import("./outcomes");
    script("training_outcomes", { data: null });
    expect(await offerCertifications([{ personId: "duc", track: "ai_officer", label: "AI Officer", awardedAt: "2026-10-27T20:00:00Z" }])).toEqual({ ok: true });
    const offer = writes("training_outcomes", "upsert")[0];
    // 20:00 UTC on the 27th is the 28th in Vietnam.
    expect(offer.payloads[0]).toEqual([{ person_id: "duc", happened_on: "2026-10-28", description: "Earned the AI Officer certificate", source: "certification", status: "suggested", certification_track: "ai_officer" }]);
    expect(offer.options[0]).toEqual({ onConflict: "person_id,certification_track", ignoreDuplicates: true });
  });

  it("writes nothing when there is nothing to offer", async () => {
    const { offerCertifications } = await import("./outcomes");
    expect(await offerCertifications([])).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });
});
