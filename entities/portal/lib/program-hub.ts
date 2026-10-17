// Portal-facing AI Program hub loaders (Client Hub by AI Program, portal PR).
// Same discipline as the other lib/portal helpers: every read is scoped to the
// actor's own companyScope and cross-company ids resolve to null (IDOR guard).
//
// CLIENT-SAFE HARD LINE: these loaders return program name + counts + PR
// TITLES only. Repo org/name, author logins, PR URLs/numbers, and sync details
// never leave this module; the shapes below simply do not carry them.
//
// The aggregation itself (delivered hours, weekly buckets, roadmap rollups)
// lives in lib/hub/program.ts, shared with the admin Client Hub; this module
// only applies the portal scope and strips to client-safe fields.

import { companyOs, htt } from "@/kernel/data/supabase";
import { selectBoards } from "@/entities/boards";
import { selectAiPrograms, programInCompanies, programOrRaise } from "@/entities/client-programs";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import {
  listProgramSummaries,
  getProgramDetail,
  isoWeekLabel,
  lastIsoWeeks,
  type ProgramPrOptions,
  type ProgramStatus,
} from "@/entities/team";

// IDOR guard shared by the loaders below: resolve a program only when it
// belongs to one of the actor's companies; returns the owning company id.
async function ownedProgramCompany(actor: PortalActor, programId: string): Promise<string | null> {
  // A failed read is not "not yours" (A.12/A.14): denying on a database error
  // would tell the person they lack access to their own programme.
  const program = programOrRaise(
    await programInCompanies(programId, actor.companyScope),
    "[portal] ai_programs (ownedProgramCompany)",
  );
  return program?.companyId ?? null;
}

export type PortalProgramSummary = {
  id: string;
  companyId: string;
  name: string;
  status: ProgramStatus;
  // One line derived from the program plan's 5Ds brief; null when no plan
  // brief exists yet.
  description: string | null;
  // True when delivery tracking is connected. The repo itself is internal;
  // only this boolean crosses to the portal.
  hasRepo: boolean;
  deliveredHours: number;
  prsMergedLast7d: number;
  roadmapDone: number;
  roadmapTotal: number;
  boardCount: number;
};

