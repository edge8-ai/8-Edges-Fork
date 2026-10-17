// Shared, company-scoped loaders for the AI Program view (Client Hub by AI
// Program, PR 1). An AI Program = one company_os.ai_programs row, owning any
// number of htt.repos rows (tracker telemetry; X.1 — a product split into front
// end and back end, or a modular monolith with a repo per component, is one
// program), plus roadmap items, boards, and documents tagged via their nullable
// ai_program_id columns. Every delivery figure is the sum over the program's
// repos.
//
// Same discipline as lib/admin/company-hub.ts: these take a companyId directly
// and never widen scope; authorization is the caller's gate (requireAdmin via
// the admin layout today, team/portal actors later). Reads go through the
// service-role companyOs/htt clients.
//
// Every loader degrades: a program with no htt repo returns zeros/nulls for
// delivery stats, and a company with no programs returns an empty list.

import { companyOs, htt } from "@/kernel/data/supabase";
import { selectTasks, selectBoards } from "@/entities/boards";
import { BACKLOG_SELECT, ROADMAP_GROUPS_SELECT, type BacklogItem, type RoadmapGroup } from "@/entities/client-programs";
import { selectClientRoadmapGroups, selectClientBacklogItems, selectAiPrograms } from "@/entities/client-programs";
import { listDocumentsForCompanies, type ClientDocument } from "@/entities/portal";
import { fetchDeliveryRaw, humanHoursOf, leverageOf, type DeliveryRaw } from "@/entities/portal";
import { getMeetingsForCompany, type AdminMeetingRow } from "@/entities/crm";
import { fetchPrPage, type PrPage, type ProgramPrOptions, type ProgramPullRequest } from "./hub-program-prs";

export type ProgramStatus = "draft" | "active" | "complete" | "archived";

// One of the htt repos a program owns.
export type ProgramRepo = {
  id: string;
  name: string;
  githubRepo: string | null;
  liveUrl: string | null;
  lastSyncedAt: string | null;
};

export type ProgramSummary = {
  id: string;
  name: string;
  status: ProgramStatus;
  // The program's htt repos, in the delivery rows' order; empty when none is connected.
  repos: ProgramRepo[];
  // The product's site: a repo's custom domain before any platform subdomain (see programLiveUrl).
  liveUrl: string | null;
  // The OLDEST sync among the repos, so the program never reads fresher than its stalest repo.
  lastSyncedAt: string | null;
  // Delivery stats, summed over every repo (zeros when no repo is connected).
  deliveredHours: number;
  aiTokens: number; // token_entries, kind claude/app
  leverage: number | null; // value tokens per delivered hour (multiple); null when no hours
  prsMergedLast7d: number;
  // Company OS rollups (by ai_program_id).
  roadmapDone: number; // backlog items with status 'shipped'
  roadmapTotal: number;
  boardCount: number; // active boards keyed to this program
};

export type ProgramBoard = {
  id: string;
  name: string;
  slug: string;
  cardCount: number; // live top-level cards
};

export type ProgramWeek = {
  isoWeek: string; // e.g. "2026-W34"
  hours: number;
};

export type ProgramDetail = ProgramSummary & {
  plannedTokens: number; // SUM(token_high) of the program's backlog items
  prsMergedLast30d: number;
  roadmapGroups: RoadmapGroup[];
  roadmapItems: BacklogItem[];
  boards: ProgramBoard[];
  pullRequests: ProgramPullRequest[]; // one page (PR_PAGE_SIZE), server-filtered
  prPage: number; // the (clamped) page pullRequests holds
  prTotal: number; // full count matching the current search filter
  prTotalAll: number; // full count regardless of filter (tab badge)
  weeklyHours: ProgramWeek[]; // last 8 ISO weeks, oldest first
  documents: ClientDocument[];
  meetings: AdminMeetingRow[]; // meetings tagged to this program (meetings.ai_program_id)
};


// PostgREST caps a response at 1000 rows; page through so a repo with more
// tracked entries than that still sums correctly (same pattern as
// the portal's tokens.ts). Every factory MUST carry a total order ending on a
// unique column (id) so pages never repeat or skip rows. Exported so the
// other hub-grain consumers of the same capped tables (the admin hub home,
// lib/team/clients.ts) page identically instead of re-deriving the pattern.
const PAGE = 1000;
export async function fetchAll<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error: pageError } = await build().range(from, from + PAGE - 1);
    if (pageError) console.error("[team/hub] fetchAll page", pageError);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

