// The generated app/ follows the deployment, and so do the three hand-written
// surface shells: a shell is kept only when the entity that owns its surface
// is installed. Without this the minimal deployment carried the team hub's
// layout — which imports the team and coaching doors — with no page under it.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateMounts, installedEntities, orphanLayouts, parseMount, renderMount, SURFACE_LAYOUT_OWNER } from "./gen-app-mounts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("surface shells follow their entity", () => {
  it("keeps all three shells for the full catalogue", () => {
    expect(orphanLayouts(installedEntities(root, "edge8"))).toEqual([]);
  });

  it("drops the team shell for a deployment without the team entity", () => {
    const installed = installedEntities(root, "minimal");
    expect(installed.has("team")).toBe(false);
    expect(orphanLayouts(installed)).toEqual(["app/team/(dashboard)/layout.tsx"]);
  });

  it("names an owner for every shell, and only shells", () => {
    expect(Object.keys(SURFACE_LAYOUT_OWNER).sort()).toEqual([
      "app/admin/(dashboard)/layout.tsx",
      "app/portal/(dashboard)/layout.tsx",
      "app/team/(dashboard)/layout.tsx",
    ]);
  });

  it("mounts the counts the docs quote — 546 for edge8, 175 for minimal", () => {
    // The numbers appear in CLAUDE.md and the PR text; a generator change that
    // moves them should have to say so here.
    expect(Object.keys(generateMounts(root, "edge8")).length).toBe(546);
    expect(Object.keys(generateMounts(root, "minimal")).length).toBe(175);
  });

  it("generates no page under a shell it drops", () => {
    // A dropped shell with a page still under it would be a build error; the
    // two decisions come from the same installed set, so they cannot disagree.
    const files = Object.keys(generateMounts(root, "minimal"));
    expect(files.some((f) => f.startsWith("app/team/"))).toBe(false);
  });
});

describe("cron and API mounts never read through the fetch cache", () => {
  // From 19 to 25 Sep 2026 the onboarding cron read its rows from Next's Data
  // Cache: a stale row sent the Day 8 survey every morning and later promoted a
  // hire, with the congratulations email, twice. Its mount had force-dynamic
  // but no fetchCache, and force-dynamic does not stop supabase-js reads being
  // cached. A default in the generator means a new cron cannot forget it.
  const files = generateMounts(root, "edge8");
  const serverMounts = Object.entries(files).filter(([p]) => p.startsWith("app/api/"));

  it("gives every cron and API mount force-no-store", () => {
    const missing = serverMounts.filter(([, src]) => !/export const fetchCache = /.test(src)).map(([p]) => p);
    expect(serverMounts.length).toBeGreaterThan(40);
    expect(missing).toEqual([]);
  });

  it("covers the cron whose stale read repeated the Day 60 promotion", () => {
    expect(files["app/api/cron/onboarding-cycle/route.ts"]).toContain('export const fetchCache = "force-no-store";');
  });

  it("leaves pages to their entity's own declaration", () => {
    // Pages prerender (the blog), and a client-wide no-store broke that build in
    // #1628; the default stops at app/api/.
    const page = files["app/team/(dashboard)/onboarding/page.tsx"];
    expect(page).toBeDefined();
    expect(page).not.toContain("fetchCache");
  });
});

// W.169.4. A page can carry what another entity provides without requiring it:
// the entity asks for a slot in its mounts.ts, and the generated mount wraps the
// page and passes app/shell.ts's value in. The entity never names the provider.
describe("page slots", () => {
  it("reads a mount's slots", () => {
    expect(parseMount('    segment: { dynamic: "force-dynamic" },\n    slots: { inboxLine: "InboxLine" },')).toMatchObject({
      slots: { inboxLine: "InboxLine" },
    });
  });

  it("wraps a page that takes a slot and passes the shell's value, re-exporting the rest", () => {
    const src = renderMount({ specifier: "@/entities/x/routes/team/p/page", symbols: ["default", "metadata"], slots: { inboxLine: "InboxLine" } });
    expect(src).toContain('import Body from "@/entities/x/routes/team/p/page";');
    expect(src).toContain('import { InboxLine } from "@/app/shell";');
    expect(src).toContain('export { metadata } from "@/entities/x/routes/team/p/page";');
    expect(src).toContain('export default function Page(props: Omit<ComponentProps<typeof Body>, "inboxLine">) {');
    expect(src).toContain("return <Body {...props} inboxLine={InboxLine} />;");
    expect(src).not.toContain("export { default");
  });

  it("gives My Week the Inbox line in the full catalogue", () => {
    const mount = generateMounts(root, "edge8")["app/team/(dashboard)/my-week/page.tsx"];
    expect(mount).toContain("inboxLine={InboxLine}");
  });
});
