// Central environment access for server code.
//
// The repo reads ~60 variables straight off `process.env` and, until this module
// existed, a missing one either surfaced as a non-null assertion handing
// `undefined` to a client constructor (an opaque 401 or "Invalid URL" deep
// inside a dependency) or as a silent placeholder. These helpers make the
// failure mode explicit: `requireEnv` throws a message that names the variable
// at the point of first use, so the log line says what to set.
//
// Adoption is deliberately partial: today only the Supabase session client
// (kernel/data/supabase/server.ts), the auth callback route, the two retreats
// form routes and entities/billing/stripe.ts read through these helpers. Every
// other `process.env` read in the repo still goes straight to `process.env`, and
// that is fine — new server code should prefer these helpers over a non-null
// assertion, but existing reads are not being migrated wholesale.
//
// This module is server-only by convention. It deliberately does NOT
// `import "server-only"`: that package is not a direct dependency of this repo
// (Next bundles its own copy, which does not resolve from kernel/ under vitest or
// tsc), and it throws outright in a plain Node test run. Client modules must
// read `NEXT_PUBLIC_*` directly instead — Next inlines those at build time only
// when the literal `NEXT_PUBLIC_*` property access appears in the source,
// which a dynamic `process.env[name]` lookup would defeat.
// kernel/data/supabase/browser.ts is the canonical example and is exempt from
// this module for that reason.

// Returns the variable's value, or throws naming the variable. Use it where the
// code cannot do anything sensible without the value (a client constructor, a
// signing secret). An empty string counts as unset: a blank line in a `.env`
// file is the most common way a "set" variable turns out to be nothing.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// Returns the variable if set and non-empty, else `undefined`. The same
// empty-string rule as `requireEnv`, so callers can write
// `optionalEnv("X") ?? fallback` without a separate blank check.
export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}
