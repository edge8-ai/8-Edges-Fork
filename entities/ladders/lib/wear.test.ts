import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// setWear (LD.4; spec "Wearing"): the reader wears or hides their own tier on
// one ladder, and nobody else's. It asks for ladders.mine first, writes only
// the reader's own ladder_display row, and has no parameter that could name
// anyone else. Both switches start off.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const revalidated: unknown[][] = [];
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => void revalidated.push(args) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "reader" }) }));
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));

const { setWear } = await import("./display-actions");
const { choicesOf, NO_CHOICES } = await import("./standing");

beforeEach(() => {
  resetFake();
  asked.length = 0;
  revalidated.length = 0;
});

describe("setWear", () => {
  it("asks for ladders.mine, then wears Learn & Share on the reader's own row", async () => {
    script("ladder_display", { data: null, error: null });
    expect(await setWear("learn_share", true)).toEqual({ ok: true });
    expect(asked).toEqual(["ladders.mine"]);
    const write = calls.find((c) => c.table === "ladder_display");
    expect(write?.ops[0]).toBe("upsert");
    expect(write?.payloads[0]).toEqual({ person_id: "reader", wear_learn_share: true });
    // Every team page draws the reader's face in its sidebar.
    expect(revalidated).toEqual([["/team", "layout"]]);
  });

  it("hides Builder, touching no other choice", async () => {
    script("ladder_display", { data: null, error: null });
    expect(await setWear("builder", false)).toEqual({ ok: true });
    expect(calls.find((c) => c.table === "ladder_display")?.payloads[0]).toEqual({ person_id: "reader", wear_builder: false });
  });

  it("refuses to write for anyone but the reader, whatever it is handed", async () => {
    script("ladder_display", { data: null, error: null });
    const sneaky = setWear as unknown as (...args: unknown[]) => ReturnType<typeof setWear>;
    expect(await sneaky("learn_share", true, "someone-else", { personId: "someone-else" })).toEqual({ ok: true });
    const writes = calls.filter((c) => c.table === "ladder_display");
    expect(writes).toHaveLength(1);
    expect(writes[0].payloads[0]).toEqual({ person_id: "reader", wear_learn_share: true });
    expect(JSON.stringify(calls)).not.toContain("someone-else");
  });

  it("refuses anything but a ladder and on or off, and writes nothing", async () => {
    const loose = setWear as unknown as (...args: unknown[]) => ReturnType<typeof setWear>;
    // The camel-case spelling LD.4 shipped with is no ladder now: points.ts's Ladder is the one spelling.
    expect(await loose("learnShare", true)).toEqual({ ok: false, error: "Say which ladder, and on or off." });
    expect(await loose("builder", "yes")).toEqual({ ok: false, error: "Say which ladder, and on or off." });
    expect(calls).toEqual([]);
  });

  it("says so when the save fails", async () => {
    script("ladder_display", { data: null, error: { message: "down" } });
    expect(await setWear("learn_share", true)).toEqual({ ok: false, error: "Your choice could not be saved. Try again." });
    expect(revalidated).toEqual([]);
  });
});

describe("the default", () => {
  it("wears neither ladder for a person who never chose", () => {
    expect(choicesOf(undefined)).toMatchObject({ wearLearnShare: false, wearBuilder: false });
    expect(NO_CHOICES).toMatchObject({ wearLearnShare: false, wearBuilder: false });
  });
});
