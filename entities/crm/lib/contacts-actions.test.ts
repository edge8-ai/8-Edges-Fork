import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { LINKEDIN_NOT_A_LINK } from "@/kernel/ui/url";

// W.118.1. A contact's LinkedIn is drawn as an href on the contact page and the
// contacts shelf; a value that is not a link is refused, never stored.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/shell/surface", () => ({ revalidateSurfaces: vi.fn() }));
// The action asks for its declared permission (ADR 0013); recorded so the test pins which one.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { user: { email: "admin@example.test" } };
  },
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/kernel/audit/history-read", () => ({ readAuditPage: vi.fn() }));
vi.mock("@/entities/crm/lib/mutations", () => ({ archiveRecord: vi.fn(), guardedDelete: vi.fn(), restoreRecord: vi.fn() }));
vi.mock("@/entities/crm/lib/contacts", () => ({ getPerson360: vi.fn() }));
vi.mock("@/kernel/identity/writes", () => ({ updatePeople: (row: unknown) => builderFor("people").update(row) }));

import { updatePerson } from "./contacts-actions";

const written = () => calls.map((c) => [(c.payloads[0] as Record<string, unknown>).linkedin_url, c.filters]);

beforeEach(() => {
  resetFake();
  asked.length = 0;
});

describe("contacts actions · access", () => {
  it("asks for crm.contacts before touching a contact", async () => {
    script("people", {});
    await updatePerson("p1", { linkedin_url: "" });
    expect(asked[0]).toBe("crm.contacts");
  });
});

describe("updatePerson · LinkedIn", () => {
  it("stores a schemeless profile as https, and clears on empty", async () => {
    script("people", {}, {});
    expect(await updatePerson("p1", { linkedin_url: "linkedin.com/in/someone" })).toEqual({ ok: true });
    expect(await updatePerson("p1", { linkedin_url: "  " })).toEqual({ ok: true });
    expect(written()).toEqual([
      ["https://linkedin.com/in/someone", [["eq", "id", "p1"]]],
      [null, [["eq", "id", "p1"]]],
    ]);
  });

  it("refuses a value that is not a link and writes nothing", async () => {
    for (const bad of ["javascript:alert(1)", "someone"]) {
      expect(await updatePerson("p1", { linkedin_url: bad, phone: "123" })).toEqual({ ok: false, error: LINKEDIN_NOT_A_LINK });
    }
    expect(calls).toHaveLength(0);
  });
});
