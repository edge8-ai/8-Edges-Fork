// The service-role Company OS client for operator scripts run from a terminal,
// reading the env the app uses (SUPABASE_URL, SUPABASE_SECRET_KEY) from the
// environment or .env.local.
//
// It lived in scripts/board/lib.mjs, the workboard bridge, which the fork sync
// excludes. scripts/access-sync.mjs imported it from there, so a fork's first
// `npm run access:sync`, the step its runbook relies on to write the default
// access holders, failed with "Cannot find module './board/lib.mjs'". It is
// here so both can import it and the one that ships still runs.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadEnv(cwd = process.cwd()) {
  const file = path.join(cwd, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export function companyOsClient() {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (env or .env.local).");
  }
  return createClient(url, key, { db: { schema: "company_os" } });
}
