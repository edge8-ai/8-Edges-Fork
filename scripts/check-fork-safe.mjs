// Would the tree as it stands leave for the public fork? Stage it the way the
// mirror does and run the content scanner over the result, locally and in CI,
// before a merge rather than after one.
//
// Why: the mirror runs nightly against main and fails closed, which protects
// the fork but blocks it. PR #1273 wrote a private-library path into a shared
// UI component; nothing before the merge looked, the mirror refused the tree,
// and every later sync was blocked until someone noticed. Both scripts are the
// mirror's own (stage-fork-tree.sh, scan-tree.sh), so this answers exactly the
// question the workflow will ask.
//
// It also refuses a stranded overlay stub (W.163, B14). Some files hold values
// the scanner would refuse — entities/company-os/lib/vercel-analytics-project.ts
// carries literal Vercel ids — and pass only because .github/fork-overlay/
// drops a stub at the same path. If the file moves and its stub does not, the
// staged tree gets the real file at its new path and the stub at a path nothing
// imports. The scan below would then fail too, but only for files whose content
// the scanner recognises, and with a message that names the content rather
// than the move. So before staging, every stub under a code root must still
// sit on a file the upstream tree has.
//
//   npm run check:fork-safe
//
// Exit 1 with the scanner's report when the tree may not leave.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OVERLAY_DIR = ".github/fork-overlay";

// An overlay file under one of these roots is a stub: it exists to replace an
// upstream module of the same path, so it must have one. Everything else in the
// overlay (the fork's README runbook, its supabase/ schema dump and config) is
// content the fork gets and this repo does not have, so its upstream path is
// allowed to be absent.
const STUB_ROOTS = ["app/", "entities/", "kernel/"];

function overlayFiles(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...overlayFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

/**
 * Overlay stubs whose upstream path no longer exists, as repo-relative paths.
 * Each one is a stub that neutralises nothing, and usually a file that moved
 * without it.
 */
export function strandedOverlayStubs(root) {
  const overlay = join(root, OVERLAY_DIR);
  if (!existsSync(overlay)) return [];
  return overlayFiles(overlay)
    .filter((rel) => STUB_ROOTS.some((r) => rel.startsWith(r)))
    .filter((rel) => !existsSync(join(root, rel)))
    .sort();
}

function main(root) {
  const stranded = strandedOverlayStubs(root);
  if (stranded.length > 0) {
    console.error(
      "check-fork-safe: these fork overlay stubs replace a file the tree no longer has:\n" +
        stranded.map((rel) => `  ${OVERLAY_DIR}/${rel}`).join("\n") +
        "\n\nThe stub keeps an internal value out of the public fork only while it sits at the same path as the real " +
        "file. If the file moved, move its stub to the new path in the same change; if the file was deleted, delete " +
        "the stub. Otherwise the real file ships under its new path and the mirror refuses the tree.",
    );
    process.exit(1);
  }

  const dest = mkdtempSync(join(tmpdir(), "fork-safe-"));
  try {
    const staged = spawnSync("bash", [join(root, ".github/scripts/stage-fork-tree.sh"), dest, root], { encoding: "utf8" });
    if (staged.status !== 0) {
      process.stderr.write(staged.stderr || staged.stdout);
      console.error("check-fork-safe: could not stage the fork tree.");
      process.exit(1);
    }
    const scan = spawnSync("bash", [join(root, ".github/scripts/scan-tree.sh"), dest, "--allow-published-marketing"], { encoding: "utf8" });
    const out = `${scan.stdout}${scan.stderr}`.replace(/^::error::/gm, "");
    if (scan.status !== 0) {
      process.stderr.write(out);
      console.error(
        "\ncheck-fork-safe: this tree would be refused by the fork sync. Fix the lines above before merging: a private route or",
        "internal value belongs in a module the fork overlay stubs (see entities/org/lib/onboarding-deck.ts), or in a path on",
        ".github/fork-sync-exclude.txt.",
      );
      process.exit(1);
    }
    console.log("check-fork-safe: the staged fork tree passes the content scanner.");
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

// Run only as a script, so the test can import strandedOverlayStubs without
// staging and scanning the whole tree. The argv path is resolved first because
// Node gives the module its real path, and macOS's temp directory is a symlink.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(join(dirname(fileURLToPath(import.meta.url)), ".."));
}