// Strip a brief's HTML down to one readable line. Headings and short label
// lines ("Dream", "AI Program Brief") are skipped; the first substantial text
// run wins, capped at a word boundary.
const MAX_DESCRIPTION = 160;
export function briefToOneLine(html: string): string | null {
  const text = html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(h1|h2|h3|h4)[\s\S]*?<\/\1>/gi, "\n")
    .replace(/<(p|div|li|br|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 30) continue; // heading or label, not a description
    if (line.length <= MAX_DESCRIPTION) return line;
    const cut = line.slice(0, MAX_DESCRIPTION);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 100))}…`;
  }
  return null;
}

export async function listPortalProgramSummaries(actor: PortalActor): Promise<PortalProgramSummary[]> {
  if (actor.companyScope.length === 0) return [];
  const perCompany = await Promise.all(
    actor.companyScope.map(async (companyId) => ({
      companyId,
      summaries: await listProgramSummaries(companyId),
    })),
  );
  const rows = perCompany.flatMap(({ companyId, summaries }) =>
    summaries.map((s) => ({ companyId, s })),
  );
  if (rows.length === 0) return [];

  // First chat-plan brief per program feeds the one-line description.
  const { data: planData, error: planDataError } = await companyOs.from("program_plans").select("ai_program_id, brief_html").in("ai_program_id", rows.map((r) => r.s.id)).eq("method", "chat").not("brief_html", "is", null).order("created_at", { ascending: true });
  if (planDataError) console.error("[portal] program_plans read failed:", planDataError.message);
  const briefByProgram = new Map<string, string>();
  for (const p of (planData ?? []) as Array<{ ai_program_id: string; brief_html: string }>) {
    if (!briefByProgram.has(p.ai_program_id)) briefByProgram.set(p.ai_program_id, p.brief_html);
  }

  return rows.map(({ companyId, s }) => ({
    id: s.id,
    companyId,
    name: s.name,
    status: s.status,
    description: briefByProgram.has(s.id) ? briefToOneLine(briefByProgram.get(s.id) as string) : null,
    hasRepo: s.repos.length > 0,
    deliveredHours: s.deliveredHours,
    prsMergedLast7d: s.prsMergedLast7d,
    roadmapDone: s.roadmapDone,
    roadmapTotal: s.roadmapTotal,
    boardCount: s.boardCount,
  }));
}

// ── Boards ───────────────────────────────────────────────────────────────

export type PortalHubBoard = {
  id: string;
  name: string;
  slug: string;
  aiProgramId: string | null;
};

// Every active board for the actor's companies, with its program tag, so the
// hub can pick the first UNTAGGED one and the program page its own boards.
export async function listHubBoardsForActor(actor: PortalActor): Promise<PortalHubBoard[]> {
  if (actor.companyScope.length === 0) return [];
  const { data, error: boardsError } = await selectBoards("id, name, slug, ai_program_id").in("client_company_id", actor.companyScope).eq("status", "active").is("archived_at", null).order("sort_order", { ascending: true });
  if (boardsError) console.error("[portal] boards read failed:", boardsError.message);
  return ((data ?? []) as Array<{ id: string; name: string; slug: string; ai_program_id: string | null }>).map(
    (b) => ({ id: b.id, name: b.name, slug: b.slug, aiProgramId: b.ai_program_id }),
  );
}

// ── Delivery projection ──────────────────────────────────────────────────

// The client-safe slice of a program's delivery stats. This projection is the
// STRUCTURAL boundary: lib/hub/program.ts's admin-grade ProgramDetail (repo
// org/name, PR rows with author logins and URLs, admin meeting rows) is
// consumed here and only these fields ever leave the module, so unsafe fields
// never enter a portal page module at all.
export type PortalProgramDelivery = {
  companyId: string;
  hasRepo: boolean;
  deliveredHours: number;
  aiTokens: number; // token_entries, kind claude/app
  leverage: number | null; // value tokens per delivered hour (multiple); null when no hours
  prsMerged7d: number;
  prsMerged30d: number;
  prsMergedTotal: number; // merged to date, across every repo the program owns
  plannedTokens: number; // SUM(token_high) of the program's roadmap items
  weeklyHours: Array<{ isoWeek: string; hours: number }>; // last 8 ISO weeks, oldest first
};

export async function getPortalProgramDelivery(
  actor: PortalActor,
  programId: string,
): Promise<PortalProgramDelivery | null> {
  const companyId = await ownedProgramCompany(actor, programId);
  if (!companyId) return null;
  const detail = await getProgramDetail(companyId, programId);
  if (!detail) return null;

  // Total merged PRs across the program's repos (count only; no numbers/URLs/logins).
  const repoIds = detail.repos.map((r) => r.id);
  let prsMergedTotal = 0;
  if (repoIds.length > 0) {
    const { count, error: programPrErr } = await htt
      .from("pull_requests")
      .select("id", { count: "exact", head: true })
      .in("repo_id", repoIds)
      .eq("state", "merged");
    if (programPrErr) console.error("[portal/program-hub] pull_requests", programPrErr);
    prsMergedTotal = count ?? 0;
  }

  return {
    companyId,
    hasRepo: repoIds.length > 0,
    deliveredHours: detail.deliveredHours,
    aiTokens: detail.aiTokens,
    leverage: detail.leverage,
    prsMerged7d: detail.prsMergedLast7d,
    prsMerged30d: detail.prsMergedLast30d,
    prsMergedTotal,
    plannedTokens: detail.plannedTokens,
    weeklyHours: detail.weeklyHours.map((w) => ({ isoWeek: w.isoWeek, hours: w.hours })),
  };
}

// ── Pull requests ────────────────────────────────────────────────────────

// One page of a program's pull requests for the portal's Pull Requests tab:
// title, state and merge date only. The number, URL and author login the
// shared loader also returns stop here.
export type PortalPullRequest = {
  id: string;
  title: string;
  state: "open" | "merged" | "closed";
  mergedAt: string | null;
};

export type PortalPullRequestPage = {
  rows: PortalPullRequest[];
  page: number; // the (clamped) page rows holds
  total: number; // rows matching the current search
  totalAll: number; // rows regardless of search (tab badge)
};

export async function listPortalProgramPullRequests(
  actor: PortalActor,
  programId: string,
  opts: ProgramPrOptions = {},
): Promise<PortalPullRequestPage> {
  const empty = { rows: [], page: 1, total: 0, totalAll: 0 };
  const companyId = await ownedProgramCompany(actor, programId);
  if (!companyId) return empty;
  const detail = await getProgramDetail(companyId, programId, opts);
  if (!detail) return empty;
  return {
    rows: detail.pullRequests.map((p) => ({ id: p.id, title: p.title, state: p.state, mergedAt: p.mergedAt })),
    page: detail.prPage,
    total: detail.prTotal,
    totalAll: detail.prTotalAll,
  };
}

// ── Shipped highlights ───────────────────────────────────────────────────

export type ProgramHighlightWeek = {
  isoWeek: string; // "2026-W34"
  titles: string[];
};

const HIGHLIGHT_WEEKS = 8;

// PostgREST caps a response at 1000 rows; page through so an active repo's
// full 8-week window still lists completely (same pattern as
// lib/hub/program.ts). The total order ends on the unique id so pages never
// repeat or skip rows; the window filter bounds the loop.
const PAGE = 1000;

// Merged PR TITLES across a program's repos, grouped by ISO week, newest week
// first, over exactly the same lastIsoWeeks(8) set as the delivered-hours
// chart. Titles only: no numbers, URLs, or author logins. Scope is resolved
// here (actor + programId), never trusted from the caller.
export async function getProgramHighlights(
  actor: PortalActor,
  programId: string,
): Promise<ProgramHighlightWeek[]> {
  const companyId = await ownedProgramCompany(actor, programId);
  if (!companyId) return [];
  // Every repo the program owns (X.1). This was .maybeSingle(), which errors on
  // a second repo and blanked the whole section.
  const { data: repoRows, error: repoRowError } = await htt.from("repos").select("id").eq("ai_program_id", programId);
  if (repoRowError) console.error("[portal] repos read failed:", repoRowError.message);
  const repoIds = ((repoRows ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (repoIds.length === 0) return [];

  // Generous lower bound (a calendar window can span 9 ISO weeks); the week
  // set below is the exact filter.
  const since = new Date(Date.now() - (HIGHLIGHT_WEEKS + 1) * 7 * 86_400_000).toISOString();
  const rows: Array<{ title: string; merged_at: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error: pullRequestsError } = await htt
      .from("pull_requests")
      .select("title, merged_at")
      .in("repo_id", repoIds)
      .eq("state", "merged")
      .gte("merged_at", since)
      .order("merged_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (pullRequestsError) console.error("[portal] pull_requests read failed:", pullRequestsError.message);
    const page = (data ?? []) as Array<{ title: string; merged_at: string }>;
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const weekSet = new Set(lastIsoWeeks(HIGHLIGHT_WEEKS));
  const weeks: ProgramHighlightWeek[] = [];
  const byWeek = new Map<string, string[]>();
  for (const r of rows) {
    const label = isoWeekLabel(new Date(r.merged_at));
    if (!weekSet.has(label)) continue;
    let bucket = byWeek.get(label);
    if (!bucket) {
      bucket = [];
      byWeek.set(label, bucket);
      weeks.push({ isoWeek: label, titles: bucket });
    }
    bucket.push(r.title);
  }
  return weeks;
}
