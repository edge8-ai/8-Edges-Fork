// The hand-written files under app/ — the root layout, the three surface
// shells, the auth callback — are the one place a deployment can still bundle
// an entity it did not install: they are not generated, so nothing removes an
// import of `@/entities/assistant` when assistant is left out. The minimal
// build's first run showed exactly that: the admin shell shipping the AI chat
// widget to a client who had not bought it, and the root layout pulling in the
// marketing site.
//
// This is a ratchet. Every such import is listed below with the shell it lives
// in; the list may only shrink. A new one fails here, and the right fix is the
// one the team shell got — a shell that follows its entity — or a contribution
// the composition root assembles from the installed entities, the way the
// navigation is.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HAND_WRITTEN, installedEntities, orphanLayouts } from "./gen-app-mounts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Known leaks in the minimal deployment. Shrink-only.
// Emptied on 2026-09-12: the three leaks moved behind the generated
// app/shell.ts (W.7). The list stays so a new leak has somewhere to fail.
const KNOWN = {
  minimal: [],
};

function entityImports(file) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  return [...src.matchAll(/from\s+["']@\/entities\/([a-z-]+)/g)].map((m) => m[1]);
}

// The generated registries — events, nav, env, shell, search, permissions, access and// access — are regenerated for each deployment from its own entity list
// (check:generated proves it), so on this edge8 tree they name every entity and
// say nothing about minimal. Only the files a person wrote are the question here.
const GENERATED = new Set([
  "app/events.ts",
  "app/nav.ts",
  "app/env.ts",
  "app/shell.ts",
  "app/search.ts",
  "app/permissions.ts",
  "app/access.ts",
  "app/routines.ts",
]);

function leaks(deployment) {
  const installed = installedEntities(root, deployment);
  const orphans = new Set(orphanLayouts(installed));
  const out = [];
  for (const file of HAND_WRITTEN) {
    if (GENERATED.has(file) || orphans.has(file) || (!file.endsWith(".tsx") && !file.endsWith(".ts"))) continue;
    if (!fs.existsSync(path.join(root, file))) continue;
    for (const entity of new Set(entityImports(file))) if (!installed.has(entity)) out.push(`${file} → ${entity}`);
  }
  return out.sort();
}

describe("hand-written app/ files and the deployment", () => {
  it("import nothing outside the full catalogue", () => {
    expect(leaks("edge8")).toEqual([]);
  });

  it("leak into the minimal deployment only what is already known, and never more", () => {
    const found = leaks("minimal");
    const fresh = found.filter((l) => !KNOWN.minimal.includes(l));
    expect(fresh).toEqual([]);
  });

  it("keep the known list honest — every entry is still a real leak", () => {
    const found = new Set(leaks("minimal"));
    const stale = KNOWN.minimal.filter((l) => !found.has(l));
    // A fixed leak must be removed from KNOWN, so the ratchet only shrinks.
    expect(stale).toEqual([]);
  });
});
