// What the Onboarding screen says about how new hires are doing: who left
// before probation ended, how many stayed, and what the Day 8 survey said
// question by question. The board shows where each person is; these are the
// outcomes it could not show (two people who had left were still drawn on it
// as in progress, 11 Nov 2026). Every read made in this file raises on
// failure, so a failed read cannot show as "nobody left".
//
// Names, exit reasons and written answers are the team's records (org.people).
// Each function takes the reader and returns counts only to one who does not
// hold it: the person-level rows are never built for them, so nothing
// downstream can show or serialize them by mistake. outcomes.test.ts pins it.
// This module is not on the entity's door for the same reason: it reads with
// the service role and has one caller, the admin Onboarding page.
import { companyOs } from "@/kernel/data/supabase";
import { mustCount, mustRows } from "@/kernel/data/read";
import { one } from "@/kernel/config/embedded";
import { addDays, diffDays } from "@/kernel/config/dates";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { surveyAnswerValues, surveyAnswersOf, surveyFields, surveyToRun } from "@/entities/org";
import { DAY8_SURVEY_SLUG } from "./cycle-constants";

/** Who is asking: whether they hold the team's records (org.people). */
export type OutcomesReader = { people: boolean };

// A question's average shows once this many people have answered it, the same
// floor the Training figures keep, so one person's rating cannot be read off.
export const MIN_ANSWERS = 3;

// Probation runs sixty days from the start date when the record names no end.
const PROBATION_DAYS = 59;
const ON_PROBATION = ["active", "pre_start", "on_leave"];

export type ProbationExit = {
  teamMemberId: string;
  name: string;
  endDate: string | null;
  /** The day of their employment they left on, counting the start date as day 1. */
  dayLeft: number | null;
  reason: string | null;
  decision: string | null;
  day8Score: number | null;
  day8Answered: boolean;
  hadPlan: boolean;
  /** False when they never had an onboarding record at all. */
  hadRecord: boolean;
};

export type HiringOutcomes = {
  /** Everyone who started in the twelve months to today. */
  hires: number;
  onProbation: number;
  /** Started in the window, no longer on probation, still counted as having stayed past it. */
  stayed: number;
  /** How many of the hires left before probation ended. */
  lost: number;
  /** Who they were: empty for a reader without the team's records. */
  exits: ProbationExit[];
  /** Everyone whose recorded last day falls in this calendar year, whenever they started. */
  leftThisYear: number;
};

type Tm = {
  id: string;
  status: string;
  employment_stage: string | null;
  start_date: string | null;
  end_date: string | null;
  probation_ends_on: string | null;
  termination_reason: string | null;
  people: NamedPerson | NamedPerson[] | null;
};

/** Left while still on probation: marked so, or with a last day inside the probation window. */
function leftInProbation(t: Tm): boolean {
  if (t.status !== "alumni") return false;
  if (t.employment_stage === "probation") return true;
  if (!t.end_date || !t.start_date) return false;
  return t.end_date <= (t.probation_ends_on ?? addDays(t.start_date, PROBATION_DAYS));
}

