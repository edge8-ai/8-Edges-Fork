// The decisions behind `npm run build` (card B.17), kept apart from the runner
// in next-build.mjs so each can be tested without running a build.
//
// Measured on Vercel on 28 Sep 2026 (report: claude.ai/artifact/9ZsbaKynAu5Km1HXBnjLV5):
// Vercel sets NODE_OPTIONS=--max_old_space_size=8192 inside an 8,192 MB build
// container, and the webpack cache it restores had grown to 4,464 MB against
// the 1,376 MB one cold build writes. Together they let the server-compile
// worker reach 7,071 MB. A 4,096 MB heap and a cache bounded at 2,500 MB
// brought it to 3,486 MB.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Any spelling V8 accepts: --max-old-space-size, --max_old_space_size, mixed.
const HEAP_FLAG = /--max[-_]old[-_]space[-_]size=\d+/g;

// NODE_OPTIONS for the build: whatever the platform set, with its heap flag
// replaced by ours. Every Node process in the build inherits it (Next 14.2's
// attempt to strip it from the page workers is overridden by its own worker
// code), so this is a per-process ceiling.
export function buildNodeOptions(inherited, heapMb) {
  const rest = (inherited ?? "").replace(HEAP_FLAG, "").replace(/\s+/g, " ").trim();
  return `${rest} --max-old-space-size=${heapMb}`.trim();
}

// Size of a folder in whole MB, walked in Node so the build needs no shell tools.
export function folderMb(dir) {
  const walk = (d) => {
    let bytes = 0;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      bytes += entry.isDirectory() ? walk(p) : statSync(p).size;
    }
    return bytes;
  };
  return Math.round(walk(dir) / 1048576);
}

// The folders in Turbopack's build cache, one per Next version
// (.next/cache/turbopack/v16.3.8-<hash>). Next 16 builds with Turbopack and
// keeps this cache by default (B.18.3); it replaced webpack's production packs,
// which this guard measured until then. A folder an older Next left behind is
// never read again, but Vercel restores it with the rest, so each one counts.
// Measured on the first Next 16 builds: 786 MB cold, 794 MB after a warm
// rebuild, where webpack's grew from 1,376 MB to 4,464 MB.
export function turbopackCaches(cacheDir) {
  let entries;
  try {
    entries = readdirSync(cacheDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, path: path.join(cacheDir, e.name), mb: folderMb(path.join(cacheDir, e.name)) }));
}

// The webpack cache a Next 14 or 15 build left in .next/cache/webpack, or null.
// No build writes it since Next 16 builds with Turbopack (B.18.3), but Vercel
// restores the whole of .next/cache on every build, so packs the old guard let
// reach 2,500 MB would ride along forever unless something deletes them.
export function leftoverWebpackCache(cacheRoot) {
  const dir = path.join(cacheRoot, "webpack");
  try {
    if (!statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  return { path: dir, mb: folderMb(dir) };
}

// Whether to start the build cache fresh: only when its folders together
// outgrow the limit. Webpack kept unused entries for 60 days and the cache only
// grew; Turbopack's grows slowly, but a Next upgrade leaves a whole folder
// behind each time, so the bound stays.
export function shouldClearCache(packs, limitMb) {
  const totalMb = packs.reduce((sum, p) => sum + p.mb, 0);
  return { totalMb, clear: totalMb > limitMb };
}

// Which phase of `next build` a line of its output starts, if any. Next 16
// prints "Running TypeScript" where 14 and 15 printed "Checking validity of
// types" (B.18.3); both stay, so a fallback to an older build still labels.
export function phaseStartedBy(line) {
  if (line.includes("Creating an optimized production build")) return "compile";
  if (
    line.includes("Running TypeScript") ||
    line.includes("Linting and checking validity of types") ||
    line.includes("Checking validity of types")
  )
    return "types";
  if (line.includes("Collecting page data")) return "pages";
  return null;
}

// The container's program memory (cgroup v2 `anon`): what the kernel cannot
// drop, so what predicts an out-of-memory kill. `memory.peak` is not used for
// this because it also counts droppable file cache. Null off Linux.
export function containerMemory(root = "/sys/fs/cgroup") {
  try {
    const stat = readFileSync(path.join(root, "memory.stat"), "utf8");
    const anon = Number(stat.match(/^anon (\d+)$/m)?.[1] ?? NaN);
    const max = readFileSync(path.join(root, "memory.max"), "utf8").trim();
    if (!Number.isFinite(anon)) return null;
    return { anonMb: Math.round(anon / 1048576), limitMb: max === "max" ? null : Math.round(Number(max) / 1048576) };
  } catch {
    return null;
  }
}

// How many times the kernel killed a process in this container for memory.
export function oomKills(root = "/sys/fs/cgroup") {
  try {
    return Number(readFileSync(path.join(root, "memory.events"), "utf8").match(/^oom_kill (\d+)$/m)?.[1] ?? 0);
  } catch {
    return null;
  }
}

// The largest process in the container by resident memory, e.g.
// { label: "processChild.js", mb: 3256 }. Null off Linux.
export function largestProcess(proc = "/proc") {
  let best = null;
  let pids;
  try {
    pids = readdirSync(proc).filter((d) => /^\d+$/.test(d));
  } catch {
    return null;
  }
  for (const pid of pids) {
    try {
      const rss = readFileSync(path.join(proc, pid, "status"), "utf8").match(/^VmRSS:\s+(\d+) kB$/m);
      if (!rss) continue;
      const mb = Math.round(Number(rss[1]) / 1024);
      if (best && mb <= best.mb) continue;
      const args = readFileSync(path.join(proc, pid, "cmdline"), "utf8").split("\0").filter(Boolean);
      const script = args.slice(1).find((a) => !a.startsWith("-"));
      best = { label: path.basename(script ?? args[0] ?? "?"), mb };
    } catch {
      // A process can exit between the listing and the read.
    }
  }
  return best;
}
