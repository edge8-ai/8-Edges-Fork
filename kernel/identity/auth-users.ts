// Supabase auth-user lookups shared by everything that provisions or signs in
// a person: the admin portal-invite engine, the admin team actions, the portal
// login and the team sign-in link. They read auth.users through the
// service-role client and nothing else, which makes them identity rather than
// any one product's concern; ME-11 moved them here out of
// lib/admin/portal-invite so the team entity stops importing that module
// (it carries the admin session guard along with these two helpers).
import { supabase } from "@/kernel/data/supabase";
import { ReadFailure } from "@/kernel/data/read";

export async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error || !data?.users) return null;
  const match = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === email);
  return match ? { id: match.id } : null;
}

// Supabase's ban is a timestamp; a ban in the past is no ban at all.
export function bannedUntil(user: unknown): string | null {
  const v = (user as { banned_until?: string | null } | null)?.banned_until;
  return v && new Date(v).getTime() > Date.now() ? v : null;
}

/**
 * When each of the given auth users last signed in, or null for one who never
 * has. last_sign_in_at is not exposed to PostgREST, so this pages the admin API.
 *
 * A failed page is raised rather than skipped (kernel/data/read's ReadFailure):
 * a partial list would read as "never signed in" for everyone on the missing
 * pages, which is a wrong answer about real people's accounts, not an absence.
 * An id the auth service does not know is simply left out of the map.
 */
export async function lastSignInsFor(authUserIds: string[]): Promise<Map<string, string | null>> {
  const wanted = new Set(authUserIds);
  const out = new Map<string, string | null>();
  if (wanted.size === 0) return out;
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new ReadFailure("[identity] auth users", error.message);
    for (const u of data.users) {
      if (wanted.has(u.id)) out.set(u.id, u.last_sign_in_at ?? null);
    }
    if (data.users.length < perPage) break;
  }
  return out;
}
