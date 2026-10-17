import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { portalNav } from "./ui/portal-nav";

// Z.12.1 (Khoa, 9 Oct 2026): the weekly client status is the account owner's
// draft, which they share with the client themselves. Nothing is released into
// the portal any more, so the portal's Weekly status section went with the
// release: no route, no mount, no nav row, no home card, and no declared page.
// A section that came back would be an empty page a client could open, or a
// way for an unreviewed page to reach one.

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
// Files, not folders: git keeps no empty folder, so a checkout that deleted the
// files can be left holding the empty one, and that is no route.
const filesUnder = (rel: string): string[] => {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
};

describe("the portal has no Weekly status section", () => {
  it("has no route under the entity and no mount under app/", () => {
    expect(filesUnder("entities/portal/routes/portal/(dashboard)/status")).toEqual([]);
    expect(filesUnder("app/portal/(dashboard)/status")).toEqual([]);
  });

  it("offers no nav row to it", () => {
    const hrefs = portalNav.flatMap((c) => c.items.map((i) => i.href));
    expect(hrefs.filter((h) => h.startsWith("/portal/status"))).toEqual([]);
  });

  it("declares no page for it, and the portal home reads no weekly status", () => {
    expect(read("app/permissions.ts")).not.toContain('"/portal/status');
    expect(read("entities/portal/permissions.ts")).not.toContain("status/page");
    expect(read("entities/portal/routes/portal/(dashboard)/page.tsx")).not.toMatch(/releasedStatus|ThisWeekCard/);
  });
});
