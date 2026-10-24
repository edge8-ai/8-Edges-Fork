import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The reader's game style (QS.11): on until they turn it off, read and set by
// the reader alone. The action names no subject, so it can only ever write the
// reader's own row.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const revalidated: unknown[][] = [];
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => void revalidated.push(args) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "reader" }) }));
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));

const { gameStyleOf } = await import("./game-style");
const { setGameStyle } = await import("./display-actions");

beforeEach(() => {
  revalidated.length = 0;
  resetFake();
  asked.length = 0;
});

describe("gameStyleOf", () => {
  it("is on for a reader who never chose", async () => {
    script("ladder_display", { data: [] });
    expect(await gameStyleOf({ personId: "reader" })).toBe(true);
  });

  it("is off for a reader who turned it off", async () => {
    script("ladder_display", { data: [{ game_style: false }] });
    expect(await gameStyleOf({ personId: "reader" })).toBe(false);
  });

  it("is on when the read fails, so a cosmetic choice never breaks the page", async () => {
    script("ladder_display", { data: null, error: { message: "down" } });
    expect(await gameStyleOf({ personId: "reader" })).toBe(true);
  });

  it("reads only the reader's row", async () => {
    script("ladder_display", { data: [] });
    await gameStyleOf({ personId: "reader" });
    expect(calls[0].filters).toEqual(expect.arrayContaining([["eq", "person_id", "reader"]]));
  });
});

describe("setGameStyle", () => {
  it("asks for ladders.mine, then writes the reader's own row with their choice", async () => {
    script("ladder_display", { data: null, error: null });
    expect(await setGameStyle(false)).toEqual({ ok: true });
    expect(asked).toEqual(["ladders.mine"]);
    const write = calls.find((c) => c.table === "ladder_display");
    expect(write?.ops[0]).toBe("upsert");
    expect(write?.payloads[0]).toEqual({ person_id: "reader", game_style: false });
    // Off hides every worn border the viewer would see, the sidebar's own face included, so every team page is drawn again (LD.4).
    expect(revalidated).toEqual([["/team", "layout"]]);
  });

  it("refuses anything but on or off", async () => {
    expect(await setGameStyle("off" as unknown as boolean)).toEqual({ ok: false, error: "Say on or off." });
    expect(calls).toEqual([]);
  });

  it("says so when the save fails", async () => {
    script("ladder_display", { data: null, error: { message: "down" } });
    expect(await setGameStyle(true)).toEqual({ ok: false, error: "Your game style could not be saved. Try again." });
  });
});
