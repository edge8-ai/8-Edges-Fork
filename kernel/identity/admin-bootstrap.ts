// The ADMIN_ALLOWLIST env var is a bootstrap: it lets the first admin into a
// fresh deployment before any Admin grant exists, holding Admin and Super Admin
// so they can grant the first roles in Settings, Access (admin-auth.ts). It is
// not a second register of admins: an env admin has no person, no grant and no
// audit row, and on 2026-10-03 one such admin turned out to have no identity
// behind him at all (B.28). So once an Admin grant exists, a non-empty
// allowlist grants nothing and is a leftover, and the app says so at boot
// (instrumentation.ts) until it is emptied.
import { adminGrantsByEmail, envAllowlist, liveGrantCount } from "./admin-register";

/**
 * The warning to show when the allowlist is still set although Admin grants
 * exist, or null when there is nothing to say. Pure, so the wording is tested;
 * the callers supply the facts.
 */
export function allowlistBootstrapMessage(
  envEmails: readonly string[],
  adminGrantCount: number,
  ungranted: readonly string[] = [],
): string | null {
  if (envEmails.length === 0 || adminGrantCount === 0) return null;
  const list = [...envEmails].sort().join(", ");
  // An address with no grant of its own has no way into the Admin view now; it
  // is named so nobody mistakes the allowlist for the reason they can sign in.
  const missing =
    ungranted.length === 0
      ? ""
      : ` ${ungranted.length === 1 ? "This address has" : "These addresses have"} no Admin grant in Settings, Access, so ` +
        `${ungranted.length === 1 ? "it" : "they"} cannot enter the Admin view: ${[...ungranted].sort().join(", ")}.`;
  return (
    `ADMIN_ALLOWLIST is set (${list}) while ${adminGrantCount} ${adminGrantCount === 1 ? "Admin grant exists" : "Admin grants exist"}; ` +
    "it is bootstrap only and grants nothing now; empty it on Vercel and redeploy." +
    missing
  );
}

/**
 * Every ADMIN_ALLOWLIST address without an Admin grant, read from the env the
 * app sees at runtime. Once a grant exists anywhere these addresses are not
 * admins at all.
 */
export async function envAddressesWithoutGrants(): Promise<string[]> {
  const out: string[] = [];
  for (const email of envAllowlist()) if (!(await adminGrantsByEmail(email)).admin) out.push(email);
  return out;
}

/** The same warning with the facts read live. A failed count raises (liveGrantCount), never reads as "fine". */
export async function allowlistBootstrapWarning(): Promise<string | null> {
  const envEmails = [...envAllowlist()];
  if (envEmails.length === 0) return null;
  const grants = await liveGrantCount("admin");
  if (grants === 0) return null;
  return allowlistBootstrapMessage(envEmails, grants, await envAddressesWithoutGrants());
}
