import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Settings → Legal entities, rendered through the real loader on the kernel's
// fake: every row's legal name, country and tax code, "Not set" where a tax
// code is missing, a flag where the legal representative is missing or
// archived, and the last change read from audit_log. Finance opens the page;
// only a Super Admin is offered "+ Add legal entity".
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const asked: string[] = [];
let holds = new Set<string>(["org.legal-registration", "org.legal-entities"]);
const requirePermission = vi.fn(async (p: string) => (asked.push(p), { user: { email: "admin@example.test" }, may: (q: string) => holds.has(q) }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: (p: string) => requirePermission(p) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("./company-actions", () => ({ updateLegalEntityCompany: vi.fn(), createLegalEntity: vi.fn() }));
vi.mock("./registration-actions", () => ({ updateLegalEntityRegistration: vi.fn() }));

import LegalEntitiesPage from "./page";

// Made-up companies, numbers and people; the page names none of its own.
const BASE = { registration_number: null, registered_address: null, jurisdiction: null, incorporated_on: null };
const VN = { ...BASE, id: "le-vn", slug: "acme-vn", name: "Acme Vietnam", legal_name: "Acme Vietnam Co., Ltd", country: "VN", entity_type: "corporation", base_currency: "vnd", tax_id: null, active: true, legal_representative_person_id: null };
const US = { ...BASE, id: "le-us", slug: "acme-llc", name: "Acme", legal_name: "Acme LLC", country: "US", entity_type: "llc", base_currency: "usd", tax_id: "12-3456789", active: true, legal_representative_person_id: "p-rep" };

const person = (id: string, full_name: string, archived_at: string | null = null) => ({ id, full_name, display_name: null, preferred_name: null, email: null, archived_at });

const US_CHANGE = {
  id: "a1",
  changed_at: "2026-10-01T03:00:00.000Z",
  operation: "update",
  actor_label: "ops@example.test",
  actor_person_id: null,
  context: { reason: "From the IRS letter" },
  old_data: { tax_id: null },
  new_data: { tax_id: "12-3456789" },
};

beforeEach(() => {
  resetFake();
  answerOnlySelectedColumns();
  asked.length = 0;
  holds = new Set(["org.legal-registration", "org.legal-entities"]);
  requirePermission.mockClear();
});

async function render(open?: string): Promise<string> {
  return renderToStaticMarkup(await LegalEntitiesPage({ searchParams: Promise.resolve(open === undefined ? {} : { open }) }));
}

describe("Settings → Legal entities", () => {
  it("asks for org.legal-registration before reading anything", async () => {
    requirePermission.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(render()).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePermission).toHaveBeenCalledWith("org.legal-registration");
    expect(calls).toHaveLength(0);
  });

  it("lists every legal entity with its legal name, country, currency and tax code", async () => {
    script("legal_entities", { data: [VN, US] });
    script("audit_log", { data: [] }, { data: [US_CHANGE] });
    // The history's actor is named first, then the representatives.
    script("people", { data: [{ ...person("p-ops", "Ops Person"), email: "ops@example.test" }] }, { data: [person("p-rep", "Dana Example")] });
    script("team_members", { data: [] });

    const html = await render();

    expect(asked).toEqual(["org.legal-registration"]);
    expect(html).toContain("Acme Vietnam Co., Ltd");
    expect(html).toContain("Acme Vietnam · Corporation");
    expect(html).toContain("VN · VND");
    expect(html).toContain("Acme LLC");
    expect(html).toContain("Acme · LLC");
    expect(html).toContain("US · USD");
    expect(html).toContain("12-3456789");
  });

  it("marks a missing tax code Not set, an untouched entity Never changed, and a missing representative", async () => {
    script("legal_entities", { data: [VN] });
    script("audit_log", { data: [] });
    script("team_members", { data: [] });

    const html = await render();

    expect(html).toMatch(/admin-badge--warn[^>]*>Not set</);
    expect(html).toContain("Never changed");
    expect(html).toMatch(/admin-badge--warn[^>]*>No legal representative</);
  });

  it("flags a legal representative who has been archived", async () => {
    script("legal_entities", { data: [US] });
    script("audit_log", { data: [] });
    script("people", { data: [person("p-rep", "Dana Example", "2026-09-01T00:00:00Z")] });
    script("team_members", { data: [] });

    expect(await render()).toMatch(/admin-badge--warn[^>]*>Legal representative is archived</);
  });

  it("reads the last change from the entity's audit rows, naming the person", async () => {
    script("legal_entities", { data: [{ ...US, legal_representative_person_id: null }] });
    script("audit_log", { data: [US_CHANGE] });
    script("people", { data: [{ ...person("p-ops", "Ops Person"), email: "ops@example.test" }] });
    script("team_members", { data: [] });

    const html = await render();

    expect(html).toContain("Ops Person · Oct 1, 2026");
    const audit = calls.find((c) => c.table === "audit_log");
    expect(audit?.filters).toEqual(expect.arrayContaining([["eq", "table_name", "legal_entities"], ["eq", "record_id", "le-us"]]));
  });

  it("offers + Add legal entity to a Super Admin only", async () => {
    script("legal_entities", { data: [] }, { data: [] });
    script("team_members", { data: [] }, { data: [] });
    expect(await render()).toContain("+ Add legal entity");

    holds = new Set(["org.legal-registration"]);
    expect(await render()).not.toContain("+ Add legal entity");
  });

  // A tax code that failed to load must not read as "Not set": the person
  // would type it in again over a value that is there.
  it("raises a failed read rather than rendering the entities as unset", async () => {
    script("legal_entities", { error: { message: "db down" } });
    script("team_members", { data: [] });
    await expect(render()).rejects.toThrow("read failed: [org/legal-entities] legal_entities: db down");
  });

  it("raises a failed history read rather than rendering Never changed", async () => {
    script("legal_entities", { data: [VN] });
    script("audit_log", { error: { message: "db down" } });
    script("team_members", { data: [] });
    await expect(render()).rejects.toThrow("audit_log: db down");
  });

  // RB.15: the reimbursement VAT box links its keeper straight to the
  // Vietnamese entity, so the page opens that entity's drawer from ?open=<slug>.
  it("opens the drawer of the entity ?open names, and none for a slug it does not know", async () => {
    const scriptOne = () => {
      script("legal_entities", { data: [VN] });
      script("audit_log", { data: [] });
      script("team_members", { data: [] });
    };
    scriptOne();
    expect(await render()).not.toContain('role="dialog"');
    scriptOne();
    const opened = await render("acme-vn");
    expect(opened).toContain('role="dialog"');
    expect(opened).toContain("Acme Vietnam");
    scriptOne();
    expect(await render("nobody-here")).not.toContain('role="dialog"');
  });

  it("says so when there are no legal entities", async () => {
    script("legal_entities", { data: [] });
    script("team_members", { data: [] });
    expect(await render()).toContain("No legal entities are recorded.");
  });
});
