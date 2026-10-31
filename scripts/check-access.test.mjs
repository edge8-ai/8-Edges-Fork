// The "fires" test for scripts/check-access.mjs (ADR 0033): its entry point is
// run with `--root` over a fixture tree holding one planted violation for each
// rule its header claims, and over a clean twin that must pass. The helpers it
// composes have tests of their own (check-access-may.test.mjs and the
// access-declarations tests); this file proves main() calls them.
//
// The CLI never runs against the working directory, and git is run with
// GIT_DIR removed: git hooks export it, and a test that leans on the cwd or on
// an inherited GIT_DIR can end up reading the real repository.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-access.mjs");
const BASELINE = "scripts/access-baseline.json";
const MAY_ALLOWLIST = "scripts/access-may-allowlist.json";

const env = { ...process.env, EDGE8_DEPLOYMENT: "edge8" };
delete env.GIT_DIR;
delete env.GIT_WORK_TREE;

/** One entity's permissions.ts, in the strict format access-declarations.mjs parses. */
function permissionsTs({ atoms, routes, actions }) {
  const section = (name, entries) =>
    `  ${name}: {\n${Object.entries(entries)
      .map(([k, v]) => `    "${k}": "${v}",\n`)
      .join("")}  },\n`;
  return (
    'import type { EntityPermissions } from "@/kernel/identity/permission-declaration";\n\n' +
    "export const permissions: EntityPermissions = {\n" +
    section("permissions", Object.fromEntries(atoms.map((a) => [a, "Work the deals"]))) +
    section("holders", Object.fromEntries(atoms.map((a) => [a, "admin"]))) +
    section("routes", routes) +
    section("actions", actions) +
    "  implies: {},\n};\n"
  );
}

const DEALS_PAGE = "routes/admin/(dashboard)/deals/page";
const DEAL_ACTIONS = "lib/deal-actions";

/**
 * The clean tree: one declared page, one declared action file, one action file
 * whose only export is public (on the action-auth allowlist), and a client
 * component that calls the declared action and takes a MayProp.
 */
const CLEAN = {
  "entities.manifest.json": JSON.stringify({
    kernel: { target: "kernel", current: ["kernel"], tables: [] },
    entities: {
      contacts: { target: "entities/contacts", current: ["entities/contacts"], tables: [], portability: "portable", requires: [] },
      crm: { target: "entities/crm", current: ["entities/crm"], tables: [], portability: "portable", requires: [] },
    },
  }),
  "deployments/edge8.json": JSON.stringify({ name: "edge8", entities: ["crm"] }),
  "entities/crm/permissions.ts": permissionsTs({
    atoms: ["crm.deals"],
    routes: { [DEALS_PAGE]: "crm.deals" },
    actions: { [DEAL_ACTIONS]: "crm.deals" },
  }),
  [`entities/crm/${DEALS_PAGE}.tsx`]: "export default function Page() { return null; }\n",
  [`entities/crm/${DEAL_ACTIONS}.ts`]: '"use server";\n\nexport async function saveDeal() {}\n',
  "entities/crm/lib/public-actions.ts": '"use server";\n\nexport async function requestLink() {}\n',
  "scripts/action-auth-allowlist.json": JSON.stringify([
    { file: "entities/crm/lib/public-actions.ts", export: "requestLink", reason: "Sign-in flow, reachable before sign-in." },
  ]),
  "entities/crm/ui/DealButton.tsx":
    '"use client";\n\nimport type { MayProp } from "@/kernel/identity/may-prop";\nimport { saveDeal } from "../lib/deal-actions";\n\n' +
    "export function DealButton({ may }: { may: MayProp }) { return may ? saveDeal : null; }\n",
  [BASELINE]: JSON.stringify({ why: "fixture", routes: [], actions: [] }),
  [MAY_ALLOWLIST]: JSON.stringify({ why: "fixture", entries: [] }),
};

