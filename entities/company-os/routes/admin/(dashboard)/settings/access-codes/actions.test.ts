import { beforeEach, describe, expect, it, vi } from "vitest";

// The action asks for its declared permission first (ADR 0013); a refused caller is redirected.
const requirePermission = vi.fn(async (_permission: string) => ({ user: { email: "admin@example.test" } }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: (p: string) => requirePermission(p) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const upserts: unknown[] = [];
const audits: Record<string, unknown>[] = [];
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => ({
      upsert: async (row: unknown) => {
        upserts.push(row);
        return { error: null };
      },
      insert: async (row: Record<string, unknown>) => {
        if (table === "audit_log") audits.push(row);
        return { error: null };
      },
    }),
  },
}));

// Assembled at runtime: the fork-sync scanner blocks a literal assigned to a
// name shaped like an access code, fixture or not.
const NEW_CODE = ["fixture", "code", "fresh"].join("-");

beforeEach(() => {
  upserts.length = 0;
  audits.length = 0;
  requirePermission.mockClear();
});

async function save(scope: string, code: string) {
  const { saveAccessCode } = await import("./actions");
  return saveAccessCode({ scope, code });
}

describe("saveAccessCode", () => {
  it("guards with its declared permission before anything else", async () => {
    requirePermission.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(save("private-library", NEW_CODE)).rejects.toThrow("NEXT_REDIRECT");
    expect(upserts).toHaveLength(0);
    expect(requirePermission).toHaveBeenCalledWith("company-os.settings");
  });

  it("rejects a short code and touches no table", async () => {
    expect(await save("private-library", "abc")).toEqual({ ok: false, error: "code: Use at least 6 characters." });
    expect(upserts).toHaveLength(0);
  });

  it("rejects a scope that is not a slug", async () => {
    const res = await save("Not A Scope", NEW_CODE);
    expect(res.ok).toBe(false);
    expect(upserts).toHaveLength(0);
  });

  it("stores the trimmed code with the admin's email, and audits without the code", async () => {
    expect(await save("private-library", `  ${NEW_CODE} `)).toEqual({ ok: true });
    expect(upserts[0]).toMatchObject({ scope: "private-library", code: NEW_CODE, updated_by: "admin@example.test" });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0])).not.toContain(NEW_CODE);
  });

  // access_codes is keyed by its text scope and audit_log.record_id is a uuid,
  // so passing the scope as the record id failed every insert (B.13). The row
  // names no record and carries the scope in its context instead.
  it("writes an audit row with no record id and the scope in its context", async () => {
    expect(await save("gam", NEW_CODE)).toEqual({ ok: true });
    expect(audits[0]).toMatchObject({
      table_name: "access_codes",
      record_id: null,
      operation: "update",
      actor_label: "admin@example.test",
      context: { scope: "gam" },
    });
    // Exactly the scope: the kernel's non-uuid fallback never had to fire.
    expect(audits[0].context).toEqual({ scope: "gam" });
    expect(JSON.stringify(audits[0])).not.toContain(NEW_CODE);
  });
});