type ProgramRow = {
  id: string;
  name: string;
  status: ProgramStatus;
};

// The select behind ProgramRow, exported so a surface that already needs the
// full ai_programs rows (the hub home) can fetch them once and hand them in.
// A program's repos come from htt.repos, not from the program row (X.1).
export const PROGRAM_SELECT = "id, name, status";

// Everything listProgramSummaries aggregates over, so a caller that already
// fetched these datasets for its own rendering (the hub home fetches the full
// backlog, board and delivery rows anyway) can pass them in and no dataset is
// fetched twice per page load. Shapes are structural minimums; richer rows
// (e.g. full BacklogItem) satisfy them.
export type ProgramSummaryInputs = {
  programs: ProgramRow[];
  delivery: DeliveryRaw;
  backlogRows: Array<{ ai_program_id: string | null; status: string }>; // active items
  boardRows: Array<{ ai_program_id: string | null }>; // active boards
};

export async function fetchProgramSummaryInputs(companyId: string): Promise<ProgramSummaryInputs> {
  const [{ data: programData }, delivery, backlogRows, boardRows] = await Promise.all([
    selectAiPrograms(PROGRAM_SELECT)
      .eq("company_id", companyId)
      .neq("status", "archived") // archived programs are hidden from every hub band
      .order("created_at", { ascending: false }),
    fetchDeliveryRaw([companyId]),
    fetchAll<{ ai_program_id: string | null; status: string }>(() =>
      selectClientBacklogItems("ai_program_id, status")
        .eq("company_id", companyId)
        .is("archived_at", null)
        .order("id"),
    ),
    fetchAll<{ ai_program_id: string | null }>(() =>
      selectBoards("ai_program_id")
        .eq("client_company_id", companyId)
        .eq("status", "active")
        .is("archived_at", null)
        .order("id"),
    ),
  ]);
  return { programs: (programData ?? []) as ProgramRow[], delivery, backlogRows, boardRows };
}

// A hosting platform's default subdomain is where one component deploys (an
// API's preview host), not the product's site; a custom domain is the site.
const PLATFORM_HOST = /\.(vercel\.app|netlify\.app|onrender\.com|fly\.dev|herokuapp\.com|pages\.dev|github\.io)$/i;

