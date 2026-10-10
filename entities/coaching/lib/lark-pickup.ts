// The daily 1-1 pickup (2026-10-08): find each connected coach's Lark
// recordings titled "1-1 <name>", and turn each new one into a held 1-1 with
// its transcript and a drafted recap, without anybody pasting a link.
//
// It replaces nothing that worked. autoDetectMinutes in cycle-minutes.ts has
// listed Minutes through the tenant app since it was written, and that list
// answers 404, so it has never matched a recording; and the tenant app is
// refused on the recordings themselves. This runs as each coach, with the Lark
// account they connected (lark-connection.ts).
//
// Who it files a session under, the rule Dave set on 2026-10-08:
//   - the person's own coach recorded it: the 1-1 already booked within a day
//     of the recording, or a new one if nobody booked it;
//   - anybody else recorded it: a dotted-line session on that person's
//     profile, led_by the person who recorded it. Never a guess at a booking.
// A title that names nobody, or two people, is counted and left alone.
//
// Idempotent by recording: a minutes_token already on any 1-1 is never picked
// up again, and a recording whose transcript Lark has not finished is skipped
// and retried on the next run, which looks back two weeks.

import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { addDays, BUSINESS_TIME_ZONE, businessDate } from "@/kernel/config/dates";
import { foldDiacritics } from "@/kernel/config/people-name";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { getOwnMinute, getOwnMinuteTranscript, searchOwnMinutes } from "@/kernel/messaging/lark-user";
import { summarizeMeeting } from "./ai";
import { titleNames } from "./cycle-minutes";
import { loadActiveProfiles, loadCoachContacts, notifyBoth, type ProfileRow } from "./cycle-shared";
import { freshAccessToken, listLarkConnections, noteLarkError, type LarkConnection } from "./lark-connection";
import { saveCoachingTranscript } from "./transcript";

const LOOKBACK_DAYS = 14;

export type PickupSummary = {
  connections: number;
  picked: { leader: string; member: string; day: string; dotted: boolean; recap: boolean }[];
  unmatched: string[];
  ambiguous: string[];
  notReady: number;
  errors: string[];
};

/** The names a Lark title may call this person by. Exported for its test. */
export function namesFor(p: Pick<ProfileRow, "memberGivenName" | "memberPreferredName" | "memberDisplayName">): string[] {
  const names = new Set<string>();
  if (p.memberGivenName) names.add(p.memberGivenName);
  // "Amellus Thao" is "Amellus" in a title: each word of a several-word
  // preferred name counts, and a clash with someone else is caught as
  // ambiguous rather than guessed.
  for (const w of (p.memberPreferredName ?? "").split(/\s+/)) if (w.length > 1) names.add(w);
  // Việt Hà is "Viha" in Lark, the first word of her display name.
  const shown = p.memberDisplayName?.split(/\s+/)[0];
  if (shown && shown.length > 1) names.add(shown);
  return [...names];
}

/**
 * Whose 1-1 a title is about, among the active profiles, from the point of
 * view of the person who recorded it. When two people match, the one this
 * leader coaches wins if there is exactly one; otherwise it is ambiguous.
 * Exported for its test.
 */
export function matchTitle(
  title: string,
  profiles: ProfileRow[],
  leaderId: string,
): { profile: ProfileRow } | { none: true } | { ambiguous: true } {
  const folded = foldDiacritics(title);
  if (!folded.includes("1-1")) return { none: true };
  const hits = profiles.filter(
    (p) => p.team_member_id !== leaderId && namesFor(p).some((n) => titleNames(folded, n)),
  );
  if (hits.length === 1) return { profile: hits[0] };
  if (hits.length === 0) return { none: true };
  const mine = hits.filter((p) => p.coach_id === leaderId);
  return mine.length === 1 ? { profile: mine[0] } : { ambiguous: true };
}

/** "HH:MM:00" in Saigon, for starts_at. */
function saigonTime(iso: string): string {
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return `${t}:00`;
}

