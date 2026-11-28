// Coach adoption watch (K.9): the step that notices a rhythm has stopped.
//
// Two nudges, both to the coach, both weekly:
//   - overdue: members whose last 1-1 is further back than their cadence plus
//     three days of grace, and who have no future date booked;
//   - cold roster: a coach with an active roster older than thirty days on
//     which no 1-1 has been held at all — the coaching never started.
//
// "Once a week" needs a stamp, and the cheapest honest stamp is the calendar:
// the step only runs on a Monday (the Saigon date the cron passes in), so a
// coach can be nudged at most once per week without a column, a table or a
// per-coach timestamp to keep in sync. A missed Monday waits for the next one,
// which is the right cadence for a nudge about a fortnightly rhythm.
//
// The two findings fold into ONE message per coach when both apply: a coach
// who is behind on two people and has never met a third should read one note,
// not two.

import { companyOs } from "@/kernel/data/supabase";
import { dateMs, diffDays } from "@/kernel/config/dates";
import { notifyBoth, type ProfileRow } from "./cycle-shared";

const GRACE_DAYS = 3;
const COLD_ROSTER_DAYS = 30;

type Coach = { name: string; email: string | null };

function isMonday(todayISO: string): boolean {
  return new Date(dateMs(todayISO)).getUTCDay() === 1;
}

// Latest held 1-1 per profile, in one query rather than one per profile: the
// daily loop already reads this per profile, but the watch runs beside that
// loop and a roster of thirty would otherwise cost thirty round trips.
async function lastHeldByProfile(profileIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (profileIds.length === 0) return out;
  const { data, error } = await companyOs
    .from("coaching_one_on_ones")
    .select("coaching_profile_id, held_on")
    .in("coaching_profile_id", profileIds)
    .eq("status", "held")
    .is("archived_at", null)
    .order("held_on", { ascending: false });
  if (error) {
    console.error("[team/coaching-cycle] coaching_one_on_ones", error);
    return out;
  }
  for (const r of (data ?? []) as Array<{ coaching_profile_id: string; held_on: string }>) {
    // Rows arrive newest first, so the first sighting of a profile is its last
    // held 1-1.
    if (!out.has(r.coaching_profile_id)) out.set(r.coaching_profile_id, r.held_on);
  }
  return out;
}

// When each profile joined the roster, for the cold-roster rule: a coach whose
// newest coachee arrived last week is not behind on anything yet.
async function createdByProfile(profileIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (profileIds.length === 0) return out;
  const { data, error } = await companyOs
    .from("coaching_profiles")
    .select("id, created_at")
    .in("id", profileIds);
  if (error) {
    console.error("[team/coaching-cycle] coaching_profiles", error);
    return out;
  }
  for (const r of (data ?? []) as Array<{ id: string; created_at: string }>) {
    out.set(r.id, r.created_at.slice(0, 10));
  }
  return out;
}

// Returns the number of coaches messaged. Zero on any day that is not a Monday.
export async function runAdoptionWatch(
  profiles: ProfileRow[],
  coaches: Map<string, Coach>,
  origin: string,
  todayISO: string,
): Promise<number> {
  if (!isMonday(todayISO)) return 0;
  const live = profiles.filter((p) => !p.paused);
  if (live.length === 0) return 0;

  const ids = live.map((p) => p.id);
  const [lastHeld, created] = await Promise.all([lastHeldByProfile(ids), createdByProfile(ids)]);

  // Per coach: who is past cadence, and whether any 1-1 has ever been held.
  const overdue = new Map<string, { name: string; days: number }[]>();
  const everHeld = new Map<string, boolean>();
  const oldestRoster = new Map<string, number>();

  for (const p of live) {
    const held = lastHeld.get(p.id) ?? null;
    everHeld.set(p.coach_id, (everHeld.get(p.coach_id) ?? false) || Boolean(held));
    const createdOn = created.get(p.id);
    if (createdOn) {
      const age = diffDays(createdOn, todayISO);
      oldestRoster.set(p.coach_id, Math.max(oldestRoster.get(p.coach_id) ?? 0, age));
    }
    if (!held) continue;
    // Overdue is measured from the last 1-1 that actually happened, and only
    // from that. A booking cannot narrow it: a 1-1 booked for next month is not
    // a conversation that happened, and letting it reset the watch would
    // silence it for anyone with a far-off date. A held 1-1 is the only thing
    // that resets it.
    const since = diffDays(held, todayISO);
    if (since <= p.cadence_days + GRACE_DAYS) continue;
    const list = overdue.get(p.coach_id) ?? [];
    list.push({ name: p.memberName, days: since });
    overdue.set(p.coach_id, list);
  }

  // A coach is cold when nothing has ever been held on a roster that has been
  // theirs for more than thirty days. The recency rule above cannot see them:
  // with no held 1-1 there is nothing to be overdue from.
  const coachIds = [...new Set(live.map((p) => p.coach_id))];
  let sent = 0;
  for (const coachId of coachIds) {
    const late = (overdue.get(coachId) ?? []).sort((a, b) => b.days - a.days);
    const cold = !everHeld.get(coachId) && (oldestRoster.get(coachId) ?? 0) > COLD_ROSTER_DAYS;
    if (late.length === 0 && !cold) continue;
    const coach = coaches.get(coachId);
    const link = `${origin}/team/coaching`;

    const lines: string[] = [];
    const html: string[] = [];
    if (late.length > 0) {
      lines.push(
        `Past cadence:\n` + late.map((m) => `- ${m.name}: ${m.days} days since your last 1-1`).join("\n"),
      );
      html.push(
        `<p>These 1-1s are past their cadence:</p><ul>` +
          late.map((m) => `<li><strong>${m.name}</strong>: ${m.days} days since your last 1-1</li>`).join("") +
          `</ul>`,
      );
    }
    if (cold) {
      lines.push(
        `Your roster has had no 1-1 yet, more than ${COLD_ROSTER_DAYS} days in. Booking the first one is the whole job this week.`,
      );
      html.push(
        `<p>Your coaching roster has had <strong>no 1-1 yet</strong>, more than ${COLD_ROSTER_DAYS} days in. Booking the first one is the whole job this week.</p>`,
      );
    }

    // The same rule as the digest: no count next to "1-1".
    const subject =
      late.length === 1
        ? `Your 1-1 with ${late[0].name} is past its cadence`
        : late.length > 1
          ? `${late.length} conversations past their cadence`
          : "Your coaching roster has not started";
    const ok = await notifyBoth({
      email: coach?.email ?? null,
      subject,
      html: html.join("") + `<p><a href="${link}">Your coaching roster</a></p>`,
      larkText: lines.join("\n\n") + `\n\nYour roster: ${link}`,
      logKind: "coach_overdue",
      links: [link],
    });
    if (ok) sent += 1;
  }
  return sent;
}
