import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerWornTiers, wornTiersFor, type WornTiersProvider } from "@/kernel/shell/faces";

// The client portal never shows a worn border (LD.8; spec "The client portal
// never shows", ADR 0021 "Who reads what"). The portal draws the same Workboard
// and the same faces as the team surface, and they stay plain because nothing
// on the portal asks for a border or provides one: no portal file imports the
// kernel's faces seam, the borders context or the ladders door, and none hands
// a face a border. LD.9's fence test generalises this to every surface; this
// pins the portal half of LD.8's "the admin surface and the portal draw no
// border", and LD.9 adds the portal's own team page drawn for people who wear
// a border on the team surface, and what the ladders' stylesheets, which do
// reach the portal, can paint there (nothing).

const ROOT = path.resolve(__dirname, "..", "..");
// The portal shell and every file of the portal entity: its layouts and mounts
// under app/portal, and the whole of entities/portal (doors, api, mounts, lib,
// ui, routes) except the entity's team-surface routes (routes/team), which are
// not the portal.
const PORTAL_DIRS = ["app/portal", "entities/portal"];
const NOT_PORTAL = /^entities\/portal\/routes\/team\//;

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    out.push(path.relative(ROOT, path.join(entry.parentPath, entry.name)));
  }
  return out;
}

const files = PORTAL_DIRS.flatMap(sourcesUnder).filter((f) => !NOT_PORTAL.test(f));

describe("the portal draws no worn border", () => {
  it("reads the portal's own files", () => {
    // A walk that found nothing would pass everything below.
    expect(files).toContain("app/portal/(dashboard)/layout.tsx");
    expect(files.length).toBeGreaterThan(20);
  });

  it("never imports the faces seam, the borders context or the ladders door", () => {
    // Matched on the module's name, so a relative import is caught as well as the alias.
    const offenders = files.filter((f) => /(kernel\/shell\/faces|kernel\/ui\/face-borders|\/face-borders|entities\/ladders)(["'/])/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("never hands a face a border, and mounts no emblem sprite and no rank-up", () => {
    const offenders = files.filter((f) => /\bborders?=\{|FaceBordersContext|boardFacesDrawn|bordersOf|wornTiersFor|emblemSprite|EmblemSprite|RankUpGate/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});

// The ladders door's stylesheets do reach the portal, and every other page:
// app/layout.tsx imports app/shell.ts, which imports the ladders door, which
// imports them (the door's own `import "./….css"` lines, read below as the one
// list of them). The rules draw nothing unless a ladders component renders one
// of their classes (`frame-`, `rankup`, `bd-`), and the fence
// (entities/ladders/fence.test.ts) and the rendered-markup test below prove that
// never happens off the team surface. A layout may not name an entity, so the
// CSS stays where it is.
const DOOR_STYLESHEETS = [...fs.readFileSync(path.join(ROOT, "entities/ladders/index.ts"), "utf8").matchAll(/^import\s+["']\.\/([^"']+\.css)["'];/gm)].map((m) => `entities/ladders/${m[1]}`);
const LADDERS_CLASS = /\.(frame-|rankup|bd-)/;

describe("the ladders door's stylesheets on the portal", () => {
  it("style only the ladders' own classes, so they paint nothing a portal page draws", () => {
    expect(DOOR_STYLESHEETS.length).toBeGreaterThanOrEqual(3);
    for (const sheet of DOOR_STYLESHEETS) {
      const css = fs.readFileSync(path.join(ROOT, sheet), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => !s.startsWith("@") && !/^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/.test(s));
      expect(selectors.length).toBeGreaterThan(0);
      for (const part of selectors.flatMap((s) => s.split(","))) expect([sheet, part.trim(), LADDERS_CLASS.test(part)]).toEqual([sheet, part.trim(), true]);
    }
  });

  it("find none of those classes in a portal file", () => {
    expect(files.filter((f) => /["'\s`](frame-|rankup|bd-)/.test(fs.readFileSync(path.join(ROOT, f), "utf8")))).toEqual([]);
  });
});

// The portal's team page, drawn for a client while the people on it wear a
// border on the team surface: the composition root has registered a provider
// that answers Gold for everyone it is asked about, exactly as the team
// pages would see them. The page never asks it, and draws plain faces.
const member = (teamMemberId: string, name: string, avatarUrl: string | null) => ({
  teamMemberId, name, roleTitle: "AI engineer", positionTitle: null, location: "Ho Chi Minh City", workSchedule: null, startDate: "2026-01-05",
  email: `${teamMemberId}@example.com`, phone: null, avatarUrl, city: null, stateProvince: null, country: null,
});
vi.mock("@/kernel/identity/access-request", () => ({ requirePortalPermission: async () => ({ kind: "portal", personId: "client-1", companyIds: ["company-1"] }) }));
vi.mock("@/entities/portal/lib/team", () => ({ getAssignedTeam: async () => [member("tm-mai", "Mai Tran", null), member("tm-an", "An Le", "https://example.com/an.jpg")] }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => createElement("img", { src: props.src as string, alt: props.alt as string, className: props.className as string }) }));

const KEY = Symbol.for("edge8.shell.worn-tiers");
const registry = globalThis as unknown as Record<symbol, { provider: WornTiersProvider | null } | undefined>;
const before = registry[KEY]?.provider ?? null;
afterAll(() => {
  if (registry[KEY]) registry[KEY].provider = before;
});

describe("the portal's team page", () => {
  it("draws plain faces for people who wear a border on the team surface", async () => {
    const asked: string[][] = [];
    registerWornTiers(async (ids) => {
      asked.push([...ids]);
      return new Map(ids.map((id) => [id, "gold"]));
    });
    // On the team surface, the seam would draw Mai and An in Gold.
    expect((await wornTiersFor(["mai", "an"], { personId: "teammate" })).get("mai")).toBe("gold");
    asked.length = 0;

    const { default: PortalTeamPage } = await import("./routes/portal/(dashboard)/team/page");
    const html = renderToStaticMarkup(await PortalTeamPage());
    expect(html).toContain("Mai Tran");
    expect(html).toContain("An Le");
    expect(html.match(/class="admin-avatar[ "]/g)?.length).toBe(2);
    for (const never of ["frame-", "rankup", "bd-", "admin-face-frame", "admin-face--framed", "ladder-border", "gold", "legend"]) expect([never, html.includes(never)]).toEqual([never, false]);
    expect(asked).toEqual([]);
  });
});