const tmpDirs = [];
function fixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-access-"));
  tmpDirs.push(root);
  for (const [rel, body] of Object.entries({ ...CLEAN, ...overrides })) {
    if (body === null) continue;
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}
function run(root) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8", env });
}
/** Commits the tree and points origin/main at it, so the lists have a committed copy to only shrink from. */
function commitAsMain(root) {
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=fixture", "-c", "user.email=fixture@example.com", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args],
      { cwd: root, env, stdio: "ignore" },
    );
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "main");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
}
const write = (root, rel, body) => fs.writeFileSync(path.join(root, rel), body);
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("check-access fires", () => {
  it("passes the clean tree: every page and action file declared, the client component takes a MayProp", () => {
    const res = run(fixture());
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("1 signed-in page(s), 1 declared, 0 on the baseline");
    expect(res.stdout).toContain("1 server-action file(s), 1 declared");
  });

  it("fails an undeclared page and action file, an invalid declaration, stale baseline entries and an unhidden action call", () => {
    const res = run(
      fixture({
        // An invalid declaration: an atom outside the entity's own namespace.
        "entities/crm/permissions.ts": permissionsTs({
          atoms: ["crm.deals", "deals.export"],
          routes: { [DEALS_PAGE]: "crm.deals" },
          actions: { [DEAL_ACTIONS]: "crm.deals" },
        }),
        "entities/crm/routes/admin/(dashboard)/reports/page.tsx": "export default function Page() { return null; }\n",
        "entities/crm/lib/report-actions.ts": '"use server";\n\nexport async function exportReport() {}\n',
        // Both entries are declared now, so they are stale on a list that only shrinks.
        [BASELINE]: JSON.stringify({
          why: "fixture",
          routes: ["app/admin/(dashboard)/deals/page.tsx"],
          actions: ["entities/crm/lib/deal-actions.ts"],
        }),
        "entities/crm/ui/ExportButton.tsx":
          '"use client";\n\nimport { exportReport } from "../lib/report-actions";\n\nexport function ExportButton() { return exportReport; }\n',
      }),
    );
    expect(res.status).toBe(1);
    const err = res.stderr;
    expect(err).toContain('crm: atom "deals.export" must start with "crm."');
    expect(err).toContain("app/admin/(dashboard)/reports/page.tsx: a signed-in page with no permission declared");
    expect(err).toContain("entities/crm/lib/report-actions.ts: a server-action file with no permission declared");
    expect(err).toContain(`app/admin/(dashboard)/deals/page.tsx: on ${BASELINE} but declared, or no longer there`);
    expect(err).toContain(`entities/crm/lib/deal-actions.ts: on ${BASELINE} but declared, or no longer there`);
    expect(err).toContain(
      "entities/crm/ui/ExportButton.tsx: a client component calling entities/crm/lib/report-actions.ts#exportReport without the hidden-control convention",
    );
  });

  it("fails a hidden-control allowlist entry whose file now takes a MayProp", () => {
    const res = run(
      fixture({ [MAY_ALLOWLIST]: JSON.stringify({ why: "fixture", entries: [{ file: "entities/crm/ui/DealButton.tsx", reason: "old" }] }) }),
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(`entities/crm/ui/DealButton.tsx: on ${MAY_ALLOWLIST} but no longer calls an action without a MayProp`);
  });

  it("fails a baseline entry for a missing page upstream, and lets the public fork keep it", () => {
    const missing = { [BASELINE]: JSON.stringify({ why: "fixture", routes: ["app/admin/(dashboard)/gone/page.tsx"], actions: [] }) };

    const upstream = run(fixture({ ...missing, ".github/fork-overlay/README.md": "overlay\n" }));
    expect(upstream.status).toBe(1);
    expect(upstream.stderr).toContain(`app/admin/(dashboard)/gone/page.tsx: on ${BASELINE} but declared, or no longer there`);

    const fork = run(fixture(missing));
    expect(fork.status, fork.stderr).toBe(0);
  });

  it("fails an entry added to either list that origin/main does not carry, and passes the committed lists", () => {
    const root = fixture({
      "entities/crm/routes/admin/(dashboard)/reports/page.tsx": "export default function Page() { return null; }\n",
      "entities/crm/lib/report-actions.ts": '"use server";\n\nexport async function exportReport() {}\n',
      "entities/crm/ui/ExportButton.tsx":
        '"use client";\n\nimport { exportReport } from "../lib/report-actions";\n\nexport function ExportButton() { return exportReport; }\n',
    });
    commitAsMain(root);
    // On main the three files are undeclared and on no list; the clean twin is
    // main itself with every one of them declared instead.
    const declared = permissionsTs({
      atoms: ["crm.deals"],
      routes: { [DEALS_PAGE]: "crm.deals", "routes/admin/(dashboard)/reports/page": "crm.deals" },
      actions: { [DEAL_ACTIONS]: "crm.deals", "lib/report-actions": "crm.deals" },
    });

    write(root, BASELINE, JSON.stringify({ why: "fixture", routes: ["app/admin/(dashboard)/reports/page.tsx"], actions: ["entities/crm/lib/report-actions.ts"] }));
    write(root, MAY_ALLOWLIST, JSON.stringify({ why: "fixture", entries: [{ file: "entities/crm/ui/ExportButton.tsx", reason: "new" }] }));
    const added = run(root);
    expect(added.status).toBe(1);
    expect(added.stderr).toContain(`app/admin/(dashboard)/reports/page.tsx: added to ${BASELINE}, which only shrinks`);
    expect(added.stderr).toContain(`entities/crm/lib/report-actions.ts: added to ${BASELINE}, which only shrinks`);
    expect(added.stderr).toContain(`entities/crm/ui/ExportButton.tsx: added to ${MAY_ALLOWLIST}, which only shrinks`);

    write(root, BASELINE, CLEAN[BASELINE]);
    write(root, MAY_ALLOWLIST, CLEAN[MAY_ALLOWLIST]);
    write(root, "entities/crm/permissions.ts", declared);
    write(
      root,
      "entities/crm/ui/ExportButton.tsx",
      '"use client";\n\nimport type { MayProp } from "@/kernel/identity/may-prop";\nimport { exportReport } from "../lib/report-actions";\n\n' +
        "export function ExportButton({ may }: { may: MayProp }) { return may ? exportReport : null; }\n",
    );
    const clean = run(root);
    expect(clean.status, clean.stderr).toBe(0);
  });
});
