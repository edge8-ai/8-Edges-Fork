// Exercises scripts/check-private-pages.mjs against fixture sources and a
// throwaway tree, so the assertions stay true however many pages the library
// grows; the "real repo passes" check is `check:private-pages` run as a gate.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditPrivatePage, checkPrivatePages, LIBRARY_DIR } from "./check-private-pages.mjs";

const GATED = `import { gatedMetadata, gatedPage } from '../gate'
import Link from 'next/link'

export const generateMetadata = gatedMetadata({
  title: 'X',
})

function Page() {
  return <Link href="/">x</Link>
}

export default gatedPage(Page)
`;

describe("auditPrivatePage", () => {
  it("accepts a page wrapped in gatedPage with gatedMetadata", () => {
    expect(auditPrivatePage(GATED)).toEqual([]);
  });

  it("accepts a page with no metadata at all", () => {
    expect(auditPrivatePage(GATED.replace(/export const generateMetadata[\s\S]*?\n\}\)\n/, ""))).toEqual([]);
  });

  it("rejects a bare default export, sync or async", () => {
    for (const head of ["export default function Page()", "export default async function Page()"]) {
      const src = GATED.replace("function Page()", head).replace("export default gatedPage(Page)\n", "");
      expect(auditPrivatePage(src)).toContain("default export is not wrapped in gatedPage(...)");
    }
  });

  it("rejects a static metadata export", () => {
    const src = GATED.replace("export const generateMetadata = gatedMetadata({", "export const metadata = {").replace("})\n", "}\n");
    expect(auditPrivatePage(src).some((p) => p.startsWith("exports static `metadata`"))).toBe(true);
  });

  it("rejects an ungated generateMetadata", () => {
    const src = GATED.replace(
      /export const generateMetadata[\s\S]*?\n\}\)\n/,
      "export async function generateMetadata() { return { title: 'X' } }\n",
    );
    expect(auditPrivatePage(src)).toContain("exports generateMetadata without gatedMetadata(...)");
  });

  it("rejects a page that wraps but imports gatedPage from somewhere else", () => {
    const src = GATED.replace("from '../gate'", "from '@/lib/somewhere'");
    expect(auditPrivatePage(src)).toContain("does not import gatedPage from the library's gate module");
  });
});

const tmpDirs = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "private-pages-"));
  tmpDirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, LIBRARY_DIR, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

describe("checkPrivatePages", () => {
  it("passes when the library directory is absent (the fork)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "private-pages-"));
    tmpDirs.push(root);
    expect(checkPrivatePages(root)).toEqual({ pages: [], failures: [] });
  });

  it("finds nested pages and reports only the ungated ones", () => {
    const root = fixture({
      "page.tsx": GATED.replace("'../gate'", "'./gate'"),
      "e8/page.tsx": GATED,
      "e8/deep/page.tsx": "export default function Page() { return null }\n",
      "e8/deep/NotAPage.tsx": "export default function X() { return null }\n",
    });
    const { pages, failures } = checkPrivatePages(root);
    expect(pages).toHaveLength(3);
    expect(failures.map((f) => f.file)).toEqual([path.join(LIBRARY_DIR, "e8", "deep", "page.tsx")]);
  });
});
