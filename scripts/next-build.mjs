// `npm run build` (card B.17): runs `next build` with a heap Node can live in
// and a build cache that cannot grow without bound (Turbopack's since Next 16,
// B.18.3; webpack's before), and says afterwards how
// close the build came to the machine's memory limit. The reasons and the
// measurements are in next-build-lib.mjs.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import {
  buildNodeOptions,
  containerMemory,
  largestProcess,
  leftoverWebpackCache,
  oomKills,
  phaseStartedBy,
  shouldClearCache,
  turbopackCaches,
} from "./next-build-lib.mjs";

const HEAP_MB = 4096;
const CACHE_LIMIT_MB = 2500;
const CACHE_DIR = ".next/cache/turbopack";
const SAMPLE_MS = 2000;

// Webpack's cache from a pre-Next 16 build is dead weight that Vercel keeps
// restoring; it goes once, here, and the [build] line says how much it was.
const webpack = leftoverWebpackCache(".next/cache");
if (webpack) rmSync(webpack.path, { recursive: true, force: true });

const caches = turbopackCaches(CACHE_DIR);
const { totalMb, clear } = shouldClearCache(caches, CACHE_LIMIT_MB);
if (clear) for (const cache of caches) rmSync(cache.path, { recursive: true, force: true });
const sizes = caches.map((c) => `${c.name} ${c.mb}`).join(", ") || "none";
console.log(`[build] heap ${HEAP_MB} MB per process (NODE_OPTIONS inherited: ${JSON.stringify(process.env.NODE_OPTIONS ?? "")}); Turbopack build cache ${totalMb} MB (${sizes})${clear ? `, over ${CACHE_LIMIT_MB} MB: cleared, this build runs cold` : ""}${webpack ? `; removed a leftover webpack cache of ${webpack.mb} MB` : ""}`);

// Program memory by phase, and the process that held the most at each peak.
let phase = "setup";
const peaks = {};
const sample = () => {
  const mem = containerMemory();
  if (!mem) return;
  const top = largestProcess();
  const prev = peaks[phase];
  if (!prev || mem.anonMb > prev.anonMb) peaks[phase] = { anonMb: mem.anonMb, limitMb: mem.limitMb, top };
};
const timer = containerMemory() ? setInterval(sample, SAMPLE_MS) : null;

const child = spawn("next", ["build", ...process.argv.slice(2)], {
  stdio: ["inherit", "pipe", "inherit"],
  env: { ...process.env, NODE_OPTIONS: buildNodeOptions(process.env.NODE_OPTIONS, HEAP_MB) },
});
let pending = "";
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  pending += chunk.toString();
  const lines = pending.split("\n");
  pending = lines.pop() ?? "";
  for (const line of lines) phase = phaseStartedBy(line) ?? phase;
});

child.on("exit", (code, signal) => {
  if (timer) {
    clearInterval(timer);
    sample();
    const worst = Object.entries(peaks).sort((a, b) => b[1].anonMb - a[1].anonMb)[0];
    const limit = worst?.[1].limitMb;
    const byPhase = ["compile", "types", "pages"].filter((p) => peaks[p]).map((p) => `${p} ${peaks[p].anonMb}`).join(", ");
    const tsc = peaks.types?.top;
    if (worst) {
      const [name, peak] = worst;
      console.log(`[build] program memory peak ${peak.anonMb}${limit ? ` of ${limit}` : ""} MB during ${name} (largest process ${peak.top ? `${peak.top.label} ${peak.top.mb} MB` : "?"}); by phase: ${byPhase}; type-check largest process ${tsc ? `${tsc.mb} MB` : "?"}; out-of-memory kills ${oomKills() ?? "?"}`);
    }
  } else {
    console.log("[build] memory sampling needs Linux cgroup v2; skipped on this machine");
  }
  if (signal) console.error(`[build] next build was stopped by ${signal}`);
  process.exit(code ?? 1);
});
