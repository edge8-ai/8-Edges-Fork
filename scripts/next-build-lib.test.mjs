import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildNodeOptions,
  containerMemory,
  largestProcess,
  oomKills,
  phaseStartedBy,
  leftoverWebpackCache,
  shouldClearCache,
  turbopackCaches,
} from "./next-build-lib.mjs";

const dirs = [];
const tempDir = () => {
  const d = mkdtempSync(path.join(tmpdir(), "next-build-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});
const file = (p, mb) => {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, Buffer.alloc(mb * 1048576));
};

describe("buildNodeOptions", () => {
  it("replaces Vercel's underscore spelling with the build's heap", () => {
    expect(buildNodeOptions("--max_old_space_size=8192", 4096)).toBe("--max-old-space-size=4096");
  });

  it("keeps every other option and removes every heap flag, whatever its spelling", () => {
    expect(buildNodeOptions("--enable-source-maps --max-old-space-size=2048 --max_old-space_size=16000", 4096))
      .toBe("--enable-source-maps --max-old-space-size=4096");
  });

  it("works with nothing inherited", () => {
    expect(buildNodeOptions(undefined, 4096)).toBe("--max-old-space-size=4096");
    expect(buildNodeOptions("", 4096)).toBe("--max-old-space-size=4096");
  });
});

describe("turbopackCaches and shouldClearCache", () => {
  // Next 16 builds with Turbopack (B.18.3), which keeps its build cache in one
  // folder per Next version under .next/cache/turbopack. A folder a previous
  // Next version left behind is never read again but is restored with the
  // rest, so every folder counts towards the limit.
  it("measures every version's folder, the stale ones included", () => {
    const cache = tempDir();
    file(path.join(cache, "v16.3.8-b0fad0d4", "data.sst"), 2);
    file(path.join(cache, "v16.3.7-a1b2c3d4", "data.sst"), 1);
    const caches = turbopackCaches(cache);
    expect(caches.map((c) => c.name).sort()).toEqual(["v16.3.7-a1b2c3d4", "v16.3.8-b0fad0d4"]);
    expect(shouldClearCache(caches, 2500)).toEqual({ totalMb: 3, clear: false });
  });

  it("clears only when the folders together pass the limit", () => {
    const caches = [{ name: "v16.3.8-b0fad0d4", mb: 2000 }, { name: "v16.3.7-a1b2c3d4", mb: 600 }];
    expect(shouldClearCache(caches, 2500)).toEqual({ totalMb: 2600, clear: true });
    expect(shouldClearCache(caches, 2600).clear).toBe(false);
  });

  it("finds the webpack cache an older Next left, so the build can drop it", () => {
    const cache = tempDir();
    file(path.join(cache, "webpack", "server-production", "0.pack"), 3);
    expect(leftoverWebpackCache(cache)).toEqual({ path: path.join(cache, "webpack"), mb: 3 });
    expect(leftoverWebpackCache(tempDir())).toBeNull();
  });

  it("finds nothing when there is no cache yet", () => {
    expect(turbopackCaches(path.join(tempDir(), "missing"))).toEqual([]);
    expect(shouldClearCache([], 2500)).toEqual({ totalMb: 0, clear: false });
  });
});

describe("phaseStartedBy", () => {
  it("names the phase each of Next's progress lines starts", () => {
    expect(phaseStartedBy("   Creating an optimized production build ...")).toBe("compile");
    expect(phaseStartedBy("   Linting and checking validity of types ...")).toBe("types");
    expect(phaseStartedBy("   Checking validity of types ...")).toBe("types");
    expect(phaseStartedBy("   Collecting page data ...")).toBe("pages");
    expect(phaseStartedBy(" ✓ Compiled successfully")).toBeNull();
  });

  // Lines copied from the first Next 16.3.8 production build (B.18.3). Next 16
  // renamed the type-check line; a matcher that misses it files every
  // type-check sample under compile and the [build] line's per-phase figures
  // are wrong with no error, so the whole log is walked as the runner walks it.
  const NEXT_16_LOG = [
    "▲ Next.js 16.3.8 (Turbopack)",
    "  Creating an optimized production build ...",
    "✓ Compiled successfully in 17.2s",
    "  Running TypeScript ...",
    "  Finished TypeScript in 24.4s ...",
    "  Collecting page data using 7 workers ...",
    "  Generating static pages using 7 workers (0/227) ...",
    "✓ Generating static pages using 7 workers (227/227) in 3.8s",
  ];

  it("follows a Next 16 build through compile, types and pages, in order", () => {
    const seen = [];
    let phase = "setup";
    for (const line of NEXT_16_LOG) {
      const next = phaseStartedBy(line) ?? phase;
      if (next !== phase) seen.push(next);
      phase = next;
    }
    expect(seen).toEqual(["compile", "types", "pages"]);
  });
});

describe("containerMemory and oomKills", () => {
  it("reads program memory, not the total that includes droppable file cache", () => {
    const cg = tempDir();
    writeFileSync(path.join(cg, "memory.stat"), `anon ${3486 * 1048576}\nfile ${2527 * 1048576}\n`);
    writeFileSync(path.join(cg, "memory.max"), `${8192 * 1048576}\n`);
    writeFileSync(path.join(cg, "memory.events"), "low 0\nhigh 0\nmax 0\noom 0\noom_kill 2\n");
    expect(containerMemory(cg)).toEqual({ anonMb: 3486, limitMb: 8192 });
    expect(oomKills(cg)).toBe(2);
  });

  it("returns null where there is no cgroup, so a laptop build just skips sampling", () => {
    const none = path.join(tempDir(), "no-cgroup");
    expect(containerMemory(none)).toBeNull();
    expect(oomKills(none)).toBeNull();
  });
});

describe("largestProcess", () => {
  it("names the largest process by its script", () => {
    const proc = tempDir();
    const pid = (n, kb, cmd) => {
      mkdirSync(path.join(proc, n));
      writeFileSync(path.join(proc, n, "status"), `Name:\tnode\nVmRSS:\t${kb} kB\n`);
      writeFileSync(path.join(proc, n, "cmdline"), cmd.join("\0"));
    };
    pid("11", 204800, ["node", "/vercel/path0/node_modules/.bin/next", "build"]);
    pid("12", 3338240, ["node", "--max-old-space-size=4096", "/vercel/path0/node_modules/jest-worker/build/workers/processChild.js"]);
    mkdirSync(path.join(proc, "self"));
    expect(largestProcess(proc)).toEqual({ label: "processChild.js", mb: 3260 });
  });

  it("returns null where there is no /proc", () => {
    expect(largestProcess(path.join(tempDir(), "no-proc"))).toBeNull();
  });
});
