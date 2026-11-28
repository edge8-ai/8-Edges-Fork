// The reads behind the coaching contexts: one function per block of text the
// model is shown, each turning rows into the prose that goes under a heading.
//
// These are the IMPLEMENTATION of ai-context.ts and are split out only because
// the two together passed the 400-line cap (A.17). Nothing outside
// ai-context.ts may import them: a generator asks for a context — prepContext,
// recapContext, trendContext — and the context decides which of these it needs.
// That is the whole point of the split, and importing a reader directly would
// put the choosing back at the call site where it used to go wrong.

import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { OPEN_COMMITMENT_STATUSES } from "./types";
import { getEdgesLadderOptions } from "./data/goals";
import { saigonToday } from "@/kernel/config/dates";

export const MAX_DOC_CHARS = 20_000;

export const clip = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}\n\n[...truncated]` : s;

// What a block says when its read FAILED, as opposed to when it came back empty
// (K.69). The two are the same shape to the code and opposite facts to the
// model: "(no FAST goals set yet)" is a statement about the person, and a coach
// reads the brief built on it. Naming the failure costs one sentence and stops
// the model asserting something nobody checked.
const unreadable = (what: string): string =>
  `(${what} could not be read — a lookup failed, so this is NOT evidence there are none; ignore this section rather than drawing a conclusion from it)`;

// FAST goals with their 8 Edges ladder (the key result each hangs off).
export async function loadGoalsBlock(profileId: string): Promise<string> {
  const [goalsRes, edges] = await Promise.all([
    companyOs
      .from("goals")
      .select("title, status, quarter_label, objective_id, key_result_id")
      .eq("coaching_profile_id", profileId)
      .in("status", ["active", "draft"])
      .order("sort_order"),
    getEdgesLadderOptions(),
  ]);
  // Bound and acted on, not logged and coalesced: `data ?? []` here becomes
  // "(no FAST goals set yet)" in the prompt, which is a different claim.
  if (goalsRes.error) {
    console.error("[read] coaching-ai goals", goalsRes.error.message);
    return unreadable("FAST goals");
  }
  const rows = (goalsRes.data ?? []) as Array<{
    title: string;
    status: string;
    quarter_label: string | null;
    objective_id: string | null;
    key_result_id: string | null;
  }>;
  if (rows.length === 0) return "(no FAST goals set yet)";
  return rows
    .map((g) => {
      let ladder = "";
      if (g.key_result_id) {
        const k = edges.keyResults.find((x) => x.id === g.key_result_id);
        if (k) ladder = `, ladders to KR: ${k.label}`;
      } else if (g.objective_id) {
        const o = edges.objectives.find((x) => x.id === g.objective_id);
        if (o) ladder = `, ladders to objective: ${o.label}`;
      }
      return `- [${g.status}${g.quarter_label ? `, ${g.quarter_label}` : ""}] ${g.title}${ladder}`;
    })
    .join("\n");
}

export async function loadPrioritiesBlock(profileId: string): Promise<string> {
  const rows = readOr(await companyOs.from("coaching_priorities").select("title, detail_markdown").eq("coaching_profile_id", profileId).eq("status", "active").order("sort_order"), "coaching-ai coaching_priorities", []) as Array<{ title: string; detail_markdown: string | null }>;
  if (rows.length === 0) return "(no standing priorities)";
  return rows.map((p) => `- ${p.title}${p.detail_markdown ? `, ${p.detail_markdown}` : ""}`).join("\n");
}

// Recent C/M/D mode splits, newest first — the coach's own trajectory.
export async function loadModeHistoryBlock(profileId: string): Promise<string> {
  const rows = readOr(await companyOs.from("coaching_one_on_ones").select("held_on, mode_coach_pct, mode_mentor_pct, mode_direct_pct").eq("coaching_profile_id", profileId).eq("status", "held").is("archived_at", null).not("mode_coach_pct", "is", null).order("held_on", { ascending: false }).limit(6), "coaching-ai coaching_one_on_ones", []) as Array<{
    held_on: string;
    mode_coach_pct: number;
    mode_mentor_pct: number;
    mode_direct_pct: number;
  }>;
  if (rows.length === 0) return "(no mode splits logged yet; target is 80 coach / 15 mentor / 5 direct)";
  return (
    rows.map((m) => `- ${m.held_on}: ${m.mode_coach_pct} coach / ${m.mode_mentor_pct} mentor / ${m.mode_direct_pct} direct`).join("\n") +
    "\nTarget: 80 coach / 15 mentor / 5 direct."
  );
}

// The coach's context documents: their own rows plus company-wide (null coach).
export async function loadCoachDocs(coachId: string): Promise<string> {
  const docs = readOr(await companyOs
    .from("coaching_context")
    .select("coach_id, kind, title, markdown")
    .or(`coach_id.eq.${coachId},coach_id.is.null`)
    .order("kind", { ascending: true }), "coaching-ai coaching_context", []) as Array<{ kind: string; title: string; markdown: string }>;
  if (docs.length === 0) return "(no coaching context documents on file)";
  return docs
    .map((d) => `<doc kind="${d.kind}" title="${d.title}">\n${clip(d.markdown, MAX_DOC_CHARS)}\n</doc>`)
    .join("\n\n");
}

// The last recap the member was shown: what both people already know was
// covered, which is the only prior-meeting context the ten-bullet prep needs.
// The private summaries stay out of the prep on purpose (K.4).
export async function loadLastSharedRecap(profileId: string): Promise<string> {
  const row = readOr(await companyOs
    .from("coaching_one_on_ones")
    .select("held_on, shared_summary_markdown")
    .eq("coaching_profile_id", profileId)
    .eq("status", "held")
    .is("archived_at", null)
    .not("shared_published_at", "is", null)
    .order("held_on", { ascending: false })
    .limit(1)
    .maybeSingle(), "coaching-ai coaching_one_on_ones", null) as { held_on: string; shared_summary_markdown: string | null } | null;
  if (!row?.shared_summary_markdown) return "(no published recap yet)";
  return `<recap held_on="${row.held_on}">\n${clip(row.shared_summary_markdown, MAX_DOC_CHARS)}\n</recap>`;
}

export async function loadOpenCommitments(profileId: string): Promise<string> {
  // Also pull the last held 1-1 so we can flag which commitments were carried
  // over from before it (still open across a whole cycle) and which are overdue.
  const [commitmentsRes, lastHeldRes] = await Promise.all([
    companyOs
      .from("coaching_commitments")
      .select("title, owner, due_on, status, status_note, created_at")
      .eq("coaching_profile_id", profileId)
      .in("status", OPEN_COMMITMENT_STATUSES)
      .order("created_at", { ascending: true }),
    companyOs
      .from("coaching_one_on_ones")
      .select("held_on")
      .eq("coaching_profile_id", profileId)
      .eq("status", "held")
      .is("archived_at", null)
      .order("held_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (commitmentsRes.error) {
    console.error("[read] coaching-ai coaching_commitments", commitmentsRes.error.message);
    return unreadable("open commitments");
  }
  const rows = (commitmentsRes.data ?? []) as Array<{
    title: string;
    owner: string;
    due_on: string | null;
    status: string;
    status_note: string | null;
    created_at: string | null;
  }>;
  if (rows.length === 0) return "(no open commitments)";
  // Only a flag hangs off this one, so a failure degrades the block instead of
  // falsifying it: the commitments are still true, they just lose "carried over
  // from a prior 1-1". readOr is the honest call here, and it says so.
  const lastHeldOn =
    (readOr(lastHeldRes, "coaching-ai last held 1-1", null) as { held_on: string } | null)?.held_on ?? null;
  const today = saigonToday();
  return rows
    .map((c) => {
      const flags: string[] = [];
      if (lastHeldOn && c.created_at && c.created_at.slice(0, 10) < lastHeldOn)
        flags.push("carried over from a prior 1-1");
      if (c.due_on && c.due_on < today) flags.push("OVERDUE");
      const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
      return `- [${c.status}] (${c.owner}) ${c.title}${c.due_on ? `, due ${c.due_on}` : ""}${flagStr}${
        c.status_note ? `, latest note: ${c.status_note}` : ""
      }`;
    })
    .join("\n");
}

// The member's half of the agenda: what they asked to cover next time.
export async function loadTalkingPoints(profileId: string): Promise<string> {
  const rows = readOr(await companyOs.from("coaching_talking_points").select("body").eq("coaching_profile_id", profileId).is("addressed_at", null).order("created_at", { ascending: true }), "coaching-ai coaching_talking_points", []) as Array<{ body: string }>;
  if (rows.length === 0) return "(none raised)";
  return rows.map((t) => `- ${t.body}`).join("\n");
}

// Trend-report context (moved from ai.ts on 2026-09-16, K.5).
// Full ledger (open and closed) for follow-through analysis.
export async function loadAllCommitmentsBlock(profileId: string): Promise<string> {
  const rows = readOr(await companyOs
    .from("coaching_commitments")
    .select("title, owner, due_on, status, status_note, created_at, closed_at")
    .eq("coaching_profile_id", profileId)
    .order("created_at", { ascending: true }), "coaching-ai coaching_commitments", []) as Array<{
    title: string;
    owner: string;
    due_on: string | null;
    status: string;
    status_note: string | null;
    created_at: string;
    closed_at: string | null;
  }>;
  if (rows.length === 0) return "(no commitments recorded)";
  return rows
    .map(
      (c) =>
        `- [${c.status}] (${c.owner}, made ${c.created_at.slice(0, 10)}${
          c.closed_at ? `, closed ${c.closed_at.slice(0, 10)}` : ""
        }) ${c.title}${c.status_note ? `, note: ${c.status_note}` : ""}`,
    )
    .join("\n");
}

export async function loadPriorTrend(profileId: string, period: string): Promise<string> {
  const t = readOr(await companyOs
    .from("coaching_trends")
    .select("period, report_markdown")
    .eq("coaching_profile_id", profileId)
    .lt("period", period)
    .not("report_markdown", "is", null)
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle(), "coaching-ai coaching_trends", null) as { period: string; report_markdown: string } | null;
  return t ? `<trend period="${t.period}">\n${clip(t.report_markdown, MAX_DOC_CHARS)}\n</trend>` : "(none)";
}

export async function loadCheckinsBlock(profileId: string, monthStart: string): Promise<string> {
  const rows = readOr(await companyOs
    .from("coaching_checkins")
    .select("sent_at, responded_at")
    .eq("coaching_profile_id", profileId)
    .gte("sent_at", monthStart)
    .order("sent_at", { ascending: true }), "coaching-ai coaching_checkins", []) as Array<{ sent_at: string; responded_at: string | null }>;
  if (rows.length === 0) return "(no check-ins this month)";
  return rows
    .map((c) => `- sent ${c.sent_at.slice(0, 10)}, ${c.responded_at ? "responded" : "no response"}`)
    .join("\n");
}