export async function runLarkPickup(todayISO: string): Promise<PickupSummary> {
  const summary: PickupSummary = { connections: 0, picked: [], unmatched: [], ambiguous: [], notReady: 0, errors: [] };
  const connections = await listLarkConnections();
  summary.connections = connections.length;
  if (connections.length === 0) return summary;

  const profiles = await loadActiveProfiles();
  const attached = new Set(
    (mustRows(
      await companyOs.from("coaching_one_on_ones").select("minutes_token").not("minutes_token", "is", null),
      "[coaching/lark-pickup] coaching_one_on_ones (tokens)",
    ) as { minutes_token: string }[]).map((r) => r.minutes_token),
  );

  for (const conn of connections) {
    try {
      await pickupFor(conn, profiles, attached, todayISO, summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${conn.teamMemberId}: ${msg}`);
      await noteLarkError(conn.teamMemberId, msg);
    }
  }
  return summary;
}

async function pickupFor(
  conn: LarkConnection,
  profiles: ProfileRow[],
  attached: Set<string>,
  todayISO: string,
  summary: PickupSummary,
): Promise<void> {
  const token = await freshAccessToken(conn);
  if (!token.ok) {
    summary.errors.push(`${conn.teamMemberId}: ${token.error}`);
    await noteLarkError(conn.teamMemberId, token.error);
    return;
  }
  const since = `${addDays(todayISO, -LOOKBACK_DAYS)}T00:00:00+07:00`;
  const found = await searchOwnMinutes(token.token, conn.openId, "1-1", since);
  if (!found.ok) {
    summary.errors.push(`${conn.teamMemberId}: ${found.error}`);
    await noteLarkError(conn.teamMemberId, found.error);
    return;
  }

  const picked: PickupSummary["picked"] = [];
  for (const minuteToken of found.tokens) {
    if (attached.has(minuteToken)) continue;
    const meta = await getOwnMinute(token.token, minuteToken);
    if (!meta.ok) {
      summary.errors.push(`${minuteToken}: ${meta.error}`);
      continue;
    }
    const match = matchTitle(meta.title, profiles, conn.teamMemberId);
    if ("none" in match) {
      if (foldDiacritics(meta.title).includes("1-1")) summary.unmatched.push(meta.title);
      continue;
    }
    if ("ambiguous" in match) {
      summary.ambiguous.push(meta.title);
      continue;
    }
    const transcript = await getOwnMinuteTranscript(token.token, minuteToken);
    if (!transcript.ok) {
      summary.errors.push(`${minuteToken}: ${transcript.error}`);
      continue;
    }
    if (!transcript.transcript) {
      summary.notReady += 1;
      continue;
    }

    const profile = match.profile;
    const dotted = profile.coach_id !== conn.teamMemberId;
    const day = businessDate(meta.startedAt);
    const rowId = await fileSession(profile.id, dotted ? conn.teamMemberId : null, day, saigonTime(meta.startedAt), minuteToken);
    attached.add(minuteToken);
    const saved = await saveCoachingTranscript(rowId, transcript.transcript);
    if (!saved.ok) {
      summary.errors.push(`${minuteToken}: ${saved.error}`);
      continue;
    }
    const recap = await summarizeMeeting(rowId);
    picked.push({ leader: conn.teamMemberId, member: profile.memberName, day, dotted, recap: recap.ok });
  }

  summary.picked.push(...picked);
  if (picked.length > 0) await tellLeader(conn.teamMemberId, picked);
}

/**
 * The 1-1 row a recording belongs to: for the coach, the booking within a day
 * of it that carries no recording yet; otherwise a new held row. Returns its id.
 */
async function fileSession(profileId: string, ledBy: string | null, day: string, startsAt: string, minuteToken: string): Promise<string> {
  const fields = {
    status: "held",
    minutes_token: minuteToken,
    transcript_source: "minutes_auto",
    starts_at: startsAt,
    updated_at: new Date().toISOString(),
  };
  if (!ledBy) {
    const { data: booked, error } = await companyOs
      .from("coaching_one_on_ones")
      .select("id")
      .eq("coaching_profile_id", profileId)
      .is("led_by", null)
      .is("archived_at", null)
      .is("minutes_token", null)
      .gte("held_on", addDays(day, -1))
      .lte("held_on", addDays(day, 1))
      .order("held_on")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`booking lookup: ${error.message}`);
    if (booked) {
      const { error: upErr } = await companyOs.from("coaching_one_on_ones").update({ ...fields, held_on: day }).eq("id", booked.id);
      if (upErr) throw new Error(`booking update: ${upErr.message}`);
      return booked.id as string;
    }
  }
  const { data, error } = await companyOs
    .from("coaching_one_on_ones")
    .insert({ coaching_profile_id: profileId, held_on: day, led_by: ledBy, ...fields })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insert: ${error?.message ?? "no row"}`);
  return data.id as string;
}

async function tellLeader(leaderId: string, picked: PickupSummary["picked"]): Promise<void> {
  const contact = (await loadCoachContacts([leaderId])).get(leaderId);
  if (!contact?.email) return;
  const origin = await getSiteOrigin();
  const current = `${origin}/team/coaching`;
  const dottedLink = `${origin}/team/coaching?view=dotted`;
  const lines = picked.map(
    (p) => `${p.member}, ${p.day}${p.dotted ? " (dotted line)" : ""}${p.recap ? "" : ": transcript saved, recap failed"}`,
  );
  const links = picked.some((p) => p.dotted) ? [current, dottedLink] : [current];
  await notifyBoth({
    email: contact.email,
    subject: `1-1 recaps drafted: ${picked.map((p) => p.member).join(", ")}`,
    html:
      `<p>Your Lark recordings came in and the recaps are drafted:</p><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>` +
      `<p><a href="${current}">Your people</a>${picked.some((p) => p.dotted) ? ` · <a href="${dottedLink}">Dotted Line</a>` : ""}</p>`,
    larkText: `1-1 recaps drafted: ${lines.join("; ")}. ${current}`,
    logKind: "recap_drafted",
    links,
  });
}
