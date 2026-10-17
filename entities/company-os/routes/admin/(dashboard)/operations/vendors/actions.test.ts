import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.118.2. A vendor's website is drawn as an href in the vendors shelf. Every
// admin writer refuses a value that is not a link.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
// The actions ask for their declared permission first (ADR 0013); recorded so the test pins which.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: vi.fn(async (p: string) => (asked.push(p), { user: { email: "admin@example.test" } })) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/entities/crm", () => ({ archiveRecord: vi.fn(), restoreRecord: vi.fn() }));
vi.mock("@/entities/finance", () => ({
  insertVendors: (row: unknown) => builderFor("vendors").insert(row),
  updateVendors: (row: unknown) => builderFor("vendors").update(row),
}));

import { createVendor, updateVendor } from "./actions";
import { VENDOR_TYPES, type VendorInput } from "@/entities/company-os/ui/vendors/vendor-shared";

const ERROR = "Website isn't a web link. Paste the full address (e.g. example.com).";
const vendor = (url: string): VendorInput => ({ name: "Print shop", type: VENDOR_TYPES[0], url });
const writes = () => calls.map((c) => [c.ops[0], (c.payloads[0] as Record<string, unknown>).url]);

beforeEach(() => {
  resetFake();
});

describe("vendor website · admin", () => {
  it("is stored as https when typed without a scheme, and cleared on empty", async () => {
    script("vendors", { data: { id: "v1" } }, {}, {});
    expect(await createVendor(vendor("printshop.vn"))).toMatchObject({ ok: true });
    expect(await updateVendor("v1", { url: "printshop.vn/menu" })).toEqual({ ok: true });
    expect(await updateVendor("v1", { url: "" })).toEqual({ ok: true });
    expect(writes()).toEqual([
      ["insert", "https://printshop.vn/"],
      ["update", "https://printshop.vn/menu"],
      ["update", null],
    ]);
    expect(new Set(asked)).toEqual(new Set(["company-os.operations"]));
  });

  it("is refused, with nothing written, when it is not a link", async () => {
    expect(await createVendor(vendor("javascript:alert(1)"))).toEqual({ ok: false, error: ERROR });
    expect(await updateVendor("v1", { url: "data:text/html,x" })).toEqual({ ok: false, error: ERROR });
    expect(calls).toHaveLength(0);
  });

  it("is left alone by an update that does not touch it", async () => {
    script("vendors", {});
    expect(await updateVendor("v1", { notes: "ok" })).toEqual({ ok: true });
    expect(calls[0].payloads[0]).not.toHaveProperty("url");
  });
});