/** The program's live site: the first repo's custom domain, else the first live URL at all. */
function programLiveUrl(liveUrls: Array<string | null>): string | null {
  const urls = liveUrls.filter((u): u is string => !!u);
  const host = (u: string) => {
    try {
      return new URL(u).hostname;
    } catch {
      return "";
    }
  };
  return urls.find((u) => !PLATFORM_HOST.test(host(u))) ?? urls[0] ?? null;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function listProgramSummaries(
  companyId: string,
  pre?: ProgramSummaryInputs,
): Promise<ProgramSummary[]> {
  const inputs = pre ?? (await fetchProgramSummaryInputs(companyId));
  const { programs, backlogRows, boardRows } = inputs;
  const { repos, hourRows, aiRows } = inputs.delivery;
  if (programs.length === 0) return [];
  const reposByProgram = new Map<string, typeof repos>();
  for (const r of repos) {
    if (!r.ai_program_id) continue;
    reposByProgram.set(r.ai_program_id, [...(reposByProgram.get(r.ai_program_id) ?? []), r]);
  }
  const repoIds = repos.map((r) => r.id);

  // The only repo-dependent query; everything else arrives via the inputs.
  // Cutoff hoisted so every fetchAll page uses the same value.
  const mergedSince = daysAgoIso(7);
  const mergedRows = repoIds.length
    ? await fetchAll<{ repo_id: string }>(() =>
        htt
          .from("pull_requests")
          .select("repo_id")
          .in("repo_id", repoIds)
          .eq("state", "merged")
          .gte("merged_at", mergedSince)
          .order("id"),
      )
    : [];

  const hoursByRepo = new Map<string, number>();
  // Leverage divides by hands-on hours, never by the billed total (which carries
  // unattended-AI credit); see leverageOf in the portal's hub-tokens.
  const humanByRepo = new Map<string, number>();
  for (const r of hourRows) {
    if (!r.repo_id) continue;
    hoursByRepo.set(r.repo_id, (hoursByRepo.get(r.repo_id) ?? 0) + Number(r.hours ?? 0));
    humanByRepo.set(r.repo_id, (humanByRepo.get(r.repo_id) ?? 0) + humanHoursOf(r));
  }
  const aiByRepo = new Map<string, number>();
  for (const r of aiRows) {
    if (!r.repo_id) continue;
    aiByRepo.set(r.repo_id, (aiByRepo.get(r.repo_id) ?? 0) + Number(r.amount ?? 0));
  }
  const mergedByRepo = new Map<string, number>();
  for (const r of mergedRows) {
    mergedByRepo.set(r.repo_id, (mergedByRepo.get(r.repo_id) ?? 0) + 1);
  }

  const doneByProgram = new Map<string, number>();
  const totalByProgram = new Map<string, number>();
  for (const r of backlogRows) {
    if (!r.ai_program_id) continue;
    totalByProgram.set(r.ai_program_id, (totalByProgram.get(r.ai_program_id) ?? 0) + 1);
    if (r.status === "shipped") {
      doneByProgram.set(r.ai_program_id, (doneByProgram.get(r.ai_program_id) ?? 0) + 1);
    }
  }

  const boardsByProgram = new Map<string, number>();
  for (const r of boardRows) {
    if (!r.ai_program_id) continue;
    boardsByProgram.set(r.ai_program_id, (boardsByProgram.get(r.ai_program_id) ?? 0) + 1);
  }

  const sum = (byRepo: Map<string, number>, own: typeof repos) => own.reduce((total, r) => total + (byRepo.get(r.id) ?? 0), 0);

  return programs.map((p) => {
    const own = reposByProgram.get(p.id) ?? [];
    const ai = sum(aiByRepo, own);
    // ISO timestamps compare as strings; a repo never synced makes the whole program "not synced".
    const syncs = own.map((r) => r.last_synced_at);
    const lastSyncedAt = syncs.length === 0 || syncs.includes(null) ? null : (syncs as string[]).reduce((a, b) => (b < a ? b : a));
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      repos: own.map((r) => ({ id: r.id, name: r.name, githubRepo: r.github_repo, liveUrl: r.live_url, lastSyncedAt: r.last_synced_at })),
      liveUrl: programLiveUrl(own.map((r) => r.live_url)),
      lastSyncedAt,
      deliveredHours: sum(hoursByRepo, own),
      aiTokens: ai,
      leverage: leverageOf(ai, sum(humanByRepo, own)),
      prsMergedLast7d: sum(mergedByRepo, own),
      roadmapDone: doneByProgram.get(p.id) ?? 0,
      roadmapTotal: totalByProgram.get(p.id) ?? 0,
      boardCount: boardsByProgram.get(p.id) ?? 0,
    };
  });
}

// ISO week label ("2026-W34") for a date, and the last N week labels.
// Exported so the portal projection (the entity's program-hub.ts) buckets its
// shipped-highlights weeks with exactly the same convention as the chart.
export function isoWeekLabel(d: Date): string {
  // Thursday of the same ISO week determines the week-year.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function lastIsoWeeks(n: number): string[] {
  const weeks: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    weeks.push(isoWeekLabel(new Date(Date.now() - i * 7 * 86_400_000)));
  }
  return weeks;
}

