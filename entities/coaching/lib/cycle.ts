// Team Coaching Cycle — the daily pass (docs/plans/2026-07-25-team-coaching-cycle.md).
// Mirrors lib/onboarding-cycle.ts: one bearer-authed cron walks every active
// coaching profile and runs four steps, each idempotent so a missed day
// self-heals:
//   1) A 1-1 a person booked is coming up (<= 4 days) -> generate the AI prep
//      once. This pass writes no part of the schedule (ADR-0010): it never
//      books a 1-1, never guesses a date and never touches anybody's calendar.
//      It used to book a row on its guess and put a Lark event on it, and on
//      2026-09-25 it sent two 1-1 invites on days nobody had agreed; after
//      that it wrote a Wednesday guess to the profile every morning, which
//      read as a booking on every page. The suggested date is now computed
//      when a page reads it.
//      Every prep made in the pass goes to its coach as a single digest at the
//      end of the run, one email listing all of them, not one per person.
//   2) Pre-meeting nudge: four days before the next 1-1 -> one link-only
//      message asking for ninety seconds on the agenda, recorded on
//      coaching_checkins ("one per cycle" = the idempotence, and that row is
//      also what the member's form writes into).
//   3) Trends: a new latest summarized 1-1 -> one report across the last few
//      1-1s, once per 1-1 (the coaching_trends row carrying that 1-1's id is
//      the stamp). It is stored for the coach page and mailed to nobody.
//
// Everything runs on the service-role client; the only caller is the cron
// route. Emails go through sendTransactionalEmail (fail-soft).

import { companyOs } from "@/kernel/data/supabase";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { addDays, diffDays } from "@/kernel/config/dates";
import { recipientMayOpenByEmail } from "@/kernel/identity/may-open";
import { generatePrep, generateTrendReport } from "@/entities/coaching/lib/ai";
import { coachingMarkdownToHtml } from "@/entities/coaching/lib/markdown";
import { shortTime, WEEKDAY_NAMES } from "@/entities/coaching/lib/cadence";
import { loadSchedules } from "@/entities/coaching/lib/data/one-on-one-schedule";
import { runAdoptionWatch } from "@/entities/coaching/lib/adoption";
import { loadActiveProfiles, loadCoachContacts, notifyBoth, type ProfileRow } from "./cycle-shared";

export type CoachingRunSummary = {
  date: string;
  profiles: number;
  prepsGenerated: number;
  checkinsSent: number;
  trendsGenerated: number;
  // Coaches messaged by the weekly adoption watch (K.9); zero except Mondays.
  adoptionNudges: number;
};

// 2) The pre-meeting nudge: four days before the next 1-1, once per cycle.
//    Link only since K.15 (spec 4) — no card, no buttons, no mid-cycle resend.
//    The nudge opens the cycle's coaching_checkins row, and that row's presence
//    IS the idempotence: a second pass on the same cycle finds it and sends
//    nothing. It is inserted before the message goes out, because a duplicate
//    nudge is worse than a nudge whose Lark DM failed (the page is still there
//    and the row is what the member's form writes into).
//    Exported for its test; the only production caller is runCoachingCycle.
export async function midCycleCheckin(
  p: ProfileRow,
  coach: { name: string; email: string | null } | undefined,
  nextBookedOn: string,
  lastHeld: string | null,
  todayISO: string,
  summary: CoachingRunSummary,
): Promise<void> {
  if (p.paused || !p.memberEmail) return;
  const daysToNext = diffDays(todayISO, nextBookedOn);
  if (daysToNext < 0 || daysToNext > 4) return;
  // Once per cycle: any check-in row stamped since the last held or skipped
  // 1-1 is this cycle's form, whether the nudge opened it or the member did by
  // saving early. With no 1-1 ever had, any row at all means the nudge has gone.
  const since = lastHeld ? `${lastHeld}T00:00:00Z` : "1970-01-01T00:00:00Z";
  const { data: recent, error: recentError } = await companyOs
    .from("coaching_checkins")
    .select("id")
    .eq("coaching_profile_id", p.id)
    .gte("sent_at", since)
    .limit(1);
  if (recentError) {
    console.error("[team/coaching-cycle] coaching_checkins", recentError);
    return;
  }
  if ((recent ?? []).length > 0) return;

  const { error } = await companyOs
    .from("coaching_checkins")
    .insert({ coaching_profile_id: p.id, sent_at: new Date().toISOString() });
  if (error) {
    console.error("[team/coaching-cycle] coaching_checkins insert", error);
    return;
  }
  const link = `${await getSiteOrigin()}/team/my-coaching?tab=my`;
  // "Wednesday 15:00's 1-1" once the member has said when (K.34); the weekday
  // alone before that.
  const time = shortTime(p.preferred_time);
  const when = `${weekdayName(nextBookedOn)}${time ? ` ${time}` : ""}`;
  const text = `${when}'s 1-1 with ${coach?.name ?? "your coach"}: 90 seconds to set the agenda.`;
  await notifyBoth({
    email: p.memberEmail,
    subject: text,
    html: `<p>${text}</p><p><a href="${link}">Set the agenda</a></p>`,
    larkText: `${text} ${link}`,
    logKind: "premeeting_nudge",
    links: [link],
  });
  summary.checkinsSent += 1;
}