export async function hiringOutcomes(todayISO: string, reader: OutcomesReader): Promise<HiringOutcomes> {
  const since = addDays(todayISO, -365);
  const [hiresRes, leftRes] = await Promise.all([
    companyOs
      .from("team_members")
      .select(`id, status, employment_stage, start_date, end_date, probation_ends_on, termination_reason, people:people!person_id(${NAME_COLUMNS})`)
      .gte("start_date", since)
      .order("end_date", { ascending: false }),
    companyOs.from("team_members").select("id", { count: "exact", head: true }).eq("status", "alumni").gte("end_date", `${todayISO.slice(0, 4)}-01-01`),
  ]);
  const hires = mustRows(hiresRes, "[onboarding/outcomes] hires of the last twelve months") as unknown as Tm[];
  const leftThisYear = mustCount(leftRes, "[onboarding/outcomes] leavers this year");

  const gone = hires.filter(leftInProbation);
  const onProbation = hires.filter((t) => t.employment_stage === "probation" && ON_PROBATION.includes(t.status)).length;

  const counts = { hires: hires.length, onProbation, stayed: hires.length - onProbation - gone.length, lost: gone.length, leftThisYear };
  if (!reader.people) return { ...counts, exits: [] };

  const plans = gone.length
    ? (mustRows(
        await companyOs.from("onboarding_plans").select("team_member_id, decision, day8_response_id, plan_url, plan_path").in("team_member_id", gone.map((t) => t.id)),
        "[onboarding/outcomes] the leavers' onboarding records",
      ) as { team_member_id: string; decision: string | null; day8_response_id: string | null; plan_url: string | null; plan_path: string | null }[])
    : [];
  const planOf = new Map(plans.map((p) => [p.team_member_id, p]));
  const responseIds = plans.map((p) => p.day8_response_id ?? "").filter(Boolean);
  const values = responseIds.length ? mustRows(await surveyAnswerValues(responseIds), "[onboarding/outcomes] the leavers' Day 8 answers") : [];
  const scores = new Map<string, number>();
  for (const id of responseIds) {
    const ns = values.filter((v) => v.response_id === id).map((v) => Number(v.value)).filter((n) => Number.isFinite(n));
    if (ns.length) scores.set(id, Math.round((ns.reduce((s, n) => s + n, 0) / ns.length) * 10) / 10);
  }

  const exits: ProbationExit[] = gone.map((t) => {
    const plan = planOf.get(t.id);
    return {
      teamMemberId: t.id,
      name: personName(one(t.people), "Unnamed"),
      endDate: t.end_date,
      dayLeft: t.start_date && t.end_date ? diffDays(t.start_date, t.end_date) + 1 : null,
      reason: t.termination_reason,
      decision: plan?.decision ?? null,
      day8Score: plan?.day8_response_id ? scores.get(plan.day8_response_id) ?? null : null,
      day8Answered: Boolean(plan?.day8_response_id),
      hadPlan: Boolean(plan?.plan_url || plan?.plan_path),
      hadRecord: Boolean(plan),
    };
  });

  return { ...counts, exits };
}

export type Day8Results = {
  responses: number;
  /** Rating questions with at least MIN_ANSWERS answers, highest average first. */
  ratings: { label: string; avg: number; answers: number }[];
  /** How many written answers there are. */
  writtenCount: number;
  /** The written answers with who wrote them: empty for a reader without the team's records. */
  written: { question: string; name: string; text: string }[];
};

// The question types whose answer is prose. A choice or a file is neither a
// rating nor something to quote.
const WRITTEN_TYPES = new Set(["long_text", "short_text", "text"]);

/** The Day 8 survey, question by question, for the responses these new hires gave. */
export async function day8Results(answered: { responseId: string; name: string }[], reader: OutcomesReader): Promise<Day8Results> {
  const empty: Day8Results = { responses: answered.length, ratings: [], writtenCount: 0, written: [] };
  if (answered.length === 0) return empty;
  const survey = await surveyToRun(DAY8_SURVEY_SLUG);
  if (survey.error) throw new Error(`[onboarding/outcomes] the Day 8 survey: ${survey.error.message}`);
  if (!survey.data) return empty;
  const [fields, answers] = await Promise.all([
    surveyFields(survey.data.id).then((r) => mustRows(r, "[onboarding/outcomes] the Day 8 questions")),
    surveyAnswersOf(answered.map((a) => a.responseId)).then((r) => mustRows(r, "[onboarding/outcomes] the Day 8 answers")),
  ]);
  const nameOf = new Map(answered.map((a) => [a.responseId, a.name]));
  const ratings: Day8Results["ratings"] = [];
  const written: Day8Results["written"] = [];
  let writtenCount = 0;
  for (const f of fields) {
    const mine = answers.filter((a) => a.field_id === f.id);
    if (f.type === "rating") {
      const ns = mine.map((a) => Number(a.value)).filter((n) => Number.isFinite(n) && n > 0);
      if (ns.length >= MIN_ANSWERS) ratings.push({ label: f.label, avg: Math.round((ns.reduce((s, n) => s + n, 0) / ns.length) * 10) / 10, answers: ns.length });
      continue;
    }
    if (!WRITTEN_TYPES.has(f.type)) continue;
    for (const a of mine) {
      const text = (a.value ?? "").trim();
      if (!text) continue;
      writtenCount += 1;
      if (reader.people) written.push({ question: f.label, name: nameOf.get(a.response_id) ?? "A new hire", text });
    }
  }
  ratings.sort((a, b) => b.avg - a.avg);
  return { responses: answered.length, ratings, writtenCount, written };
}
