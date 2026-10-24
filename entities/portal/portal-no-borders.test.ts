import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The client portal never shows a worn border (LD.8; spec "The client portal
// never shows", ADR 0021 "Who reads what"). The portal draws the same Workboard
// and the same faces as the team surface, and they stay plain because nothing
// on the portal asks for a border or provides one: no portal file imports the
// kernel's faces seam, the borders context or the ladders door, and none hands
// a face a border. LD.9's fence test generalises this to every surface; this
// pins the portal half of LD.8's "the admin surface and the portal draw no
// border".

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