// The weekday a YYYY-MM-DD falls on, in Saigon terms. Read from the date alone
// (UTC noon dodges every timezone edge) rather than from a locale the server
// happens to carry.
function weekdayName(dateISO: string): string {
  return WEEKDAY_NAMES[new Date(`${dateISO}T12:00:00Z`).getUTCDay()];
}

// 3) Trend report across the last few 1-1s. Refresh it once the latest
//    summarized 1-1 has no report yet — keyed by that 1-1's id, not by its
//    month, because a month keyed check made the second 1-1 in a month find
//    the first one's row and skip forever (B5). Needs 2+ summarized 1-1s.
//    The report is stored and read on the coach page; it sends nothing, since
//    a trend nobody asked for is not news (K.5). Exported for its test.
export async function refreshTrendReport(p: ProfileRow, summary: CoachingRunSummary): Promise<void> {
  if (p.paused) return;
  const { data: recentHeld, error: heldError } = await companyOs
    .from("coaching_one_on_ones")
    .select("id, held_on")
    .eq("coaching_profile_id", p.id)
    .eq("status", "held")
    .is("archived_at", null)
    .not("summary_markdown", "is", null)
    .order("held_on", { ascending: false })
    .limit(2);
  if (heldError) console.error("[team/coaching-cycle] coaching_one_on_ones", heldError);
  const heldRows = (recentHeld ?? []) as Array<{ id: string; held_on: string }>;
  if (heldRows.length < 2) return;
  const { data: existing, error: trendError } = await companyOs
    .from("coaching_trends")
    .select("report_markdown")
    .eq("coaching_profile_id", p.id)
    .eq("one_on_one_id", heldRows[0].id)
    .not("report_markdown", "is", null)
    .limit(1);
  if (trendError) console.error("[team/coaching-cycle] coaching_trends", trendError);
  if (((existing ?? []) as unknown[]).length > 0) return;
  const res = await generateTrendReport(p.id);
  if (!res.ok) return;
  summary.trendsGenerated += 1;
}

