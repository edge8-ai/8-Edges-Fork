import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The guard is the registry's: the actions ask for the permission their file declares.
const requirePermission = vi.fn(async (_permission: string) => ({ user: { email: "admin@example.test" } }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: (p: string) => requirePermission(p) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
const recordAudit = vi.fn();
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: (input: unknown) => recordAudit(input) }));

import {
  archiveCapacityCommitment,
  archiveCapacityRole,
  createCapacityCommitment,
  createCapacityRole,
  updateCapacityCommitment,
  updateCapacityRole,
} from "./capacity-actions";

const ROLE = "7a1f6c52-2d4b-4c8e-9f3a-1b2c3d4e5f60";
const COMPANY = "0b9e8d7c-6a5b-4c3d-8e2f-1a0b9c8d7e6f";
const COMMITMENT = "5c4b3a29-1807-4f6e-8d5c-4b3a29180706";

const role = { name: " Senior engineer ", positionId: "", hoursPerWeek: 80, effectiveFrom: "2026-09-28" };
const commitment = {
  roleId: ROLE,
  companyId: COMPANY,
  hoursPerWeek: 20,
  startsOn: "2026-10-05",
  endsOn: "",
  source: "deal" as const,
  note: "  Phase one  ",
};

const writes = (table: string) => calls.filter((c) => c.table === table && ["insert", "update"].includes(c.ops[0] ?? ""));

beforeEach(() => {
  resetFake();
  recordAudit.mockClear();
  requirePermission.mockClear();
});

describe("capacity role actions", () => {
  it("guard with requirePermission before touching anything", async () => {
    requirePermission.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(createCapacityRole(role)).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePermission).toHaveBeenCalledWith("org.operations");
    expect(calls).toHaveLength(0);
  });

  it("creates a role from what the form sends: trimmed name, blank position as null, and audits it", async () => {
    script("capacity_roles", { data: { id: ROLE } });
    expect(await createCapacityRole(role)).toEqual({ ok: true });
    expect(writes("capacity_roles")[0].payloads[0]).toEqual({
      name: "Senior engineer",
      position_id: null,
      hours_per_week: 80,
      effective_from: "2026-09-28",
    });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "capacity_roles", recordId: ROLE, operation: "insert" }));
  });

  it("refuses a blank name and an empty hours box without writing", async () => {
    expect(await createCapacityRole({ ...role, name: "  " })).toEqual({ ok: false, error: "name: Give the role a name." });
    expect(await createCapacityRole({ ...role, hoursPerWeek: Number.NaN })).toEqual({
      ok: false,
      error: "hoursPerWeek: Give the hours per week as a number.",
    });
    expect(await createCapacityRole({ ...role, hoursPerWeek: -1 })).toEqual({
      ok: false,
      error: "hoursPerWeek: Hours per week can't be negative.",
    });
    expect(calls).toHaveLength(0);
  });

  it("says so in words when the name is already taken", async () => {
    script("capacity_roles", { error: { message: "duplicate key value", code: "23505" } as { message: string } });
    expect(await createCapacityRole(role)).toEqual({ ok: false, error: "A role with that name already exists." });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("updates a role by id and refuses an id that is not one", async () => {
    script("capacity_roles", {});
    expect(await updateCapacityRole(ROLE, { ...role, hoursPerWeek: 60 })).toEqual({ ok: true });
    expect(writes("capacity_roles")[0].filters).toContainEqual(["eq", "id", ROLE]);
    expect(await updateCapacityRole("nope", role)).toEqual({ ok: false, error: "Not a valid role." });
  });

  it("archives rather than deletes", async () => {
    script("capacity_roles", {});
    expect(await archiveCapacityRole(ROLE)).toEqual({ ok: true });
    const [write] = writes("capacity_roles");
    expect(write.ops[0]).toBe("update");
    expect(write.payloads[0]).toHaveProperty("archived_at");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ operation: "archive" }));
  });
});

describe("capacity commitment actions", () => {
  it("guard with requirePermission before touching anything", async () => {
    requirePermission.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(archiveCapacityCommitment(COMMITMENT)).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePermission).toHaveBeenCalledWith("org.operations");
    expect(calls).toHaveLength(0);
  });

  it("creates a commitment: a cleared end date is open-ended and the note is trimmed", async () => {
    script("capacity_commitments", { data: { id: COMMITMENT } });
    expect(await createCapacityCommitment(commitment)).toEqual({ ok: true });
    expect(writes("capacity_commitments")[0].payloads[0]).toEqual({
      role_id: ROLE,
      company_id: COMPANY,
      hours_per_week: 20,
      starts_on: "2026-10-05",
      ends_on: null,
      source: "deal",
      note: "Phase one",
    });
  });

  it("treats the Internal option, an empty company, as internal work", async () => {
    script("capacity_commitments", { data: { id: COMMITMENT } });
    await createCapacityCommitment({ ...commitment, companyId: "" });
    expect(writes("capacity_commitments")[0].payloads[0]).toMatchObject({ company_id: null });
  });

  it("refuses zero hours, an end before the start and an unknown source without writing", async () => {
    expect(await createCapacityCommitment({ ...commitment, hoursPerWeek: 0 })).toEqual({
      ok: false,
      error: "hoursPerWeek: Commit more than zero hours a week.",
    });
    expect(await createCapacityCommitment({ ...commitment, endsOn: "2026-10-04" })).toEqual({
      ok: false,
      error: "endsOn: The end date can't be before the start.",
    });
    expect(
      await createCapacityCommitment({ ...commitment, source: "person" as unknown as "deal" }),
    ).toEqual({ ok: false, error: "source: Pick where the commitment came from." });
    expect(calls).toHaveLength(0);
  });

  it("updates and archives by id", async () => {
    script("capacity_commitments", {}, {});
    expect(await updateCapacityCommitment(COMMITMENT, { ...commitment, endsOn: "2026-12-31" })).toEqual({ ok: true });
    expect(await archiveCapacityCommitment(COMMITMENT)).toEqual({ ok: true });
    const [update, archive] = writes("capacity_commitments");
    expect(update.payloads[0]).toMatchObject({ ends_on: "2026-12-31" });
    expect(archive.payloads[0]).toHaveProperty("archived_at");
    expect(await archiveCapacityCommitment("nope")).toEqual({ ok: false, error: "Not a valid commitment." });
  });
});
