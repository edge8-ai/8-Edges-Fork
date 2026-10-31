import type { TeamActor } from "@/kernel/identity/team-auth";
import {
  getCycleRowsFor,
  getOnboardingTasks,
  taskCategoryLabel,
  cycleDay,
  saigonToday,
  addDays,
} from "@/entities/onboarding";

// The new hire's own onboarding, shaped for the /team home: where they are in
// the 60 days, the six checkpoints every plan shares, and this week's checklist
// from the plan. Read through onboarding's door; scoped to the actor's own
// journey by construction (one team member id, theirs).

export const PLAN_DAYS = 60;

export type HomeMilestone = { day: number; label: string; on: string | null; state: "done" | "now" | "next" };
export type HomeTask = { id: string; title: string; done: boolean; group: string };
export type HomeWeek = { label: string; tasks: HomeTask[]; done: number; remaining: string | null };

export type HomeOnboarding = {
  journeyId: string;
  hasPlan: boolean;
  dayNumber: number | null;
  startDate: string | null;
  reviewOn: string | null;
  decisionOn: string | null;
  milestones: HomeMilestone[];
  week: HomeWeek | null;
};

// The checkpoints every plan carries, by day. The FAST goal milestone is
// "done" when the hire has a goal, not by the clock; the rest are dates.
const MILESTONES: Array<{ day: number; label: string }> = [
  { day: 1, label: "Day 1" },
  { day: 7, label: "FAST goal" },
  { day: 8, label: "Check-in survey" },
  { day: 30, label: "First milestone" },
  { day: 45, label: "Probation review" },
  { day: 60, label: "Decision" },
];

// The plan's week sections are seeded as task categories `week_1` … `week_7_8`;
// the Day 1 orientation rows sit with week 1.
function categoryForWeek(week: number): string[] {
  if (week <= 1) return ["day_1", "week_1"];
  if (week >= 7) return ["week_7_8", "week_7", "week_8"];
  return [`week_${week}`];
}

export async function getHomeOnboarding(actor: TeamActor, hasGoal: boolean): Promise<HomeOnboarding | null> {
  const [row] = await getCycleRowsFor([actor.teamMemberId]);
  if (!row) return null;
  const tasks = await getOnboardingTasks([actor.teamMemberId]);

  const today = saigonToday();
  const start = row.member.startDate;
  const dayNumber = start ? cycleDay(start, today) : null;
  const day = dayNumber ?? 0;

  // The review is day 45 of the plan; the decision is the stored probation end
  // when HR set one (a contract date can differ from start + 59 by a day or
  // two), otherwise day 60.
  const reviewOn = start ? addDays(start, 44) : null;
  const decisionOn = row.member.probationEndsOn ?? (start ? addDays(start, PLAN_DAYS - 1) : null);

  const milestones: HomeMilestone[] = MILESTONES.map((m) => {
    const reached = m.day === 7 ? hasGoal || day > 7 : day >= m.day;
    return {
      day: m.day,
      label: m.label,
      on: m.day === PLAN_DAYS ? decisionOn : start ? addDays(start, m.day - 1) : null,
      state: reached ? "done" : "next",
    };
  });
  // The first unreached checkpoint is the one to look at now.
  const now = milestones.find((m) => m.state === "next");
  if (now) now.state = "now";

  // This week's checklist: the current week's rows, or the first week that
  // still has something open when the current week has no rows of its own.
  const week = Math.min(8, Math.max(1, Math.ceil(day / 7)));
  let pick = tasks.filter((t) => categoryForWeek(week).includes(t.category ?? ""));
  if (pick.length === 0) {
    const open = tasks.find((t) => t.status !== "done");
    if (open) pick = tasks.filter((t) => t.category === open.category);
  }
  const homeWeek: HomeWeek | null =
    pick.length > 0
      ? {
          label: taskCategoryLabel(pick[0].category),
          tasks: pick.map((t) => ({ id: t.id, title: t.title, done: t.status === "done", group: taskCategoryLabel(t.category) })),
          done: pick.filter((t) => t.status === "done").length,
          remaining: (() => {
            const later = tasks.filter((t) => !pick.includes(t) && t.status !== "done");
            return later.length > 0 ? `${later.length} more in later weeks` : null;
          })(),
        }
      : null;

  return {
    journeyId: row.id,
    hasPlan: Boolean(row.plan_path || row.plan_url),
    dayNumber,
    startDate: start,
    reviewOn,
    decisionOn,
    milestones,
    week: homeWeek,
  };
}
