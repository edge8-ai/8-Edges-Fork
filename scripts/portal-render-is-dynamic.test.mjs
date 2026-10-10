// Guards the premise ADR 0008 rests on: the portal renders every data page per
// request, so `revalidateSurfaces` in kernel/shell/surface.ts covers /admin and
// /team and deliberately not /portal.
//
// That decision is only correct while the portal has no cached render to go
// stale. The invariant is currently held by a `dynamic: "force-dynamic"` line
// in entities/portal/mounts.ts or by an `await requirePortalMember()` that
// reads cookies() — both of which a cleanup could remove without any gate
// noticing, and the symptom would be a client seeing a company record that an
// admin edited yesterday. So it is asserted here rather than observed.
//
// A page is allowed to be cacheable only by being named in STATIC_BY_DESIGN
// below, which is where the argument for caching it has to be written down.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL = path.join(ROOT, "entities/portal");

// Pages that read no table, so no write can make them stale. Each entry names
// why; a page only belongs here if a reader can check the claim from the file.
const STATIC_BY_DESIGN = new Map([
  [
    "routes/proposals/page",
    "The proposal list is a literal array in the page file; it reads no table.",
  ],
  [
    "routes/portal/(auth)/login/page",
    "A sign-in shell around a client form. Nothing is read on the server, and " +
      "there is no record here for an admin's write to make stale.",
  ],
  [
    "routes/portal/(auth)/callback/page",
    'A "use client" landing page that establishes the invited member\'s session ' +
      "from the URL hash. It reads nothing on the server.",
  ],
  [
    "routes/portal/(auth)/verify/page",
    'A "use client" interstitial that redeems an emailed one-time token in the ' +
      "browser. It reads nothing on the server and is deliberately prerenderable.",
  ],
]);

// Reading the request makes Next render the route dynamically, which is the
// same guarantee `force-dynamic` gives — and these are how portal code does it.
const READS_THE_REQUEST = [
  "requirePortalMember",
  "requirePortalPermission",
  "portalActor",
  "cookies()",
  "headers()",
];

/**
 * Comments are dropped before the source is searched. Without this the gate
 * reads a prose mention of requirePortalMember() as a call to it, and a purely
 * static page passes by talking about the guard it does not use.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Every page.tsx under the portal's route tree, as a mounts.ts key. */
function portalPageKeys() {
  const keys = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx") {
        keys.push(path.relative(PORTAL, full).replace(/\.tsx$/, ""));
      }
    }
  };
  walk(path.join(PORTAL, "routes"));
  return keys.sort();
}

/**
 * The segment config mounts.ts declares for a key, as raw text. The file is a
 * flat object literal of `"key": { … },` entries, so a keyed slice is enough
 * and is what scripts/gen-app-mounts.mjs relies on too.
 */
function mountEntry(source, key) {
  const start = source.indexOf(`"${key}": {`);
  if (start === -1) return null;
  const end = source.indexOf("\n  },", start);
  return source.slice(start, end === -1 ? source.length : end);
}

describe("the portal renders per request (ADR 0008)", () => {
  const mounts = fs.readFileSync(path.join(PORTAL, "mounts.ts"), "utf8");
  const pages = portalPageKeys();

  it("finds the portal's pages, so an empty walk cannot pass silently", () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  for (const key of pages) {
    const reason = STATIC_BY_DESIGN.get(key);
    it(`${key} is dynamic${reason ? " or reads nothing" : ""}`, () => {
      if (reason) {
        expect(reason).toBeTruthy();
        return;
      }
      const entry = mountEntry(mounts, key);
      const forcedDynamic = entry !== null && entry.includes('dynamic: "force-dynamic"');
      const source = stripComments(
        fs.readFileSync(path.join(PORTAL, `${key}.tsx`), "utf8"),
      );
      const readsRequest = READS_THE_REQUEST.some((call) => source.includes(call));

      expect(
        forcedDynamic || readsRequest,
        `${key} would be prerendered: it declares no dynamic: "force-dynamic" in ` +
          "entities/portal/mounts.ts and never reads the request. A cached portal " +
          "page can serve a stale record, because revalidateSurfaces() refreshes " +
          "/admin and /team only. Either keep it dynamic, or reopen ADR 0008 " +
          "(docs/adr/0008-the-portal-is-rendered-per-request-not-revalidated.md) " +
          "and give the portal a way to declare the paths it wants invalidated.",
      ).toBe(true);
    });
  }

  it("has no stale STATIC_BY_DESIGN entry", () => {
    for (const key of STATIC_BY_DESIGN.keys()) expect(pages).toContain(key);
  });
});
