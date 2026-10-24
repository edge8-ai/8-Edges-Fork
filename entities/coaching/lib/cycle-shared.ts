// What the daily cycle (cycle.ts) and the hourly recap drafter
// (recap-drafter.ts) share: the active-profile loader, the coach contact
// lookup and the two-channel notifier. Split out on 2026-09-16 when cycle.ts
// crossed its size allowlist; nothing here is reachable from the entity door.

import { companyOs } from "@/kernel/data/supabase";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { sendLarkDm } from "@/kernel/messaging/lark-api";
import { recipientMayOpenByEmail } from "@/kernel/identity/may-open";
import { one } from "@/kernel/config/embedded";
import { GREETING_COLUMNS, NAME_COLUMNS, type GreetedPerson, greetingName, personName } from "@/kernel/config/people-name";
import { isLiveMember } from "./live-member";

// Every nudge goes out on BOTH channels: a Lark DM (where the team lives)
// and the transactional email (the delivery guarantee). Either failing never
// blocks the other.
//
// A nudge is never a side door (AC.15, ADR 0013). It names the pages it points
// at in `links`, and goes only to a recipient who may open every one of them: a
// message whose link they could not follow has nothing to say to them. A digest
// that has already narrowed its links by that recipient's access passes the
// predicate it used as `mayOpen`, so the registers are asked once, not twice.
// A lookup that fails sends nothing: the nudge is best-effort, and a nudge to
// someone who may not open its page is the worse outcome.
export async function notifyBoth(input: {
  email: string | null;
  subject: string;
  html: string;
  larkText: string;
  logKind: string;
  links: string[];
  mayOpen?: (href: string) => boolean;
}): Promise<boolean> {
  if (!input.email) return false;
  try {
    const may = input.mayOpen ?? (await recipientMayOpenByEmail(input.email));
    if (!input.links.every((href) => may(href))) return false;
  } catch (err) {
    console.error("[team/coaching-cycle] recipient access", err instanceof Error ? err.message : err);
    return false;
  }
  const dm = sendLarkDm(input.email, input.larkText, { category: "one_on_one" });
  const mail = sendTransactionalEmail({
    to: input.email,
    subject: input.subject,
    html: input.html,
    logMeta: { source: "coaching-cycle", kind: input.logKind },
  });
  const [dmOk, mailOk] = await Promise.all([dm, mail]);
  return dmOk || Boolean(mailOk);
}

type PersonEmbed = GreetedPerson;

export type ProfileRow = {
  id: string;
  coach_id: string;
  // The coached member, whose leave the 1-1 schedule reads.
  team_member_id: string | null;
  cadence_days: number;
  paused: boolean;
  // The member's preferred Saigon time for 1-1s (K.34), null until they say.
  preferred_time: string | null;
  memberName: string;
  // The name the member goes by, one word: what a Lark 1-1 title carries
  // (S.16.19). Null when the roster holds none — never a family name, which is
  // what the first word of a family-name-first full_name would be.
  memberGivenName: string | null;
  // The name they asked to be called, whole: "Amellus Thao" goes by Amellus in
  // a Lark title, which greetingName cannot give back for a two-word name.
  memberPreferredName?: string | null;
  // The name shown across the app ("Viha Nghiem"), whose first word is often
  // the one a Lark title uses when it differs from the preferred name.
  memberDisplayName?: string | null;
  memberEmail: string | null;
};

export async function loadActiveProfiles(): Promise<ProfileRow[]> {
  const { data, error: profilesError } = await companyOs
    .from("coaching_profiles")
    .select(
      "id, coach_id, team_member_id, cadence_days, one_on_ones_paused_at, preferred_time, " +
        `team_members:team_members!team_member_id(status, people:people!person_id(${GREETING_COLUMNS}))`,
    )
    .eq("active", true)
    // coach_id is nullable, despite 20260725130000 declaring it `not null`:
    // the live column was relaxed so a profile can exist for its owner's FAST
    // goals alone (/team/goals) before anyone coaches them, which is what the
    // schema snapshot in .github/fork-overlay/supabase/01-schema.sql records.
    // No coach, no 1-1 rhythm to run, so the daily cycle skips it, and
    // ProfileRow can type coach_id as a plain string behind this filter.
    .not("coach_id", "is", null);
  if (profilesError) console.error("[team/coaching-cycle] coaching_profiles", profilesError);
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .filter((r) => {
      const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
      return isLiveMember(tm?.status as string | null);
    })
    .map((r) => {
      const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
      const person = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
      return {
        id: r.id as string,
        coach_id: r.coach_id as string,
        team_member_id: (r.team_member_id as string | null) ?? null,
        cadence_days: (r.cadence_days as number) ?? 14,
        paused: Boolean(r.one_on_ones_paused_at),
        preferred_time: (r.preferred_time as string | null) ?? null,
        memberName: personName(person, "-"),
        memberGivenName: greetingName(person, null),
        memberPreferredName: person?.preferred_name?.trim() || null,
        memberDisplayName: person?.display_name?.trim() || null,
        memberEmail: person?.email ?? null,
      };
    });
}

// Coach contacts by team_members id — forward lookup, never the self-FK embed.
export async function loadCoachContacts(ids: string[]): Promise<Map<string, { name: string; email: string | null }>> {
  const map = new Map<string, { name: string; email: string | null }>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const { data, error: coachError } = await companyOs
    .from("team_members")
    .select(`id, people:people!person_id(${NAME_COLUMNS})`)
    .in("id", unique);
  if (coachError) console.error("[team/coaching-cycle] team_members", coachError);
  for (const r of (data ?? []) as Array<{ id: string; people: PersonEmbed | PersonEmbed[] | null }>) {
    const p = one(r.people);
    map.set(r.id, { name: personName(p, "-"), email: p?.email ?? null });
  }
  return map;
}
