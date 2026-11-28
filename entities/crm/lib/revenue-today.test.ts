import { describe, expect, it, vi } from "vitest";
import { emailDraftsFor, maySeeEmailDrafts } from "./revenue-today";

// Revenue today's personal emails (RT.1) need Admin as well as the marketing
// permission: the drafts were only ever read on the Admin-only Personal pages.
describe("maySeeEmailDrafts", () => {
  it("refuses a Revenue role holder on the Team surface, who holds campaigns.marketing and crm.pipeline but not surface.admin", () => {
    expect(maySeeEmailDrafts({ "crm.pipeline": true, "campaigns.marketing": true, "surface.admin": false })).toBe(false);
  });

  it("refuses an Admin without campaigns.marketing, and an empty answer", () => {
    expect(maySeeEmailDrafts({ "surface.admin": true })).toBe(false);
    expect(maySeeEmailDrafts({})).toBe(false);
  });

  it("allows a reader with both", () => {
    expect(maySeeEmailDrafts({ "campaigns.marketing": true, "surface.admin": true })).toBe(true);
  });
});

describe("emailDraftsFor", () => {
  it("does not read the drafts for a Revenue holder without Admin", async () => {
    const read = vi.fn(async () => ["draft"]);
    expect(await emailDraftsFor({ "crm.pipeline": true, "campaigns.marketing": true, "surface.admin": false }, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("reads them for a reader with both atoms", async () => {
    const read = vi.fn(async () => ["draft"]);
    expect(await emailDraftsFor({ "campaigns.marketing": true, "surface.admin": true }, read)).toEqual(["draft"]);
  });
});
