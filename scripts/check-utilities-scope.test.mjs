// Exercises scripts/check-utilities-scope.mjs against throwaway trees shaped
// like the real one: a thin re-export mount under app/, the markup under
// entities/, the stylesheets and layouts still in app/.
//
// The regression this pins is the gate going blind. Rule 2 used to read each
// app/**/*.tsx file's own text, which was right until the entity move turned
// every one of them into `export { default } from "@/entities/…"` — after
// which the rule inspected files containing no markup at all and passed
// everything. The first two cases below fail on that version of the gate.
//
// The "real repo passes" check is `check:utilities-scope` run as a gate.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectErrors } from "./check-utilities-scope.mjs";

const tmpDirs = [];
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "utilities-scope-"));
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

/** The sheets every tree needs: the two globals the root layout loads, and the
 *  utilities layer that only some route layouts import. */
const SHEETS = {
  "app/styles/tokens.css": ":root { --x: 1px; }\n",
  "app/globals.css": ".site-shell { color: red; }\n",
  "app/styles/utilities.css": ".u-row { display: flex; }\n",
};

const ROOT_LAYOUT = `import "./styles/tokens.css";
import "./globals.css";

export default function RootLayout({ children }) {
  return <html><body className="site-shell">{children}</body></html>;
}
`;

/** A mount is the only thing left under app/ since the entity move: a
 *  re-export of the entity route body. */
const MOUNT = (entity) => `export { default } from "@/entities/${entity}/routes/page";\n`;

const PAGE = (cls) => `export default function Page() {
  return <div className="${cls}">hi</div>;
}
`;

