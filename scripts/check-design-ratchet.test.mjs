// Exercises scripts/check-design-ratchet.mjs against throwaway fixture trees.
//
// Like check-action-auth.test.mjs, each test builds a tiny app/ under a temp
// directory rather than pointing at the real repo, so the assertions stay true
// however the codebase's counts move; the "real repo passes" check is the
// `check:design-ratchet` script itself, run as a gate.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkDesignRatchet,
  countPagePrefixedSelectors,
  cssRuleSelectors,
  loadBaseline,
  measure,
  routePrefixes,
  writeBaseline,
} from "./check-design-ratchet.mjs";

const tmpDirs = [];

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "design-ratchet-"));
  tmpDirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const baselinePath = (root) => path.join(root, "scripts/design-ratchet-baseline.json");

const TWO_STYLES = `export default function P() {
  return <div style={{ marginTop: 4 }}><span style={{ color: "red" }}>x</span></div>;
}
`;
const THREE_STYLES = `export default function P() {
  return <div style={{ marginTop: 4 }}><span style={{ color: "red" }}>x</span><b style={{ a: 1 }} /></div>;
}
`;
const NO_STYLES = `export default function P() { return <div className="admin-card">x</div>; }\n`;

// One page-prefixed selector (`.careers-hero`, app/careers exists), one
// admin-* selector, one nested in a media query, one that only looks prefixed
// (`.hero-` is not a route), and a comment that must not count.
const GLOBALS = `/* .careers-comment { } */
.admin-card { padding: 4px; }
.careers-hero, .hero-title { margin: 0; }
@media (max-width: 600px) {
  .careers-hero { margin: 4px; }
}
@keyframes spin { from { opacity: 0 } to { opacity: 1 } }
`;

function tree({ globals = GLOBALS, page = TWO_STYLES, baseline } = {}) {
  const files = {
    "app/globals.css": globals,
    "app/careers/page.tsx": page,
    "app/admin/(dashboard)/x/page.tsx": NO_STYLES,
    "app/api/route.ts": "export {};\n",
  };
  if (baseline !== undefined) files["scripts/design-ratchet-baseline.json"] = JSON.stringify(baseline);
  return fixture(files);
}

describe("check-design-ratchet measurement", () => {
  it("derives route prefixes from folders, skipping groups, dynamic segments and api", () => {
    const root = fixture({
      "app/careers/page.tsx": NO_STYLES,
      "app/case-studies/[slug]/page.tsx": NO_STYLES,
      "app/admin/(dashboard)/page.tsx": NO_STYLES,
      "app/api/x/route.ts": "",
      "app/t/page.tsx": NO_STYLES,
    });
    const prefixes = routePrefixes(root);
    expect(prefixes.has("careers")).toBe(true);
    expect(prefixes.has("case")).toBe(true);
    // admin is a route folder, but admin-* is the chosen system, never a page prefix.
    expect(prefixes.has("admin")).toBe(false);
    expect(prefixes.has("dashboard")).toBe(false);
    expect(prefixes.has("[slug]")).toBe(false);
    expect(prefixes.has("api")).toBe(false);
    expect(prefixes.has("t")).toBe(false);
  });

  it("lists rule selectors, skipping comments and at-rule preludes but descending into @media", () => {
    expect(cssRuleSelectors(GLOBALS)).toEqual([
      ".admin-card",
      ".careers-hero",
      ".hero-title",
      ".careers-hero",
      "from",
      "to",
    ]);
  });

  it("counts only selectors whose leading class shares a first segment with a route", () => {
    expect(countPagePrefixedSelectors(GLOBALS, new Set(["careers"]))).toBe(2);
  });

  it("measures inline styles per file, omitting files with none", () => {
    const root = tree();
    expect(measure(root)).toEqual({
      inlineStyles: { "app/careers/page.tsx": 2 },
      pagePrefixedSelectors: 2,
    });
  });

  // A Satori card has no stylesheet and no className, so an inline style is
  // the only styling it can have; counting one measured nothing.
  it("does not count Next's metadata image routes, at any depth or number", () => {
    const root = tree();
    for (const rel of [
      "app/opengraph-image.tsx",
      "app/careers/opengraph-image.tsx",
      "app/careers/opengraph-image2.tsx",
      "app/careers/twitter-image.tsx",
      "app/icon.tsx",
      "app/apple-icon.tsx",
      "entities/library/routes/workflows/x/opengraph-image.tsx",
    ]) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, THREE_STYLES);
    }
    expect(measure(root).inlineStyles).toEqual({ "app/careers/page.tsx": 2 });
  });

  // The exemption is the whole filename, not a substring of it: a screen that
  // merely mentions one must stay counted, or the escape hatch is a rename away.
  it("still counts a file whose name only contains an exempt name", () => {
    const root = tree();
    for (const rel of [
      "app/careers/opengraph-image-editor.tsx",
      "app/careers/IconPicker.tsx",
      "app/careers/icon.ts.tsx",
    ]) {
      fs.writeFileSync(path.join(root, rel), TWO_STYLES);
    }
    expect(Object.keys(measure(root).inlineStyles).sort()).toEqual([
      "app/careers/IconPicker.tsx",
      "app/careers/icon.ts.tsx",
      "app/careers/opengraph-image-editor.tsx",
      "app/careers/page.tsx",
    ]);
  });
});

