import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LegalEntityView } from "@/entities/org/lib/legal-entities";

// The edit drawer's two sections. Finance keeps the registration details and
// sees the company itself read-only, with the sentence saying who changes it;
// a Super Admin can edit both. The labels follow the entity's country.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("./company-actions", () => ({ updateLegalEntityCompany: vi.fn() }));
vi.mock("./registration-actions", () => ({ updateLegalEntityRegistration: vi.fn() }));

const { LegalEntityDrawer } = await import("./LegalEntityDrawer");

// A made-up company.
const entity = (country: string): LegalEntityView => ({
  record: {
    id: "le-1",
    slug: "acme",
    name: "Acme",
    legal_name: "Acme Co., Ltd",
    country,
    entity_type: "corporation",
    base_currency: country === "VN" ? "vnd" : "usd",
    active: true,
    tax_id: null,
    registration_number: null,
    registered_address: null,
    legal_representative_person_id: null,
    jurisdiction: null,
    incorporated_on: null,
  },
  typeLabel: "Corporation",
  representative: null,
  representativeFlag: "No legal representative",
  history: [{ id: "a1", lines: ["Legal name set to Acme Co., Ltd"], who: "Dana Example", at: "2026-10-01T03:00:00.000Z", why: "From the certificate" }],
});

function render(country: string, canEditCompany: boolean): string {
  return renderToStaticMarkup(
    <LegalEntityDrawer
      entity={entity(country)}
      context={{ may: { "org.legal-entities": canEditCompany, "org.legal-registration": true }, people: [{ id: "p1", name: "Dana Example" }], today: "2026-10-08" }}
      onClose={() => {}}
      restoreFocus={() => false}
    />,
  );
}

// The company section is the markup between its heading and the registration heading.
const companySection = (html: string) => html.slice(html.indexOf('id="legal-company"'), html.indexOf('id="legal-registration"'));
const registrationSection = (html: string) => html.slice(html.indexOf('id="legal-registration"'), html.indexOf('id="legal-history"'));

describe("LegalEntityDrawer", () => {
  it("shows Finance the company read-only, and says who changes it", () => {
    const html = render("VN", false);
    const company = companySection(html);
    const inputs = company.match(/<(input|select)\b[^>]*>/g) ?? [];
    expect(inputs.length).toBeGreaterThanOrEqual(5);
    expect(inputs.every((tag) => / disabled=""/.test(tag))).toBe(true);
    expect(company).toContain("Only a Super Admin changes the company itself.");
    // The registration details stay Finance's to edit.
    expect(registrationSection(html).match(/<(input|select|textarea)\b[^>]*>/g)?.some((tag) => / disabled=""/.test(tag))).toBe(false);
  });

  it("lets a Super Admin edit the company, with no read-only note", () => {
    const html = render("VN", true);
    const company = companySection(html);
    expect((company.match(/<(input|select)\b[^>]*>/g) ?? []).some((tag) => / disabled=""/.test(tag))).toBe(false);
    expect(html).not.toContain("Only a Super Admin changes the company itself.");
  });

  it("makes the registration details read-only for a viewer without org.legal-registration", () => {
    const html = renderToStaticMarkup(
      <LegalEntityDrawer
        entity={entity("VN")}
        context={{ may: { "org.legal-entities": true }, people: [], today: "2026-10-08" }}
        onClose={() => {}}
        restoreFocus={() => false}
      />,
    );
    expect(registrationSection(html)).toMatch(/<fieldset class="admin-form" disabled=""/);
    expect(render("VN", false)).not.toMatch(/<fieldset class="admin-form" disabled=""/);
  });

  it("labels the registration fields the way the country does", () => {
    const vn = registrationSection(render("VN", false));
    expect(vn).toContain("Tax code (mã số thuế)");
    expect(vn).toContain("Business registration number (mã số doanh nghiệp)");
    expect(vn).toContain("Province");
    const us = registrationSection(render("US", false));
    expect(us).toContain(">EIN<");
    expect(us).toContain("State file number");
    expect(us).toContain("State of incorporation");
    const other = registrationSection(render("SG", false));
    expect(other).toContain("Tax number");
    expect(other).toContain("Registration number");
    expect(other).toContain("Jurisdiction");
  });

  it("offers the team as legal representatives and keeps Save disabled until something changes", () => {
    const html = render("VN", true);
    expect(html).toContain('<option value="p1">Dana Example</option>');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save change<\/button>/);
  });

  it("lists the history with who, when and why", () => {
    const html = render("VN", false);
    expect(html).toContain("Legal name set to Acme Co., Ltd");
    expect(html).toContain("Dana Example · Oct 1, 2026");
    expect(html).toContain("“From the certificate”");
  });
});
