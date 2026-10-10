import { currentQuarter, krCode, objectiveCode, selectKeyResults, selectObjectives } from "@/entities/org";
import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { type GoalStatus, type PriorityStatus, type EdgesLadder, type GoalComment, type CoachingGoal, type EdgesOptions } from "../types";
import { type PersonEmbed } from "./rows";
import { type Result } from "./shared";
import { isRenderableLink, type PriorityLink } from "../priority-link";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";

export type CoachingPriority = {
  id: string;
  title: string;
  detailMarkdown: string | null;
  status: PriorityStatus;
  ladder: EdgesLadder | null;
  sortOrder: number;
  // One optional thing to read or do about this priority (L.6). Null is the
  // common case and not an empty state: a priority with nothing attached is
  // exactly what every priority was before this existed.
  link: PriorityLink | null;
};

export type OceanDimension = { rating: string | null; evidence: string | null };

export type OceanProfile = {
  id: string;
  openness: OceanDimension;
  conscientiousness: OceanDimension;
  extraversion: OceanDimension;
  agreeableness: OceanDimension;
  neuroticism: OceanDimension;
  snapshotMarkdown: string | null;
  guidanceMarkdown: string | null;
  published: boolean;
  updatedAt: string;
};

// Throws rather than returning empty on an outage. Every caller either renders
// the ladder picker or resolves a ladder label with it, so an empty result is
// not "no company goals" — it is a goal form that silently forgets what a goal
// laddered to, and a directory that reports every goal as unaligned (K.13,
// spec §10, "silent failures").
export async function getEdgesLadderOptions(): Promise<EdgesOptions> {
  // Ordered by id after sort_order so tied sort orders (several KRs sit at 100)
  // number the same way here as on Company Goals, which breaks ties the same way.
  const [objs, krs] = await Promise.all([
    selectObjectives("id, title, level, year, status, sort_order").order("sort_order").order("id"),
    selectKeyResults("id, title, objective_id, sort_order").order("sort_order").order("id"),
  ]);
  if (objs.error || krs.error) {
    console.error("[team/coaching/goals] edges ladder options", objs.error ?? krs.error);
    throw new Error("Could not load the company goals this ladders to.");
  }
  return numberEdges(
    (objs.data ?? []) as EdgesObjectiveRow[],
    (krs.data ?? []) as EdgesKrRow[],
    currentQuarter().start.getFullYear(),
  );
}

type EdgesObjectiveRow = { id: string; title: string; level: string; year: number | null; status: string };
type EdgesKrRow = { id: string; title: string; objective_id: string | null };

// Numbers the rows the way Company Goals does (team's getCompanyGoals): this
// year's company objectives that are not dropped, in the order given, each with
// its key results in the order given. Everything else is kept uncoded rather
// than dropped, so an older goal's ladder still resolves to its label.
export function numberEdges(objectives: EdgesObjectiveRow[], krs: EdgesKrRow[], year: number): EdgesOptions {
  const numbered = objectives.filter((o) => o.level === "company" && o.year === year && o.status !== "dropped");
  const objectiveIndex = new Map(numbered.map((o, i) => [o.id, i] as const));
  const krIndex = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const k of krs) {
    if (!k.objective_id || !objectiveIndex.has(k.objective_id)) continue;
    const n = seen.get(k.objective_id) ?? 0;
    krIndex.set(k.id, n);
    seen.set(k.objective_id, n + 1);
  }
  const codedFirst = [...numbered, ...objectives.filter((o) => !objectiveIndex.has(o.id))];
  return {
    objectives: codedFirst.map((o) => {
      const i = objectiveIndex.get(o.id);
      return { id: o.id, label: o.title, code: i === undefined ? null : objectiveCode(i) };
    }),
    keyResults: krs.map((k) => {
      const j = krIndex.get(k.id);
      const i = k.objective_id ? objectiveIndex.get(k.objective_id) : undefined;
      return {
        id: k.id,
        label: k.title,
        objectiveId: k.objective_id,
        code: i === undefined || j === undefined ? null : krCode(i, j),
      };
    }),
  };
}

// Writes/picker ladder to a key result only, but a handful of legacy goals still
// carry a direct objective_id: read and render those too.
function resolveLadder(
  r: { objective_id: string | null; key_result_id: string | null },
  edges: EdgesOptions,
): EdgesLadder | null {
  if (r.objective_id) {
    const o = edges.objectives.find((x) => x.id === r.objective_id);
    return o ? { kind: "objective", id: o.id, label: o.label } : null;
  }
  if (r.key_result_id) {
    const k = edges.keyResults.find((x) => x.id === r.key_result_id);
    return k ? { kind: "key_result", id: k.id, label: k.label } : null;
  }
  return null;
}

export const GOAL_SELECT =
  "id, coaching_profile_id, title, description_markdown, status, quarter_label, objective_id, key_result_id, " +
  "metric_unit, start_value, target_value, current_value, due_date, stretch_markdown, created_by, letter_md, letter_sealed_on";

export const PRIORITY_SELECT =
  "id, coaching_profile_id, title, detail_markdown, status, objective_id, key_result_id, sort_order, link_url, link_title";