describe("check-design-ratchet gate", () => {
  const BASELINE = { inlineStyles: { "app/careers/page.tsx": 2 }, pagePrefixedSelectors: 2 };

  it("passes when the tree matches the baseline", () => {
    const root = tree({ baseline: BASELINE });
    expect(checkDesignRatchet(root).violations).toEqual([]);
  });

  it("passes when a file drops below its baseline", () => {
    const root = tree({ baseline: { ...BASELINE, inlineStyles: { "app/careers/page.tsx": 5 } } });
    expect(checkDesignRatchet(root).violations).toEqual([]);
  });

  it("fails when a file's inline-style count rises above its baseline", () => {
    const root = tree({ page: THREE_STYLES, baseline: BASELINE });
    expect(checkDesignRatchet(root).violations).toEqual([
      "app/careers/page.tsx: 3 inline style(s), baseline allows 2",
    ]);
  });

  it("fails when a file absent from the baseline has any inline style", () => {
    const root = tree({ baseline: BASELINE });
    fs.mkdirSync(path.join(root, "entities"));
    fs.writeFileSync(path.join(root, "entities/New.tsx"), TWO_STYLES);
    expect(checkDesignRatchet(root).violations).toEqual([
      "entities/New.tsx: 2 inline style(s) in a file with no baseline entry (new files start at 0)",
    ]);
  });

  it("fails when globals.css gains a page-prefixed selector", () => {
    const root = tree({ globals: `${GLOBALS}.careers-cta { color: red; }\n`, baseline: BASELINE });
    expect(checkDesignRatchet(root).violations).toEqual([
      "app/globals.css: 3 page-prefixed selector(s), baseline allows 2",
    ]);
  });

  it("fails when the baseline file is missing", () => {
    const root = tree();
    expect(checkDesignRatchet(root).violations).toHaveLength(1);
    expect(checkDesignRatchet(root).violations[0]).toMatch(/--write-baseline/);
  });
});

describe("check-design-ratchet --write-baseline", () => {
  it("creates the baseline from the current tree with sorted keys", () => {
    const root = tree();
    expect(writeBaseline(root).written).toBe(true);
    expect(loadBaseline(baselinePath(root))).toEqual({
      inlineStyles: { "app/careers/page.tsx": 2 },
      pagePrefixedSelectors: 2,
    });
  });

  it("lowers numbers and drops files that reached zero", () => {
    const root = tree({
      page: NO_STYLES,
      baseline: { inlineStyles: { "app/careers/page.tsx": 2 }, pagePrefixedSelectors: 9 },
    });
    expect(writeBaseline(root).written).toBe(true);
    expect(loadBaseline(baselinePath(root))).toEqual({ inlineStyles: {}, pagePrefixedSelectors: 2 });
  });

  it("refuses to write when any number would increase, leaving the file untouched", () => {
    const baseline = { inlineStyles: { "app/careers/page.tsx": 2 }, pagePrefixedSelectors: 1 };
    const root = tree({ page: THREE_STYLES, baseline });
    const before = fs.readFileSync(baselinePath(root), "utf8");
    const res = writeBaseline(root);
    expect(res.written).toBe(false);
    expect(res.increases).toEqual([
      "app/careers/page.tsx: 3 inline style(s), baseline allows 2",
      "app/globals.css: 2 page-prefixed selector(s), baseline allows 1",
    ]);
    expect(fs.readFileSync(baselinePath(root), "utf8")).toBe(before);
  });
});
