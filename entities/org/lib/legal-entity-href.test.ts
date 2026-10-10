import { describe, expect, it } from "vitest";
import { legalEntityEditHref } from "./legal-entity-href";

// Where another screen sends whoever keeps the legal details (RB.15): Settings
// → Legal entities, opened on one entity when the caller knows which.
describe("legalEntityEditHref", () => {
  it("opens the named entity's drawer", () => {
    expect(legalEntityEditHref("acme-vn")).toBe("/admin/settings/legal-entities?open=acme-vn");
  });

  it("lands on the list when no entity is named", () => {
    expect(legalEntityEditHref(null)).toBe("/admin/settings/legal-entities");
  });

  it("encodes the slug", () => {
    expect(legalEntityEditHref("a b&c")).toBe("/admin/settings/legal-entities?open=a%20b%26c");
  });
});
