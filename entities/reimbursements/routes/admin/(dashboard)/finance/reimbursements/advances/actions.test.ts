import { beforeEach, describe, expect, it, vi } from "vitest";

// Admin's one action: the guard first, and only the quote.
const asked = vi.hoisted(() => [] as string[]);
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const signed = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/entities/reimbursements/lib/advance-files", () => ({
  signAdvanceFile: async (i: Record<string, unknown>) => (signed.push(i), { ok: true, url: "https://signed" }),
}));

import { openAdvanceEvidenceInAdmin } from "./actions";

const ID = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  asked.length = 0;
  signed.length = 0;
});

describe("openAdvanceEvidenceInAdmin", () => {
  it("asks for reimbursements.view first, and signs evidence only", async () => {
    expect(await openAdvanceEvidenceInAdmin(ID, FILE)).toEqual({ ok: true, url: "https://signed" });
    expect(asked).toEqual(["reimbursements.view"]);
    expect(signed).toEqual([{ advanceId: ID, fileId: FILE, onlyKind: "evidence" }]);
  });

  it("refuses an odd id without signing", async () => {
    expect((await openAdvanceEvidenceInAdmin(ID, "../other")).ok).toBe(false);
    expect(signed).toEqual([]);
  });
});