describe("collectErrors — Rule 2 across the mount boundary", () => {
  it("fails a mount whose entity body uses a class the route's layouts never load", () => {
    const root = fixture({
      ...SHEETS,
      "app/layout.tsx": ROOT_LAYOUT,
      "app/bad/page.tsx": MOUNT("bad"),
      "entities/bad/routes/page.tsx": PAGE("u-row"),
    });
    const errors = collectErrors(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("entities/bad/routes/page.tsx");
    expect(errors[0]).toContain('uses "u-row"');
    expect(errors[0]).toContain("layout chain of app/bad/page.tsx");
  });

  it("passes the same body when the route's layout imports the utilities layer", () => {
    const root = fixture({
      ...SHEETS,
      "app/layout.tsx": ROOT_LAYOUT,
      "app/good/layout.tsx": `import "@/app/styles/utilities.css";

export default function Layout({ children }) {
  return <>{children}</>;
}
`,
      "app/good/page.tsx": MOUNT("good"),
      "entities/good/routes/page.tsx": PAGE("u-row"),
    });
    expect(collectErrors(root)).toEqual([]);
  });

  it("follows a component the entity body imports, not only the body itself", () => {
    const root = fixture({
      ...SHEETS,
      "app/layout.tsx": ROOT_LAYOUT,
      "app/bad/page.tsx": MOUNT("bad"),
      "entities/bad/routes/page.tsx": `import { Widget } from "../ui/Widget";

export default function Page() {
  return <Widget />;
}
`,
      "entities/bad/ui/Widget.tsx": `export function Widget() {
  return <span className="u-row">w</span>;
}
`,
    });
    const errors = collectErrors(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("entities/bad/ui/Widget.tsx");
  });

  it("does not blame a page for the rest of a barrel it imports one name from", () => {
    // An entity door re-exports the entity's whole UI. Walking it wholesale
    // would say this page renders the admin board it never mentions, which is
    // how the check drowns in noise instead of finding the real bug.
    const root = fixture({
      ...SHEETS,
      "app/layout.tsx": ROOT_LAYOUT,
      "app/site/page.tsx": MOUNT("site"),
      "entities/site/routes/page.tsx": `import { Header } from "@/entities/kit";

export default function Page() {
  return <Header />;
}
`,
      "entities/kit/index.ts": `export * from "./ui/Header";
export * from "./ui/Board";
`,
      "entities/kit/ui/Header.tsx": `export function Header() {
  return <h1 className="site-shell">h</h1>;
}
`,
      "entities/kit/ui/Board.tsx": `export function Board() {
  return <div className="u-row">b</div>;
}
`,
    });
    expect(collectErrors(root)).toEqual([]);
  });

  it("still blames the barrel's component when the page really imports it", () => {
    const root = fixture({
      ...SHEETS,
      "app/layout.tsx": ROOT_LAYOUT,
      "app/site/page.tsx": MOUNT("site"),
      "entities/site/routes/page.tsx": `import { Board } from "@/entities/kit";

export default function Page() {
  return <Board />;
}
`,
      "entities/kit/index.ts": `export * from "./ui/Header";
export * from "./ui/Board";
`,
      "entities/kit/ui/Header.tsx": `export function Header() {
  return <h1 className="site-shell">h</h1>;
}
`,
      "entities/kit/ui/Board.tsx": `export function Board() {
  return <div className="u-row">b</div>;
}
`,
    });
    const errors = collectErrors(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("entities/kit/ui/Board.tsx");
  });

  it("ignores test files under app/, which are not routes", () => {
    const root = fixture({
      ...SHEETS,
      "app/layout.tsx": ROOT_LAYOUT,
      "app/__tests__/route-boundaries.test.tsx": MOUNT("bad"),
      "entities/bad/routes/page.tsx": PAGE("u-row"),
    });
    expect(collectErrors(root)).toEqual([]);
  });
});

describe("collectErrors — Rule 1", () => {
  it("fails a component the root layout renders that uses a non-global class", () => {
    const root = fixture({
      ...SHEETS,
      "app/layout.tsx": `import "./styles/tokens.css";
import "./globals.css";
import { SiteFrame } from "@/entities/site";

export default function RootLayout({ children }) {
  return <html><body><SiteFrame>{children}</SiteFrame></body></html>;
}
`,
      "entities/site/index.ts": `export * from "./ui/SiteFrame";\n`,
      "entities/site/ui/SiteFrame.tsx": `export function SiteFrame({ children }) {
  return <div className="u-row">{children}</div>;
}
`,
    });
    const errors = collectErrors(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("rendered by the root layout");
  });

  // The generated app/shell.ts aliases each slot's provider: the root takes
  // SiteFrame from it, and a page slot's provider (the member's claims, a
  // trip's cost) renders only on the page that takes the slot.
  const SHELL_TREE = (frameClass) => ({
    ...SHEETS,
    "app/layout.tsx": `import "./styles/tokens.css";
import "./globals.css";
import { SiteFrame } from "@/app/shell";

export default function RootLayout({ children }) {
  return <html><body><SiteFrame>{children}</SiteFrame></body></html>;
}
`,
    "app/shell.ts": `import type { PanelSlot } from "@/kernel/shell/page-slots";
import { Panel as PanelProvided } from "@/entities/claims";
import { SiteFrame as SiteFrameProvided } from "@/entities/site";

export const Panel: PanelSlot = PanelProvided;
export const SiteFrame: ((props: { children: unknown }) => unknown) | null = SiteFrameProvided;
`,
    "entities/claims/index.ts": `export * from "./ui/Panel";\n`,
    "entities/claims/ui/Panel.tsx": `export function Panel() {
  return <div className="u-row">claims</div>;
}
`,
    "entities/site/index.ts": `export * from "./ui/SiteFrame";\n`,
    "entities/site/ui/SiteFrame.tsx": `export function SiteFrame({ children }) {
  return <div className="${frameClass}">{children}</div>;
}
`,
  });

  it("does not blame the root for a page slot's provider the generated shell also aliases", () => {
    expect(collectErrors(fixture(SHELL_TREE("site-shell")))).toEqual([]);
  });

  it("still follows the alias the root does take from the shell", () => {
    const errors = collectErrors(fixture(SHELL_TREE("u-row")));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("entities/site/ui/SiteFrame.tsx");
  });
});