export async function runCoachingCycle(todayISO: string): Promise<CoachingRunSummary> {
  const profiles = await loadActiveProfiles();
  const coaches = await loadCoachContacts(profiles.map((p) => p.coach_id));
  const origin = await getSiteOrigin();

  const summary: CoachingRunSummary = {
    date: todayISO,
    profiles: profiles.length,
    prepsGenerated: 0,
    checkinsSent: 0,
    trendsGenerated: 0,
    adoptionNudges: 0,
  };

  // Preps generated in this pass, gathered per coach. They go out as one
  // digest at the end of the run rather than an email per person: a coach with
  // four 1-1s on the same day wants one "your prep is ready" note listing all
  // four, not four notes.
  const prepDigest = new Map<string, PrepItem[]>();

  // Every profile's schedule in one read (ADR-0010): the booking ahead is what
  // prep and the nudge wait for, and the last held or skipped 1-1 is the cycle
  // clock.
  const schedules = await loadSchedules(
    profiles.map((p) => ({ id: p.id, teamMemberId: p.team_member_id, cadenceDays: p.cadence_days, paused: p.paused })),
    todayISO,
  );

  for (const p of profiles) {
    const coach = coaches.get(p.coach_id);
    const profileLink = `${origin}/team/coaching/${p.id}`;

    const schedule = schedules.get(p.id);
    const lastHeld = schedule?.lastOn ?? null;

    // 1) A 1-1 somebody booked within 4 days -> prep + email. No booking, no
    //    prep: the pass reads bookings, it never makes one.
    const next = schedule?.booked?.day ?? null;
    let booked = false;
    if (!p.paused && next && next <= addDays(todayISO, 4)) {
      const { data: meeting, error: meetingError } = await companyOs
        .from("coaching_one_on_ones")
        .select("id, prep_markdown, prep_generated_at")
        .eq("id", schedule!.booked!.id)
        .maybeSingle();
      if (meetingError) console.error("[team/coaching-cycle] coaching_one_on_ones", meetingError);
      const m = meeting as { id: string; prep_generated_at: string | null } | null;
      booked = Boolean(m);
      if (m && !m.prep_generated_at) {
        const res = await generatePrep(m.id);
        if (res.ok) {
          summary.prepsGenerated += 1;
          const list = prepDigest.get(p.coach_id) ?? [];
          list.push({ date: next, member: p.memberName, link: profileLink, bullets: res.markdown });
          prepDigest.set(p.coach_id, list);
          // The member gets the same list minus the coach-only bullets, so
          // both walk in with one agenda (K.4). Every notice also asks them to
          // update their FAST goal first (Dave, 2026-10-03): bonuses are
          // performance based, and a goal left stale cannot be measured. So
          // the notice goes out even when every bullet was coach-only.
          if (p.memberEmail) {
            const goalsLink = `${origin}/team/goals`;
            await notifyBoth({
              email: p.memberEmail,
              subject: `Your 1-1${coach ? ` with ${coach.name}` : ""} on ${next}: update your FAST goal`,
              html:
                `<p><strong>Before your 1-1 on ${next}, update your FAST goal</strong>: its current value and a line on progress. February bonuses are performance based, and a goal that is not up to date gives us no way to measure or award it. <a href="${goalsLink}">Update your goals</a></p>` +
                (res.sharedMarkdown
                  ? `<p>Here is what ${coach?.name ?? "your coach"} plans to bring. Add anything of yours on your coaching page.</p>` +
                    (await coachingMarkdownToHtml(res.sharedMarkdown))
                  : "") +
                `<p><a href="${origin}/team/my-coaching">Your coaching page</a></p>`,
              larkText:
                `Your 1-1${coach ? ` with ${coach.name}` : ""} on ${next}. Before it, update your FAST goal: February bonuses are performance based, and a goal that is not up to date gives us no way to measure or award it. ${goalsLink}` +
                (res.sharedMarkdown ? `\n\nThe agenda:\n${res.sharedMarkdown}` : "") +
                `\n\nAdd yours: ${origin}/team/my-coaching`,
              logKind: "prep_shared",
              links: [goalsLink, `${origin}/team/my-coaching`],
            });
          }
        }
      }
    }

    // 2) Mid-cycle check-in and 3) trend refresh, each skipped for a paused
    //    profile: pausing means "leave this person alone until I resume", and
    //    until K.3 only the roll-forward and the prep honoured it.
    // The nudge names a 1-1, so it waits for one that somebody booked.
    if (booked && next) await midCycleCheckin(p, coach, next, lastHeld, todayISO, summary);
    await refreshTrendReport(p, summary);
  }

  // 4) The weekly adoption watch (K.9). It is a no-op except on Mondays,
  //    which is what "weekly" means here.
  summary.adoptionNudges = await runAdoptionWatch(profiles, coaches, origin, todayISO);

  // One prep digest per coach, after every profile has been walked.
  await sendPrepDigests(prepDigest, coaches);

  return summary;
}

type PrepItem = { date: string; member: string; link: string; bullets: string };

// One prep digest per coach (K.4). Each prep links to the member's coaching
// page, and a coach is told only of the ones they may open (AC.15, ADR 0013):
// the digest keeps those items and sends nothing when none is left. Their
// access is resolved once. Exported for its test.
export async function sendPrepDigests(
  prepDigest: Map<string, PrepItem[]>,
  coaches: Map<string, { name: string; email: string | null }>,
): Promise<void> {
  for (const [coachId, preps] of prepDigest) {
    const coach = coaches.get(coachId);
    let mayOpen: (href: string) => boolean;
    try {
      mayOpen = await recipientMayOpenByEmail(coach?.email);
    } catch (err) {
      console.error("[team/coaching-cycle] coach access", err instanceof Error ? err.message : err);
      continue;
    }
    const items = preps.filter((i) => mayOpen(i.link));
    if (items.length === 0) continue;
    items.sort((a, b) => a.date.localeCompare(b.date) || a.member.localeCompare(b.member));
    const count = items.length;
    const dates = [...new Set(items.map((i) => i.date))];
    const when = dates.length === 1 ? ` for ${dates[0]}` : "";
    // A count never sits next to "1-1": "1 1-1 prep ready" read as "11-1"
    // (Khoa, 2026-09-17). One prep names the person; several count the preps.
    const subject =
      count === 1
        ? `The prep for your 1-1 with ${items[0].member} on ${items[0].date} is ready`
        : `${count} preps ready for your next 1-1s${when}`;
    // The bullets ride inline: the coach reads the prep where the message
    // lands, and the link is there for the page (K.4).
    const sections = await Promise.all(
      items.map(async (i) => `<h3><a href="${i.link}">${i.member}</a> on ${i.date}</h3>` + (await coachingMarkdownToHtml(i.bullets))),
    );
    await notifyBoth({
      email: coach?.email ?? null,
      subject,
      html: `<p>${count === 1 ? "The prep for your next 1-1" : `The preps for your next ${count} 1-1s`}${when}:</p>` + sections.join(""),
      larkText: `${subject}:\n\n` + items.map((i) => `${i.member} (${i.date})\n${i.bullets}\n${i.link}`).join("\n\n"),
      logKind: "prep_ready",
      links: items.map((i) => i.link),
      mayOpen,
    });
  }
}
