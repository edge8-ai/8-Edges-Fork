// Point git at the versioned hooks in .githooks/ (runs from `npm install` via
// the `prepare` script). Every clone gets the same pre-commit lint and
// pre-push fork-safety check; nothing depends on a developer remembering.
// Silent outside a git checkout (CI tarballs, the fork's setup agent).
import { spawnSync } from "node:child_process";
const inGit = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
if (inGit.status !== 0 || inGit.stdout.trim() !== "true") process.exit(0);
const r = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { encoding: "utf8" });
if (r.status === 0) console.log("install-hooks: core.hooksPath = .githooks");
