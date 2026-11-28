import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

// The preview's source (RP.6): the profile atom is asked first, a profile with
// no run yet is a clear empty answer, and a failed read or download is a
// failure, never an empty preview. The database and the bucket are the fake;
// the reader is the real one, over a small CSV.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const guard = vi.hoisted(() => ({ asked: [] as string[], refuse: null as Error | null }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    guard.asked.push(p);
    if (guard.refuse) throw guard.refuse;
    return { user: { email: "manager@example.com" }, personId: "person-1" };
  },
}));

const { readLastExport } = await import("./preview-actions");

const PROFILE_ID = "7c1f2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b";
const RUN_ID = "0b7c6d5e-4f3a-4b2c-9d1e-0f1a2b3c4d5e";
const runRow = { id: RUN_ID, file_name: "stock.csv", uploaded_at: "2026-10-29T01:00:00Z", storage_path: `runs/${RUN_ID}/stock.csv` };
const CSV = "Item,Description,Bin,On hand\nKES-38,Kestrel Arlo Black 38R,P03-02,23\n";

beforeEach(() => {
  resetFake();
  guard.asked.length = 0;
  guard.refuse = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readLastExport", () => {
  it("answers the newest run's export as rows, header first, read from the private bucket", async () => {
    script("replenishment_runs", { data: runRow });
    scriptStorage("download", { data: new Blob([CSV]) });
    const result = await readLastExport(PROFILE_ID);
    expect(guard.asked).toEqual(["replenishment.profiles"]);
    expect(result).toEqual({
      ok: true,
      lastExport: {
        runId: RUN_ID,
        fileName: "stock.csv",
        uploadedOn: "Thursday 29 Oct",
        rows: [
          ["Item", "Description", "Bin", "On hand"],
          ["KES-38", "Kestrel Arlo Black 38R", "P03-02", "23"],
        ],
      },
    });
    expect(calls[0]?.filters).toEqual(expect.arrayContaining([["eq", "profile_id", PROFILE_ID]]));
    expect(storageCalls).toEqual([expect.objectContaining({ bucket: "replenishment-exports", op: "download", args: [runRow.storage_path] })]);
  });

  it("says plainly that a profile with no run yet has nothing to preview against", async () => {
    script("replenishment_runs", { data: null });
    expect(await readLastExport(PROFILE_ID)).toEqual({ ok: true, lastExport: null });
    expect(storageCalls).toEqual([]);
  });

  it("is a failure, not an empty preview, when the run cannot be read", async () => {
    script("replenishment_runs", { error: { message: "down" } });
    const result = await readLastExport(PROFILE_ID);
    expect(result.ok).toBe(false);
    expect(storageCalls).toEqual([]);
  });

  it("is a failure when the kept export cannot be downloaded", async () => {
    script("replenishment_runs", { data: runRow });
    scriptStorage("download", { error: { message: "Object not found" } });
    const result = await readLastExport(PROFILE_ID);
    expect(result.ok).toBe(false);
  });

  it("asks for the atom before anything else, and is refused with it", async () => {
    const refused = new Error("NEXT_NOT_FOUND");
    guard.refuse = refused;
    await expect(readLastExport(PROFILE_ID)).rejects.toBe(refused);
    expect(calls).toEqual([]);
  });

  it("refuses a malformed id before it reads anything", async () => {
    expect(await readLastExport("nope")).toEqual({ ok: false, error: "Profile not found." });
    expect(calls).toEqual([]);
  });
});