type LadderRow = { objective_id: string | null; key_result_id: string | null };

// PostgREST can hand numeric back as a string; keep the type honest.
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

export function toGoal(r: Record<string, unknown>, edges: EdgesOptions): CoachingGoal {
  return {
    id: r.id as string,
    title: r.title as string,
    descriptionMarkdown: (r.description_markdown as string | null) ?? null,
    status: r.status as GoalStatus,
    quarterLabel: (r.quarter_label as string | null) ?? null,
    letterMd: (r.letter_md as string | null) ?? null,
    letterSealedOn: (r.letter_sealed_on as string | null) ?? null,
    ladder: resolveLadder(r as unknown as LadderRow, edges),
    comments: [],
    metricUnit: (r.metric_unit as string | null) ?? null,
    startValue: num(r.start_value),
    targetValue: num(r.target_value),
    currentValue: num(r.current_value),
    dueDate: (r.due_date as string | null) ?? null,
    stretchMarkdown: (r.stretch_markdown as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
  };
}

// Comments on FAST goals: team-wide readable, any team member can write
// (Frequent discussion is the F). Fetched per goal-id batch; the author name
// resolves through the team_members -> people forward embed.
export async function getGoalComments(goalIds: string[]): Promise<Map<string, GoalComment[]>> {
  const map = new Map<string, GoalComment[]>();
  if (goalIds.length === 0) return map;
  const { data, error: dataError } = await companyOs
    .from("coaching_goal_comments")
    .select(
      "id, goal_id, body, created_at, " +
        `team_members:team_members!author_team_member_id(people:people!person_id(${NAME_COLUMNS}, avatar_url))`,
    )
    .in("goal_id", goalIds)
    .order("created_at", { ascending: true });
  if (dataError) console.error("[team/coaching/goals] coaching_goal_comments", dataError);
  for (const r of ((data ?? []) as unknown as Record<string, unknown>[])) {
    const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
    const person = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
    const goalId = r.goal_id as string;
    const list = map.get(goalId) ?? [];
    list.push({
      id: r.id as string,
      goalId,
      authorName: personName(person, "-"),
      body: r.body as string,
      createdAt: r.created_at as string,
    });
    map.set(goalId, list);
  }
  return map;
}

export function attachComments(goals: CoachingGoal[], comments: Map<string, GoalComment[]>): CoachingGoal[] {
  return goals.map((g) => ({ ...g, comments: comments.get(g.id) ?? [] }));
}

export async function addGoalComment(
  actor: TeamActor,
  goalId: string,
  body: string,
): Promise<Result> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Write the comment first." };
  if (text.length > 2000) return { ok: false, error: "Keep it under 2,000 characters." };
  const { data: goal, error: goalError } = await companyOs
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .maybeSingle();
  if (goalError) console.error("[team/coaching/goals] goals", goalError);
  if (!goal) return { ok: false, error: "Goal not found." };
  const { error } = await companyOs.from("coaching_goal_comments").insert({
    goal_id: goalId,
    author_team_member_id: actor.teamMemberId,
    body: text,
  });
  return error ? { ok: false, error: "Could not add the comment." } : { ok: true };
}

export function toPriority(r: Record<string, unknown>, edges: EdgesOptions): CoachingPriority {
  return {
    id: r.id as string,
    title: r.title as string,
    detailMarkdown: (r.detail_markdown as string | null) ?? null,
    status: r.status as PriorityStatus,
    ladder: resolveLadder(r as unknown as LadderRow, edges),
    sortOrder: (r.sort_order as number) ?? 0,
    // isRenderableLink, not just a null check: rows written before the scheme
    // rule existed still reach the page, and a bad one becomes no link rather
    // than an href the browser is willing to execute.
    link: isRenderableLink(r.link_url as string | null)
      ? { url: r.link_url as string, title: ((r.link_title as string | null) || "") || new URL(r.link_url as string).host }
      : null,
  };
}

export const OCEAN_SELECT =
  "id, coaching_profile_id, openness_rating, openness_evidence, conscientiousness_rating, conscientiousness_evidence, " +
  "extraversion_rating, extraversion_evidence, agreeableness_rating, agreeableness_evidence, " +
  "neuroticism_rating, neuroticism_evidence, snapshot_markdown, guidance_markdown, published, updated_at";

export function toOcean(r: Record<string, unknown>): OceanProfile {
  const dim = (k: string): OceanDimension => ({
    rating: (r[`${k}_rating`] as string | null) ?? null,
    evidence: (r[`${k}_evidence`] as string | null) ?? null,
  });
  return {
    id: r.id as string,
    openness: dim("openness"),
    conscientiousness: dim("conscientiousness"),
    extraversion: dim("extraversion"),
    agreeableness: dim("agreeableness"),
    neuroticism: dim("neuroticism"),
    snapshotMarkdown: (r.snapshot_markdown as string | null) ?? null,
    guidanceMarkdown: (r.guidance_markdown as string | null) ?? null,
    published: Boolean(r.published),
    updatedAt: r.updated_at as string,
  };
}