export async function getProgramDetail(
  companyId: string,
  programId: string,
  prOpts: ProgramPrOptions = {},
): Promise<ProgramDetail | null> {
  const summaries = await listProgramSummaries(companyId);
  const summary = summaries.find((s) => s.id === programId);
  if (!summary) return null;

  const repoIds = summary.repos.map((r) => r.id);
  const WEEKS = 8;
  const weekLabels = lastIsoWeeks(WEEKS);
  const weekFloorIso = daysAgoIso(WEEKS * 7 + 7); // generous lower bound; bucketed below
  const merged30Since = daysAgoIso(30); // hoisted: same cutoff across fetchAll pages

  const [
    { data: groupData, error: groupErr },
    { data: itemData, error: itemErr },
    { data: boardData, error: boardErr },
    prPage,
    weekRows,
    merged30Rows,
    allDocuments,
    meetings,
  ] = await Promise.all([
    selectClientRoadmapGroups(ROADMAP_GROUPS_SELECT)
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true }),
    selectClientBacklogItems(BACKLOG_SELECT)
      .eq("company_id", companyId)
      .eq("ai_program_id", programId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true }),
    selectBoards("id, name, slug")
      .eq("client_company_id", companyId)
      .eq("ai_program_id", programId)
      .eq("status", "active")
      .is("archived_at", null)
      .order("sort_order", { ascending: true }),
    repoIds.length
      ? fetchPrPage(repoIds, prOpts)
      : Promise.resolve({ rows: [], page: 1, total: 0, totalAll: 0 } satisfies PrPage),
    repoIds.length
      ? fetchAll<{ occurred_on: string; hours: number }>(() =>
          htt
            .from("man_hour_entries")
            .select("occurred_on, hours")
            .in("repo_id", repoIds)
            .neq("status", "excluded")
            .gte("occurred_on", weekFloorIso.slice(0, 10))
            .order("id"),
        )
      : Promise.resolve([] as { occurred_on: string; hours: number }[]),
    repoIds.length
      ? fetchAll<{ id: string }>(() =>
          htt
            .from("pull_requests")
            .select("id")
            .in("repo_id", repoIds)
            .eq("state", "merged")
            .gte("merged_at", merged30Since)
            .order("id"),
        )
      : Promise.resolve([] as { id: string }[]),
    listDocumentsForCompanies([companyId]),
    getMeetingsForCompany(companyId, programId),
  ]);

  // A failed read must not render as an empty roadmap (the editor's empty state invites duplicate groups).
  const readErr = groupErr ?? itemErr ?? boardErr;
  if (readErr) throw new Error(`getProgramDetail: roadmap/board read failed: ${readErr.message}`);

  const roadmapItems = (itemData ?? []) as unknown as BacklogItem[];
  // The program's own sections, plus any company-wide section a program item
  // still sits under, so no item renders orphaned.
  const usedKeys = new Set(roadmapItems.map((i) => i.group_key));
  const roadmapGroups = ((groupData ?? []) as unknown as RoadmapGroup[]).filter(
    (g) => g.ai_program_id === programId || (g.ai_program_id === null && usedKeys.has(g.key)),
  );

  const boardRows = (boardData ?? []) as Array<{ id: string; name: string; slug: string }>;
  const cardsByBoard = new Map<string, number>();
  if (boardRows.length > 0) {
    const taskRows = await fetchAll<{ board_id: string }>(() =>
      selectTasks("board_id")
        .in("board_id", boardRows.map((b) => b.id))
        .is("archived_at", null)
        .is("parent_task_id", null)
        .order("id"),
    );
    for (const t of taskRows) {
      cardsByBoard.set(t.board_id, (cardsByBoard.get(t.board_id) ?? 0) + 1);
    }
  }

  const hoursByWeek = new Map<string, number>(weekLabels.map((w) => [w, 0]));
  for (const r of weekRows) {
    const label = isoWeekLabel(new Date(`${r.occurred_on}T00:00:00Z`));
    if (hoursByWeek.has(label)) {
      hoursByWeek.set(label, (hoursByWeek.get(label) ?? 0) + Number(r.hours ?? 0));
    }
  }

  const plannedTokens = roadmapItems.reduce((sum, i) => sum + Number(i.token_high ?? 0), 0);

  return {
    ...summary,
    plannedTokens,
    prsMergedLast30d: merged30Rows.length,
    roadmapGroups,
    roadmapItems,
    boards: boardRows.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      cardCount: cardsByBoard.get(b.id) ?? 0,
    })),
    pullRequests: prPage.rows,
    prPage: prPage.page,
    prTotal: prPage.total,
    prTotalAll: prPage.totalAll,
    weeklyHours: weekLabels.map((w) => ({ isoWeek: w, hours: hoursByWeek.get(w) ?? 0 })),
    documents: allDocuments.filter((d) => d.programId === programId),
    meetings,
  };
}

/**
 * The repo a program page's per-repo tools (hours ledger, sessions, AI story)
 * show: the one ?repo= names when it belongs to the program, else the first.
 * Null only for a program with no repo. A stale or foreign ?repo= falls back
 * rather than 404ing, so a link kept from before a repo moved still opens.
 */
export function selectedProgramRepo(repos: ProgramRepo[], param: string | undefined): ProgramRepo | null {
  return repos.find((r) => r.id === param) ?? repos[0] ?? null;
}
