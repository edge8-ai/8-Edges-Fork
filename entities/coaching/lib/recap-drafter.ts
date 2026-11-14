import { companyOs } from "@/kernel/data/supabase";
import { addDays } from "@/kernel/config/dates";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { summarizeMeeting } from "@/entities/coaching/lib/ai";
import { readCoachingTranscript } from "@/entities/coaching/lib/transcript";
import { loadActiveProfiles, loadCoachContacts, notifyBoth } from "./cycle-shared";

// ---- pending-recap drafter (hourly) -----------------------------------------
// Draft the recap for a held 1-1 that HAS a transcript and no summary yet,
// WHATEVER put the transcript there: the 22:00 Minutes pull, a transcript
// pasted into the coach page, or a scheduled task on Dave's machine writing
// straight to company_os via lark-cli (the route that works without the tenant
// app credentials this cron has never had). Before this, only transcripts the
// daily cron pulled itself were ever summarised, so every other route ended in
// a human remembering to press "Summarize transcript".
//
// ONE meeting per invocation, deliberately. Summarising is an Opus call over a
// ~25k-character transcript; four of them in one pass would run past the
// route's 300s ceiling. Hourly + one-at-a-time drains an afternoon of 1-1s well
// before the next morning and can never time out. Oldest first, so a backlog
// comes out in the order the meetings happened.
//
// Bounded to 14 days: importing a year of history must never trigger a bulk AI
// run over meetings nobody is waiting on.

export type RecapDraftResult = {
  drafted: boolean;
  member?: string;
  heldOn?: string;
  meetingId?: string;
  pendingAfter: number;
  error?: string;
};

export async function draftNextPendingRecap(todayISO: string): Promise<RecapDraftResult> {
  const profiles = await loadActiveProfiles();
  if (profiles.length === 0) return { drafted: false, pendingAfter: 0 };
  const byId = new Map(profiles.map((p) => [p.id, p]));

  // Candidates are every recent held 1-1 without a summary; whether each one
  // has a transcript is decided per row, because the text lives on the linked
  // meeting's call_transcripts, which PostgREST cannot filter on here.
  // Filtering on the old mirror column in SQL is what drafted nothing for a
  // week: 141 hourly runs, zero recaps, while a pasted transcript waited.
  const { data, error: pendingError } = await companyOs
    .from("coaching_one_on_ones")
    .select("id, coaching_profile_id, held_on, meeting_id")
    .in("coaching_profile_id", [...byId.keys()])
    .eq("status", "held")
    .is("archived_at", null)
    .is("summary_markdown", null)
    .gte("held_on", addDays(todayISO, -14))
    .order("held_on", { ascending: true });
  if (pendingError) console.error("[team/coaching-cycle] coaching_one_on_ones", pendingError);

  const candidates = (data ?? []) as Array<{
    id: string;
    coaching_profile_id: string;
    held_on: string;
    meeting_id: string | null;
  }>;
  const pending: typeof candidates = [];
  for (const c of candidates) {
    const text = await readCoachingTranscript(c.meeting_id);
    if (text && text.trim()) pending.push(c);
  }
  if (pending.length === 0) return { drafted: false, pendingAfter: 0 };

  const m = pending[0];
  const p = byId.get(m.coaching_profile_id);
  if (!p) return { drafted: false, pendingAfter: pending.length };

  const res = await summarizeMeeting(m.id);
  if (!res.ok) {
    // summarizeMeeting stamps ai_error on the row itself; surface it here too
    // so a failing transcript is visible in the cron response, not just the DB.
    return {
      drafted: false,
      member: p.memberName,
      heldOn: m.held_on,
      meetingId: m.id,
      pendingAfter: pending.length,
      error: res.error,
    };
  }

  const coach = (await loadCoachContacts([p.coach_id])).get(p.coach_id);
  const profileLink = `${await getSiteOrigin()}/team/coaching/${p.id}`;
  await notifyBoth({
    email: coach?.email ?? null,
    subject: `1-1 recap drafted: ${p.memberName} (${m.held_on})`,
    html:
      `<p>The recap of your 1-1 with <strong>${p.memberName}</strong> on <strong>${m.held_on}</strong> is drafted from the transcript. Read both tiers, then publish the shared one when it reads right, nothing reaches ${p.memberName} until you do.</p>` +
      `<p><a href="${profileLink}">Review and publish</a></p>`,
    larkText: `1-1 recap drafted for ${p.memberName} (${m.held_on}). Review and publish: ${profileLink}`,
    logKind: "recap_drafted",
    links: [profileLink],
  });

  return {
    drafted: true,
    member: p.memberName,
    heldOn: m.held_on,
    meetingId: m.id,
    pendingAfter: pending.length - 1,
  };
}
