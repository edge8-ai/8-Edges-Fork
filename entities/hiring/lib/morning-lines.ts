// The Talent morning list's lines (the Lark notifications plan, 2026-11-18):
// applications waiting for a first look, interviews with no scorecard, and
// candidates stalled in a stage. Built here because hiring owns those tables;
// company-os composes the list. It posts to the Talent chat, so the chat's
// members are who can see it. No candidate is named: counts and stages only.

import { companyOs } from "@/kernel/data/supabase";
import { addDays } from "@/kernel/config/dates";
import { NO_OWNER, byOwner, firstNames, plural, rows, shortDate, type ListLine } from "@/kernel/messaging/office-list";

/** A candidate untouched this long in one stage is stalled. */
export const STALLED_DAYS = 28;

const CLOSED_STAGES = new Set(["rejected", "hired"]);

export async function talentMorningLines(today: string, since: string): Promise<ListLine[]> {
  const fortnightAgo = `${addDays(today, -14)}T00:00:00Z`;
  const [apps, interviews] = await Promise.all([
    rows(
      "applications",
      companyOs.from("applications")
        .select("id, applied_at, current_stage_id, job_requisition_id, stage:application_stages(name), job:job_requisitions(hiring_manager_id)")
        .eq("status", "active").is("archived_at", null),
    ),
    rows(
      "interviews",
      companyOs.from("interviews").select("id, application_id, title, scheduled_at, interviewers:interview_interviewers(interviewer_id), scorecards:interview_scorecards(submitted_at)")
        .gte("scheduled_at", fortnightAgo).lt("scheduled_at", new Date().toISOString()).neq("status", "cancelled"),
    ),
  ]);
  const open = apps.filter((a) => !CLOSED_STAGES.has(String((a.stage as { name?: string } | null)?.name ?? "").toLowerCase()));
  const moves = open.length
    ? await rows("stage moves", companyOs.from("application_stage_log").select("application_id, moved_at").in("application_id", open.map((a) => a.id as string)))
    : [];
  const lastMove = new Map<string, string>();
  for (const m of moves) {
    const id = m.application_id as string;
    const at = m.moved_at as string;
    if (!lastMove.has(id) || at > lastMove.get(id)!) lastMove.set(id, at);
  }
  const manager = (a: Record<string, unknown>) => (a.job as { hiring_manager_id?: string | null } | null)?.hiring_manager_id ?? null;
  const unscored = interviews.filter((i) => ((i.scorecards as { submitted_at: string | null }[]) ?? []).every((s) => !s.submitted_at));
  const interviewerIds = unscored.flatMap((i) => ((i.interviewers as { interviewer_id: string }[]) ?? []).map((x) => x.interviewer_id));
  const names = await firstNames([...open.map(manager), ...interviewerIds]);

  const lines: ListLine[] = [];
  const fresh = open.filter((a) => (a.applied_at as string) >= since);
  for (const [who, group] of byOwner(fresh, manager, names)) {
    lines.push({ who, text: `${plural(group.length, "new application")} waiting for a first look.`, href: "/admin/talent/applications" });
  }

  // One line per interview, linked to its candidate, so the scorecard is one click away.
  // capLines folds anything past three per person into "and N more".
  for (const i of unscored) {
    const ids = ((i.interviewers as { interviewer_id: string }[]) ?? []).map((x) => x.interviewer_id);
    // An AI panelist or an unknown person cannot submit a scorecard, so only named people are asked.
    const named = ids.map((id) => names.get(id)).filter((n): n is string => !!n);
    const whos = named.length ? named : [NO_OWNER];
    const href = i.application_id ? `/admin/talent/applications/${i.application_id as string}` : "/admin/talent/applications";
    const text = `${(i.title as string | null) ?? "Interview"} on ${shortDate(i.scheduled_at as string)} has no scorecard. Submit it.`;
    for (const who of new Set(whos)) lines.push({ who, text, href });
  }

  const cutoff = `${addDays(today, -STALLED_DAYS)}T00:00:00Z`;
  const stalled = open.filter((a) => (lastMove.get(a.id as string) ?? (a.applied_at as string)) < cutoff);
  for (const [who, group] of byOwner(stalled, manager, names)) {
    const byStage = new Map<string, number>();
    for (const a of group) {
      const stage = (a.stage as { name?: string } | null)?.name ?? "no stage";
      byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
    }
    const where = [...byStage].map(([stage, n]) => `${n} in ${stage}`).join(", ");
    lines.push({ who, text: `${plural(group.length, "candidate")} not moved in over ${STALLED_DAYS / 7} weeks (${where}). Advance or reject each.`, href: "/admin/talent/applications" });
  }

  return lines;
}
