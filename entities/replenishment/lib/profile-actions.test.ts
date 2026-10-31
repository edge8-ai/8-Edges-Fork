import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { WAREHOUSE_PROFILE } from "./__fixtures__/warehouse";

// Importing and saving a profile (RP.3): the profile atom is asked first, the
// document goes through the schema before anything is written, a save names
// the version it opened so a second manager's save in between is refused, and
// every write is audited.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const guard = vi.hoisted(() => ({ asked: [] as string[], refuse: null as Error | null }));
const asked = guard.asked;
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    guard.asked.push(p);
    if (guard.refuse) throw guard.refuse;
    return { user: { email: "manager@example.com" }, personId: "person-1" };
  },
}));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/kernel/audit/audit", () => audit);

const { importProfile, saveProfile } = await import("./profile-actions");

const ID = "7c1f2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b";
const json = (value: unknown) => JSON.stringify(value);
const writes = (table: string) => calls.filter((c) => c.table === table && c.ops.some((op) => ["insert", "update"].includes(op)));

beforeEach(() => {
  resetFake();
  asked.length = 0;
  guard.refuse = null;
  vi.clearAllMocks();
});

describe("importProfile", () => {
  it("stores a valid profile file under its name and warehouse, at version 1, as the signed-in person", async () => {
    script("replenishment_profiles", { data: { id: ID } });
    const result = await importProfile({ name: "  Main floor ", warehouse: "Site 1", json: json(WAREHOUSE_PROFILE) });
    expect(result).toEqual({ ok: true, id: ID });
    expect(asked).toEqual(["replenishment.profiles"]);
    const row = writes("replenishment_profiles")[0]?.payloads[0] as Record<string, unknown>;
    expect(row).toMatchObject({ name: "Main floor", warehouse: "Site 1", saved_by: "person-1", document: WAREHOUSE_PROFILE });
    expect(row).not.toHaveProperty("version");
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "replenishment_profiles", recordId: ID, operation: "insert", actor: "manager@example.com" }));
  });

  it("refuses a file that is not JSON, and writes nothing", async () => {
    expect(await importProfile({ name: "Main floor", warehouse: "Site 1", json: "{ not json" })).toEqual({ ok: false, error: "The file is not a profile: it is not valid JSON." });
    expect(calls).toEqual([]);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("refuses a profile the schema refuses, naming the failing field, and writes nothing", async () => {
    const broken = { ...WAREHOUSE_PROFILE, zones: [{ ...WAREHOUSE_PROFILE.zones[0], pattern: "^P(" }, WAREHOUSE_PROFILE.zones[1]] };
    const result = await importProfile({ name: "Main floor", warehouse: "Site 1", json: json(broken) });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/zones\.0\.pattern: is not a valid pattern/);
    expect(calls).toEqual([]);
  });

  it("asks for a name before it reads the file", async () => {
    expect(await importProfile({ name: " ", warehouse: "Site 1", json: json(WAREHOUSE_PROFILE) })).toEqual({ ok: false, error: "Name the profile." });
    expect(asked).toEqual(["replenishment.profiles"]);
    expect(calls).toEqual([]);
  });

  it("says the store failed rather than reporting a profile that was never written", async () => {
    script("replenishment_profiles", { error: { message: "down" } });
    expect(await importProfile({ name: "Main floor", warehouse: "Site 1", json: json(WAREHOUSE_PROFILE) })).toEqual({ ok: false, error: "Could not store the profile. Try again." });
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("is refused before anything else when the guard refuses", async () => {
    const refused = new Error("NEXT_NOT_FOUND");
    guard.refuse = refused;
    await expect(importProfile({ name: "Main floor", warehouse: "Site 1", json: json(WAREHOUSE_PROFILE) })).rejects.toBe(refused);
    expect(calls).toEqual([]);
  });
});

describe("saveProfile", () => {
  it("writes the edit one version up, only over the version the editor opened", async () => {
    script("replenishment_profiles", { data: [{ version: 4 }] });
    const result = await saveProfile({ id: ID, version: 3, name: "Main floor", warehouse: "Site 1", document: WAREHOUSE_PROFILE });
    expect(result).toEqual({ ok: true, version: 4 });
    expect(asked).toEqual(["replenishment.profiles"]);
    const [update] = writes("replenishment_profiles");
    expect(update?.payloads[0]).toMatchObject({ version: 4, saved_by: "person-1", document: WAREHOUSE_PROFILE });
    expect(update?.filters).toEqual(expect.arrayContaining([["eq", "id", ID], ["eq", "version", 3], ["is", "archived_at", null]]));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ operation: "update", oldData: { version: 3 }, newData: expect.objectContaining({ version: 4 }) }));
  });

  it("refuses a save over a version someone else saved since, instead of overwriting it", async () => {
    script("replenishment_profiles", { data: [] });
    const result = await saveProfile({ id: ID, version: 3, name: "Main floor", warehouse: "Site 1", document: WAREHOUSE_PROFILE });
    expect(result).toEqual({ ok: false, error: "This profile changed since you opened it, or was archived. Reload it and make your change again." });
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("refuses a band with no move, naming the field, and writes nothing", async () => {
    const rule = WAREHOUSE_PROFILE.rules[0];
    const broken = { ...WAREHOUSE_PROFILE, rules: [{ ...rule, bands: [{ label: "EU 36-42", reorderBelow: 24 }] }] };
    const result = await saveProfile({ id: ID, version: 1, name: "Main floor", warehouse: "Site 1", document: broken });
    expect(!result.ok && result.error).toMatch(/rules\.0\.bands\.0\.move/);
    expect(calls).toEqual([]);
  });

  it("refuses a broken pattern, naming its field, and writes nothing (RP.6)", async () => {
    const broken = { ...WAREHOUSE_PROFILE, zones: [WAREHOUSE_PROFILE.zones[0], { ...WAREHOUSE_PROFILE.zones[1], pattern: "^U(?<aisle>\\d{2}" }] };
    const result = await saveProfile({ id: ID, version: 2, name: "Main floor", warehouse: "Site 1", document: broken });
    expect(!result.ok && result.error).toMatch(/zones\.1\.pattern: is not a valid pattern/);
    expect(calls).toEqual([]);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("refuses a malformed id before it touches the database", async () => {
    expect(await saveProfile({ id: "nope", version: 1, name: "Main floor", warehouse: "Site 1", document: WAREHOUSE_PROFILE })).toEqual({ ok: false, error: "Profile not found." });
    expect(calls).toEqual([]);
  });
});
