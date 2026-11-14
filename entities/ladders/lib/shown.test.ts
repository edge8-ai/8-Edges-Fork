import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// markShown (LD.5; spec "The door"): the reader has seen a rank-up, so it stops
// waiting. It asks for ladders.mine first, writes shown_at and nothing else, on
// the reader's own unlock and only while it still waits, and has no parameter
// that could name anyone else: an id of someone else's unlock, or an extra
// argument naming them, leaves their row untouched.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "reader" }) }));
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
const revalidated: unknown[][] = [];
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => void revalidated.push(args) }));

const { markShown } = await import("./shown-actions");

const MINE = "6f1c1d1e-0000-4000-8000-000000000001";
const THEIRS = "6f1c1d1e-0000-4000-8000-000000000002";

beforeEach(() => {
  resetFake();
  asked.length = 0;
  revalidated.length = 0;
});

describe("markShown", () => {
  it("asks for ladders.mine, then stamps shown_at on the reader's own waiting unlock", async () => {
    script("ladder_unlocks", { data: null, error: null });
    expect(await markShown([MINE])).toEqual({ ok: true });
    expect(asked).toEqual(["ladders.mine"]);
    const write = calls.filter((c) => c.table === "ladder_unlocks");
    expect(write).toHaveLength(1);
    expect(write[0].ops[0]).toBe("update");
    // shown_at alone: the one column the table lets anyone update.
    expect(Object.keys(write[0].payloads[0] as object)).toEqual(["shown_at"]);
    expect(Date.parse((write[0].payloads[0] as { shown_at: string }).shown_at)).not.toBeNaN();
    expect(write[0].filters).toEqual([
      ["in", "id", [MINE]],
      ["eq", "person_id", "reader"],
      ["is", "shown_at", null],
    ]);
    // The screen has closed already; nothing else on the page changes.
    expect(revalidated).toEqual([]);
  });

  it("leaves another person's row untouched whatever it is handed", async () => {
    script("ladder_unlocks", { data: null, error: null });
    const sneaky = markShown as unknown as (...args: unknown[]) => ReturnType<typeof markShown>;
    expect(await sneaky([THEIRS], "someone-else", { personId: "someone-else" })).toEqual({ ok: true });
    const writes = calls.filter((c) => c.table === "ladder_unlocks");
    expect(writes).toHaveLength(1);
    // Their unlock id matches no row of the reader's: the write is pinned to the reader.
    expect(writes[0].filters).toContainEqual(["eq", "person_id", "reader"]);
    expect(writes[0].filters.filter((f) => f[1] === "person_id")).toEqual([["eq", "person_id", "reader"]]);
    expect(JSON.stringify(calls)).not.toContain("someone-else");
  });

  it("refuses an id that is not an unlock's, and writes nothing", async () => {
    for (const bad of ["", "gold", "1; drop table", 42 as unknown as string]) {
      const r = await markShown([bad] as unknown as string[]);
      expect(r.ok).toBe(false);
    }
    expect(calls.filter((c) => c.table === "ladder_unlocks")).toEqual([]);
  });

  it("says so when the write fails", async () => {
    script("ladder_unlocks", { data: null, error: { message: "boom" } });
    expect(await markShown([MINE])).toEqual({ ok: false, error: "It could not be saved as seen. It will show again next time." });
  });
});
