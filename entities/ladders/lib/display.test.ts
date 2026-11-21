import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// setDisplay (LD.6; spec "The profile page"): the reader dresses their own
// profile, and nobody else's. It asks for ladders.mine first, writes only the
// reader's own ladder_display row and only the fields it was given, takes
// nothing the profile does not offer, and lets a Title or the display case name
// only badges the reader found. Every choice starts hidden.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const revalidated: unknown[][] = [];
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => void revalidated.push(args) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "reader" }) }));
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));

const { setDisplay } = await import("./display-actions");
const { choicesOf, NO_CHOICES } = await import("./standing");

const written = () => calls.filter((c) => c.table === "ladder_display").map((c) => c.payloads[0]);

beforeEach(() => {
  resetFake();
  asked.length = 0;
  revalidated.length = 0;
});

describe("setDisplay", () => {
  it("asks for ladders.mine, then picks the reader's banner and nothing else", async () => {
    script("ladder_display", { data: null, error: null });
    expect(await setDisplay({ banner: "dragon" })).toEqual({ ok: true });
    expect(asked).toEqual(["ladders.mine"]);
    expect(calls.find((c) => c.table === "ladder_display")?.ops[0]).toBe("upsert");
    expect(written()).toEqual([{ person_id: "reader", banner: "dragon" }]);
    expect(revalidated).toEqual([["/team/profile"]]);
  });

  it("switches stats on, in the order given, without touching the banner or the case", async () => {
    script("ladder_display", { data: null, error: null });
    expect(await setDisplay({ shownStats: ["cards", "hits"] })).toEqual({ ok: true });
    expect(written()).toEqual([{ person_id: "reader", shown_stats: ["cards", "hits"] }]);
    // No badge was named, so the reader's badges are not read.
    expect(calls.some((c) => c.table === "ladder_unlocks")).toBe(false);
  });

  it("switches every stat off, and takes No title, with no badge read", async () => {
    script("ladder_display", { data: null, error: null });
    expect(await setDisplay({ shownStats: [], titleBadge: null })).toEqual({ ok: true });
    expect(written()).toEqual([{ person_id: "reader", shown_stats: [], title_badge: null }]);
    expect(calls.some((c) => c.table === "ladder_unlocks")).toBe(false);
  });

  it("puts found badges in the display case and wears one as a Title", async () => {
    script("ladder_unlocks", { data: [{ key: "first-hit" }, { key: "spark-struck" }], error: null });
    script("ladder_display", { data: null, error: null });
    expect(await setDisplay({ displayCase: ["spark-struck", "first-hit"], titleBadge: "first-hit" })).toEqual({ ok: true });
    const read = calls.find((c) => c.table === "ladder_unlocks");
    expect(read?.filters).toEqual(expect.arrayContaining([["eq", "person_id", "reader"], ["eq", "kind", "badge"]]));
    expect(written()).toEqual([{ person_id: "reader", title_badge: "first-hit", display_case: ["spark-struck", "first-hit"] }]);
  });

  it("refuses a badge the reader has not found, and writes nothing", async () => {
    script("ladder_unlocks", { data: [{ key: "first-hit" }], error: null });
    expect(await setDisplay({ displayCase: ["first-hit", "hydra-slayer"] })).toEqual({ ok: false, error: "Only a badge you found can go there." });
    expect(written()).toEqual([]);
  });

  it("says so when the reader's badges cannot be read, and writes nothing", async () => {
    script("ladder_unlocks", { data: null, error: { message: "down" } });
    expect(await setDisplay({ titleBadge: "first-hit" })).toEqual({ ok: false, error: "Your badges could not be read just now. Try again." });
    expect(written()).toEqual([]);
  });

  it("refuses anything the profile does not offer, and writes nothing", async () => {
    const loose = setDisplay as unknown as (x: unknown) => ReturnType<typeof setDisplay>;
    const refused = { ok: false, error: "That choice is not one the profile offers." };
    expect(await loose({ banner: "volcano" })).toEqual(refused);
    expect(await loose({ shownStats: ["points"] })).toEqual(refused);
    expect(await loose({ shownStats: ["hits", "hits"] })).toEqual(refused);
    expect(await loose({ displayCase: ["a", "b", "c", "d", "e", "f"] })).toEqual(refused);
    expect(await loose({ displayCase: ["a", "a"] })).toEqual(refused);
    expect(await loose({ wearLearnShare: true })).toEqual(refused);
    expect(await loose({})).toEqual(refused);
    expect(await loose(null)).toEqual(refused);
    expect(calls).toEqual([]);
  });

  it("refuses to write for anyone but the reader, whatever it is handed", async () => {
    script("ladder_display", { data: null, error: null });
    const sneaky = setDisplay as unknown as (...args: unknown[]) => ReturnType<typeof setDisplay>;
    expect(await sneaky({ banner: "hydra" }, "someone-else", { personId: "someone-else" })).toEqual({ ok: true });
    expect(written()).toEqual([{ person_id: "reader", banner: "hydra" }]);
    expect(JSON.stringify(calls)).not.toContain("someone-else");
    // A person_id inside the change is not a field the profile offers.
    expect(await sneaky({ banner: "hydra", person_id: "someone-else" })).toEqual({ ok: false, error: "That choice is not one the profile offers." });
  });

  it("says so when the save fails", async () => {
    script("ladder_display", { data: null, error: { message: "down" } });
    expect(await setDisplay({ banner: "meadow" })).toEqual({ ok: false, error: "Your profile could not be saved. Try again." });
    expect(revalidated).toEqual([]);
  });
});

describe("the default", () => {
  it("shows nothing for a person who never chose: the meadow, no Title, no stat, an empty case", () => {
    expect(choicesOf(undefined)).toMatchObject({ banner: "meadow", titleBadge: null, shownStats: [], displayCase: [] });
    expect(NO_CHOICES).toMatchObject({ banner: "meadow", titleBadge: null, shownStats: [], displayCase: [] });
  });
});
