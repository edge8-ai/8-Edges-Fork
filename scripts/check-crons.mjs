// Fails when a vercel.json cron path would 308 instead of reaching its handler.
//
// This exists because every cron in this project was dead for months and
// nothing could see it. next.config sets `trailingSlash: true`, so
// "/api/cron/coaching-cycle" answers 308 with a Location of
// "/api/cron/coaching-cycle/". Vercel's cron invoker sends ONE request and does
// not follow redirects, so the handler never ran. The dashboard showed nine
// healthy schedules the whole time; the only symptom was work silently not
// happening, which is the hardest kind of bug to notice.
//
// Also checks that each path resolves to a route file, so a renamed or deleted
// route cannot leave a cron pointing at a 404.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const vercel = JSON.parse(read("vercel.json"));
const crons = vercel.crons ?? [];
const nextConfig = fs.existsSync(path.join(root, "next.config.mjs"))
  ? read("next.config.mjs")
  : read("next.config.js");
const trailingSlash = /trailingSlash:\s*true/.test(nextConfig);

const errors = [];

for (const { path: p, schedule } of crons) {
  if (trailingSlash && !p.endsWith("/")) {
    errors.push(
      `${p} (${schedule}) has no trailing slash. next.config sets trailingSlash: true, ` +
        `so this answers 308 and the cron never reaches its handler. Use "${p}/".`,
    );
  }
  if (!trailingSlash && p.endsWith("/")) {
    errors.push(`${p} (${schedule}) has a trailing slash but trailingSlash is off.`);
  }
  // "/api/cron/foo/" -> app/api/cron/foo/route.ts
  const segments = p.replace(/^\/+|\/+$/g, "");
  const candidates = ["ts", "js"].map((ext) => path.join(root, "app", segments, `route.${ext}`));
  if (!candidates.some((f) => fs.existsSync(f))) {
    errors.push(`${p} (${schedule}) has no route handler at app/${segments}/route.ts`);
  }
}

if (errors.length > 0) {
  console.error(`\n${errors.length} broken cron path(s) in vercel.json:\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("");
  process.exit(1);
}

console.log(`${crons.length} cron path(s) OK (trailingSlash: ${trailingSlash}).`);
