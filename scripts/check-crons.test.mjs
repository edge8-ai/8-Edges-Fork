// The "fires" test for scripts/check-crons.mjs (ADR 0033): its entry point is
// run with `--root` over a fixture tree holding one planted violation per rule
// its header claims, and over a clean twin that must pass. The CLI never runs
// against the working directory: git hooks export GIT_DIR, and a test that
// leans on the cwd can end up reading the real repository.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-crons.mjs");

const tmpDirs = [];
function fixture({ crons, trailingSlash, routes }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-crons-"));
  tmpDirs.push(root);
  fs.writeFileSync(path.join(root, "vercel.json"), JSON.stringify({ crons }));
  fs.writeFileSync(path.join(root, "next.config.mjs"), `export default { trailingSlash: ${trailingSlash} };\n`);
  for (const rel of routes) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), "export async function GET() {}\n");
  }
  return root;
}
function run(root) {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8", env });
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const ROUTES = ["app/api/cron/digest/route.ts", "app/api/cron/sync/route.ts"];

describe("check-crons fires", () => {
  it("passes a clean tree: every path ends in a slash and reaches a route file", () => {
    const res = run(
      fixture({
        trailingSlash: true,
        routes: ROUTES,
        crons: [
          { path: "/api/cron/digest/", schedule: "0 1 * * *" },
          { path: "/api/cron/sync/", schedule: "0 2 * * *" },
        ],
      }),
    );
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("2 cron path(s) OK (trailingSlash: true)");
  });

  it("fails a path with no trailing slash while trailingSlash is on, and a path with no route handler", () => {
    const res = run(
      fixture({
        trailingSlash: true,
        routes: ROUTES,
        crons: [
          { path: "/api/cron/digest", schedule: "0 1 * * *" },
          { path: "/api/cron/renamed/", schedule: "0 3 * * *" },
        ],
      }),
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("2 broken cron path(s)");
    expect(res.stderr).toContain("/api/cron/digest (0 1 * * *) has no trailing slash");
    expect(res.stderr).toContain("/api/cron/renamed/ (0 3 * * *) has no route handler at app/api/cron/renamed/route.ts");
  });

  it("fails a path with a trailing slash while trailingSlash is off, and passes its clean twin", () => {
    const planted = run(
      fixture({ trailingSlash: false, routes: ROUTES, crons: [{ path: "/api/cron/sync/", schedule: "0 2 * * *" }] }),
    );
    expect(planted.status).toBe(1);
    expect(planted.stderr).toContain("/api/cron/sync/ (0 2 * * *) has a trailing slash but trailingSlash is off");

    const clean = run(
      fixture({ trailingSlash: false, routes: ROUTES, crons: [{ path: "/api/cron/sync", schedule: "0 2 * * *" }] }),
    );
    expect(clean.status, clean.stderr).toBe(0);
  });
});
