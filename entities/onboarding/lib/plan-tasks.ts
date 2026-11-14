// The hire's checklist: onboarding_tasks rows read for the board and the /team
// home, the category labels, and the seed from a markdown plan's checkbox
// lines (plan-tasks-parse.ts). Split from cycle.ts, which keeps the journey
// clock, the milestones and the plan file itself.
import { companyOs } from "@/kernel/data/supabase";
import { parsePlanTasks } from "./plan-tasks-parse";

export const DAY1_CATEGORY = "day_1";

export type OnboardingTask = {
  id: string;
  teamMemberId: string;
  title: string;
  status: string;
  category: string | null;
  description: string | null;
};

// Every onboarding task for these members, not just the Day 1 three. A plan
// uploaded as markdown is a read-only document, so the checklist items in it
// are seeded as rows here and ticked off in the UI. Ordered by category then
// position so grouping in the board is a straight walk over the list.
export async function getOnboardingTasks(teamMemberIds: string[]): Promise<OnboardingTask[]> {
  if (teamMemberIds.length === 0) return [];
  const { data, error: tasksError } = await companyOs
    .from("onboarding_tasks")
    .select("id, team_member_id, title, status, category, description, position")
    .in("team_member_id", teamMemberIds)
    .order("category", { ascending: true })
    .order("position", { ascending: true });
  if (tasksError) console.error("[onboarding-cycle] onboarding_tasks", tasksError);
  return ((data ?? []) as Array<{
    id: string;
    team_member_id: string;
    title: string;
    status: string;
    category: string | null;
    description: string | null;
  }>).map((t) => ({
    id: t.id,
    teamMemberId: t.team_member_id,
    title: t.title,
    status: t.status,
    category: t.category,
    description: t.description,
  }));
}

// Human label for a task category. Day 1 keeps its name; plan categories are
// seeded as `week_1`…`week_7_8` from the uploaded plan's section headings.
export function taskCategoryLabel(category: string | null): string {
  if (!category) return "Other";
  if (category === DAY1_CATEGORY) return "Day 1 orientation";
  if (category === "week_7_8") return "Weeks 7 and 8";
  const m = /^week_(\d+)$/.exec(category);
  if (m) return `Week ${m[1]}`;
  return humanizeCategory(category);
}

function humanizeCategory(c: string): string {
  const s = c.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Average Day 8 score (1-5) per response id.
// A markdown plan's checkbox lines, filed by week, become the hire's checklist
// (plan-tasks-parse.ts). Rows already present for that week and title are kept
// with their status, so re-uploading a revised plan adds what is new and never
// unticks anything. Nothing is removed: the app role has no DELETE grant on
// company_os, and a line dropped from the plan is a manager's call to skip.
export async function seedPlanTasks(teamMemberId: string, markdown: string): Promise<number> {
  const parsed = parsePlanTasks(markdown);
  if (parsed.length === 0) return 0;
  const { data: existing, error: existingError } = await companyOs
    .from("onboarding_tasks")
    .select("category, title, position")
    .eq("team_member_id", teamMemberId);
  if (existingError) {
    console.error("[onboarding-cycle] onboarding_tasks", existingError);
    return 0;
  }
  const have = new Set((existing ?? []).map((t) => `${t.category ?? ""}\u0000${t.title}`));
  let position = (existing ?? []).reduce((max, t) => Math.max(max, t.position ?? 0), -1) + 1;
  const rows = parsed
    .filter((t) => !have.has(`${t.category}\u0000${t.title}`))
    .map((t) => ({
      team_member_id: teamMemberId,
      title: t.title,
      category: t.category,
      status: t.done ? "done" : "todo",
      completed_at: t.done ? new Date().toISOString() : null,
      position: position++,
    }));
  if (rows.length === 0) return 0;
  const { error } = await companyOs.from("onboarding_tasks").insert(rows);
  if (error) {
    console.error("[onboarding-cycle] plan task seed failed:", error.message);
    return 0;
  }
  return rows.length;
}
