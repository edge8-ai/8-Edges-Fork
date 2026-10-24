// Fixture-driven: a fake .next/server/app tree with hand-written .nft.json
// files, so the check is exercised without a real build.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkTracing, globToRegExp, listRouteTraces } from "./check-tracing-includes.mjs";

const tmpDirs = [];

function fixture(traces) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracing-"));
  tmpDirs.push(root);
  for (const [rel, files] of Object.entries(traces)) {
    const full = path.join(root, ".next", "server", "app", rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    // Real nft paths are relative to the .nft.json; write them that way.
    const relFiles = files.map((f) => path.relative(path.dirname(full), path.join(root, f)));
    fs.writeFileSync(full, JSON.stringify({ version: 1, files: relFiles }));
  }
  return root;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("globToRegExp", () => {
  it("treats a dynamic segment's brackets literally", () => {
    expect(globToRegExp("/post/[slug]/opengraph-image").test("/post/[slug]/opengraph-image")).toBe(true);
    expect(globToRegExp("/post/[slug]/opengraph-image").test("/post/hello/opengraph-image")).toBe(false);
  });

  it("expands * to one segment and ** to any depth", () => {
    expect(globToRegExp("public/fonts/manrope-og-*.ttf").test("public/fonts/manrope-og-bold.ttf")).toBe(true);
    expect(globToRegExp("public/fonts/*.ttf").test("public/fonts/sub/x.ttf")).toBe(false);
    expect(globToRegExp("public/case studies/images/**/*").test("public/case studies/images/a/b.png")).toBe(true);
  });

  // The chained-replace implementation expanded `**/` into `(?:.*/)?` and then
  // rewrote the `*` and `?` inside its own output, so this matched nothing and
  // reported a healthy build as broken.
  it("does not corrupt its own ** expansion", () => {
    const re = globToRegExp("private-docs/**/*");
    expect(re.test("private-docs/workflows/private/e8/a.html")).toBe(true);
    expect(re.test("private-docs/a.html")).toBe(true);
    expect(re.test("other/a.html")).toBe(false);
  });
});

describe("listRouteTraces", () => {
  it("strips the .js that Next puts before .nft.json", () => {
    const root = fixture({ "about/page.js.nft.json": ["x"], "api/ping/route.js.nft.json": ["y"] });
    expect([...listRouteTraces(root).keys()].sort()).toEqual(["/about", "/api/ping"]);
  });
});

describe("checkTracing", () => {
  it("passes when some built route traced a file matching the include", () => {
    const root = fixture({ "post/[slug]/opengraph-image/route.js.nft.json": ["public/fonts/manrope-og-bold.ttf"] });
    expect(checkTracing(root, { "/post/[slug]/opengraph-image": ["./public/fonts/manrope-og-*.ttf"] }, listRouteTraces(root))).toEqual([]);
  });

  it("passes when the carrier is a route the key's own glob does not name", () => {
    // The real case: "/workflows/private/**" also matches sibling static pages
    // that never read the documents, and only the catch-all lambda traces them.
    const root = fixture({
      "workflows/private/page.js.nft.json": ["node_modules/x/index.js"],
      "workflows/private/[...path]/route.js.nft.json": ["private-docs/workflows/private/e8/a.html"],
    });
    expect(checkTracing(root, { "/workflows/private/**": ["./private-docs/**/*"] }, listRouteTraces(root))).toEqual([]);
  });

  it("fails when the include reaches no route at all", () => {
    const root = fixture({ "post/[slug]/opengraph-image/route.js.nft.json": ["node_modules/x/index.js"] });
    const errors = checkTracing(root, { "/post/[slug]/opengraph-image": ["./public/fonts/manrope-og-*.ttf"] }, listRouteTraces(root));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/is not traced into any of the 1 built routes/);
    expect(errors[0]).toMatch(/check that route's \.nft\.json/);
  });

  it("says so when the key names no built route either", () => {
    const root = fixture({ "about/page.js.nft.json": ["node_modules/x/index.js"] });
    const errors = checkTracing(root, { "/posts/[slug]/opengraph-image": ["./public/fonts/*.ttf"] }, listRouteTraces(root));
    expect(errors[0]).toMatch(/matches no built route by literal name/);
  });
});
