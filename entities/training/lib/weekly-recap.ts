// The weekly recap agent (English Program PR 9, ADR 0015): one row per plan
// per week, its step on the row, advanced one step per tick. Friday it is
// drafted by Claude from the philosophy, the week's published session recaps,
// attendance and homework; it waits for the organiser to add, edit, send or
// hold it; at the Monday deadline it goes anyway, saying the instructor has
// not reviewed it. The email is the one outbound message of the programme,
// sent through kernel/messaging and logged to interactions by it. Nothing in
// it is a rating, a load, a skip reason or a review: the inputs never carry
// one and the validator holds the progress lines to published recap lines.
import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import { addDays, businessDate } from "@/kernel/config/dates";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { Philosophy } from "./philosophy";
import { Recap } from "./session-recap-rules";
import { renderWeeklyRecapEmail } from "../ui/WeeklyRecapEmail";
import { WEEKLY_RECAP_PROMPT } from "./weekly-recap.prompt";
import { MAX_SEND_ATTEMPTS, STEPS, WeeklyDraft, nextStep, sendAfterFor, subjectFor, validateProgress, weekLabel, type RecapEvent, type Step, type WeeklyDraftType } from "./weekly-recap-rules";

export const WEEKLY_RECAP_SITE = "training-weekly-recap";
// A report about named learners for their employer's contact: one person's record, class S.
export const WEEKLY_RECAP_CLASS: AiDataClass = "S";

export type WeeklyRecap = {
  id: string;
  planId: string;
  weekStart: string;
  step: Step;
  draft: WeeklyDraftType | null;
  instructorNote: string | null;
  editedAt: string | null;
  holdReason: string | null;
  sendAfter: string | null;
  sentAt: string | null;
  sentTo: { person_id: string; email: string }[];
  attempts: number;
  error: string | null;
};

type Row = { id: string; plan_id: string; week_start: string; step: string; draft: unknown; instructor_note: string | null; edited_at: string | null; hold_reason: string | null; send_after: string | null; sent_at: string | null; sent_to: unknown; attempts: number; error: string | null };

function view(r: Row): WeeklyRecap {
  const d = WeeklyDraft.safeParse(r.draft);
  return {
    id: r.id,
    planId: r.plan_id,
    weekStart: r.week_start,
    step: (STEPS as readonly string[]).includes(r.step) ? (r.step as Step) : "drafting",
    draft: d.success ? d.data : null,
    instructorNote: r.instructor_note,
    editedAt: r.edited_at,
    holdReason: r.hold_reason,
    sendAfter: r.send_after,
    sentAt: r.sent_at,
    sentTo: Array.isArray(r.sent_to) ? (r.sent_to as { person_id: string; email: string }[]) : [],
    attempts: r.attempts,
    error: r.error,
  };
}

const COLUMNS = "id, plan_id, week_start, step, draft, instructor_note, edited_at, hold_reason, send_after, sent_at, sent_to, attempts, error";

export async function readWeeklyRecap(planId: string, weekStart: string): Promise<WeeklyRecap | null> {
  const rows = mustRows(await companyOs.from("training_weekly_recaps").select(COLUMNS).eq("plan_id", planId).eq("week_start", weekStart).limit(1), "[training] weekly recap") as Row[];
  return rows[0] ? view(rows[0]) : null;
}

export async function listWeeklyRecaps(planId: string): Promise<WeeklyRecap[]> {
  const rows = mustRows(await companyOs.from("training_weekly_recaps").select(COLUMNS).eq("plan_id", planId).order("week_start", { ascending: false }).limit(52), "[training] weekly recaps") as Row[];
  return rows.map(view);
}

/** One drafting row per live plan with recipients for the week, created once. */
export async function openWeek(weekStart: string): Promise<{ created: number }> {
  const plans = mustRows(await companyOs.from("training_plans").select("id, recipients").is("archived_at", null).not("published_until", "is", null), "[training] live plans") as { id: string; recipients: unknown }[];
  let created = 0;
  for (const p of plans) {
    if (!Array.isArray(p.recipients) || p.recipients.length === 0) continue;
    const { error } = await companyOs.from("training_weekly_recaps").upsert({ plan_id: p.id, week_start: weekStart }, { onConflict: "plan_id,week_start", ignoreDuplicates: true });
    if (error) throw new Error(`[training] weekly recap row: ${error.message}`);
    created += 1;
  }
  return { created };
}

/** Rows not sent or held, oldest week first: what a tick advances. */
export async function openRecaps(): Promise<WeeklyRecap[]> {
  const rows = mustRows(await companyOs.from("training_weekly_recaps").select(COLUMNS).not("step", "in", "(sent,held)").order("week_start").limit(50), "[training] open weekly recaps") as Row[];
  return rows.map(view).filter((r) => r.step !== "failed" || r.attempts < MAX_SEND_ATTEMPTS);
}

async function apply(row: WeeklyRecap, event: RecapEvent, now: Date, by?: string): Promise<{ ok: true; step: Step } | { ok: false; error: string }> {
  const next = nextStep({ step: row.step, sendAfter: row.sendAfter, attempts: row.attempts, draft: row.draft }, event, now);
  if (!next) return { ok: false, error: `Nothing to do at ${row.step}.` };
  const patch: Record<string, unknown> = { step: next.step };
  if (next.draft) patch.draft = next.draft;
  if (next.sendAfter) patch.send_after = next.sendAfter;
  if (next.attempts !== undefined) patch.attempts = next.attempts;
  if ("error" in next) patch.error = next.error ?? null;
  if (next.holdReason) patch.hold_reason = next.holdReason;
  if (next.step === "sent") patch.sent_at = now.toISOString();
  if (by && (event.kind === "send-now" || event.kind === "hold")) Object.assign(patch, { edited_at: now.toISOString(), edited_by: by });
  // The step is a condition of the write, so two ticks cannot both move a row.
  const { data, error } = await companyOs.from("training_weekly_recaps").update(patch as TablesUpdate<{ schema: "company_os" }, "training_weekly_recaps">).eq("id", row.id).eq("step", row.step).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Another tick moved it first." };
  return { ok: true, step: next.step };
}

type SessionRow = { id: string; title: string; starts_at: string; recap: unknown; recap_state: string; attendance: { person_id: string; status: string }[]; assignments: { id: string; archived_at: string | null; submissions: { person_id: string }[] }[] };
type PlanRow = { id: string; title: string; organiser_id: string; philosophy: unknown; recipients: unknown; organiser: NamedPerson | null; members: { person_id: string; removed_at: string | null; person: NamedPerson | null }[] };

async function planOf(planId: string): Promise<PlanRow> {
  const rows = mustRows(
    await companyOs.from("training_plans").select(`id, title, organiser_id, philosophy, recipients, organiser:people!training_plans_organiser_id_fkey(${NAME_COLUMNS}), members:training_plan_members(person_id, removed_at, person:people!training_plan_members_person_id_fkey(${NAME_COLUMNS}))`).eq("id", planId).limit(1),
    "[training] plan for recap",
  ) as unknown as PlanRow[];
  if (!rows[0]) throw new Error(`[training] plan ${planId} not found`);
  return rows[0];
}

const DraftOutput = z.object({
  this_week: z.string(),
  attendance: z.string(),
  progress: z.array(z.object({ person_id: z.string(), md: z.string() })).describe("Only learners with a published line this week."),
  next_week: z.string(),
});

/** Step one: Claude drafts from the week's facts; the validator holds it to what the learners have seen. */
async function draft(row: WeeklyRecap, now: Date): Promise<{ ok: true; draft: WeeklyDraftType } | { ok: false; error: string }> {
  const plan = await planOf(row.planId);
  const from = `${row.weekStart}T00:00:00+07:00`;
  const to = `${addDays(row.weekStart, 7)}T00:00:00+07:00`;
  const sessions = mustRows(
    await companyOs.from("trainings").select("id, title, starts_at, recap, recap_state, attendance:training_attendance(person_id, status), assignments:training_assignments(id, archived_at, submissions:training_submissions(person_id))").eq("plan_id", row.planId).is("cancelled_at", null).gte("starts_at", from).lt("starts_at", to).order("starts_at"),
    "[training] week sessions",
  ) as unknown as SessionRow[];
  const nextWeek = mustRows(await companyOs.from("trainings").select("id, starts_at, blocks:training_session_blocks(side, text, exercise:training_exercises(title))").eq("plan_id", row.planId).is("cancelled_at", null).gte("starts_at", to).lt("starts_at", `${addDays(row.weekStart, 14)}T00:00:00+07:00`).order("starts_at"), "[training] next week") as unknown as { starts_at: string; blocks: { side: string; text: string | null; exercise: { title: string } | null }[] }[];
  const members = plan.members.filter((m) => m.removed_at === null);
  const names = new Map(members.map((m) => [m.person_id, m.person ? personName(m.person) : "A learner"]));
  const published = new Set<string>();
  const sessionText = sessions
    .map((s) => {
      const r = s.recap_state === "published" ? Recap.safeParse(s.recap) : null;
      if (r?.success) for (const l of r.data.learners) published.add(l.person_id);
      const lines = r?.success ? r.data.learners.map((l) => `  ${names.get(l.person_id) ?? "A learner"} (${l.person_id}): ${l.md}`).join("\n") : "  (recap not published)";
      return `${businessDate(s.starts_at)} ${s.title}: ${r?.success ? r.data.covered : "(no published recap)"}\n${lines}`;
    })
    .join("\n\n") || "(no sessions this week)";
  const held = sessions.length;
  const learnerText = members
    .map((m) => {
      const attended = sessions.filter((s) => s.attendance.some((a) => a.person_id === m.person_id && a.status === "attended")).length;
      const due = sessions.flatMap((s) => s.assignments.filter((a) => a.archived_at === null));
      const done = due.filter((a) => a.submissions.some((x) => x.person_id === m.person_id)).length;
      const hw = due.length === 0 ? "none set" : done === due.length ? "in" : `${done} of ${due.length} in`;
      return `${m.person_id} · ${names.get(m.person_id)} · ${attended} of ${held} · homework ${hw}`;
    })
    .join("\n");
  const nextText = nextWeek.map((s) => `${businessDate(s.starts_at)}: ${s.blocks.map((b) => b.exercise?.title ?? b.text ?? "").filter(Boolean).join(", ") || "plan not drafted yet"}`).join("\n") || "(nothing scheduled)";
  const ph = Philosophy.safeParse(plan.philosophy);
  const philosophy = ph.success ? `Purpose: ${ph.data.purpose}\nWhat good looks like: ${ph.data.good_looks_like.map((l) => l.line).join("; ")}` : "(not written)";

  const ai = aiSite({ site: WEEKLY_RECAP_SITE, dataClass: WEEKLY_RECAP_CLASS, tier: "standard" });
  const client = ai.clientIfConfigured();
  if (!client) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  try {
    const response = await client.messages.create({
      prompt: WEEKLY_RECAP_PROMPT,
      model: ai.model,
      max_tokens: 3000,
      system: WEEKLY_RECAP_PROMPT.system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: jsonSchemaFor(DraftOutput) } },
      messages: [{ role: "user", content: fillPrompt(WEEKLY_RECAP_PROMPT.user, { title: plan.title, week: weekLabel(row.weekStart), philosophy, sessions: sessionText, learners: learnerText || "(nobody on the plan)", nextWeek: nextText }) }],
    });
    const out = readStructuredOutput(WEEKLY_RECAP_SITE, ai.model, response, DraftOutput, "The model declined this week.");
    if (!out.ok) return out;
    const parsed = WeeklyDraft.safeParse(out.data);
    if (!parsed.success) return { ok: false, error: "The draft came back incomplete." };
    const valid = validateProgress(parsed.data, published);
    if (!valid.ok) return valid;
    void now;
    return { ok: true, draft: parsed.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Step three: the email to the plan's recipients, through the kernel, which logs each accepted send to interactions. */
async function send(row: WeeklyRecap, now: Date, sentBy: "organiser" | "deadline"): Promise<{ ok: true; to: { person_id: string; email: string }[] } | { ok: false; error: string }> {
  const plan = await planOf(row.planId);
  const recipients = (Array.isArray(plan.recipients) ? plan.recipients : []).filter((r): r is { person_id: string; email: string } => typeof r?.email === "string" && typeof r?.person_id === "string");
  if (recipients.length === 0) return { ok: false, error: "The plan has no recipients." };
  if (!row.draft) return { ok: false, error: "There is no draft to send." };
  const organiser = mustRows(await companyOs.from("people").select(`${NAME_COLUMNS}`).eq("id", plan.organiser_id).limit(1), "[training] organiser") as NamedPerson[];
  const organiserName = organiser[0] ? personName(organiser[0]) : "The instructor";
  const names = new Map<string, string>(plan.members.map((m) => [m.person_id, m.person ? String(personName(m.person)) : "A learner"]));
  const html = renderWeeklyRecapEmail({ planTitle: plan.title, weekLabel: weekLabel(row.weekStart), organiserName, draft: row.draft, names, instructorNote: row.instructorNote, untouched: sentBy === "deadline" && row.editedAt === null });
  const ok = await sendTransactionalEmail({
    to: recipients.map((r) => r.email),
    subject: subjectFor(plan.title, row.weekStart),
    html,
    from: process.env.TRAINING_RECAP_FROM || undefined,
    replyTo: organiser[0]?.email ?? undefined,
    idempotencyKey: `training-weekly-recap:${row.id}:${row.attempts}`,
    logMeta: { source: "training-weekly-recap", category: "people_ops", kind: "training-weekly-recap", plan_id: row.planId, week_start: row.weekStart, sent_by: sentBy },
  });
  void now;
  if (!ok) return { ok: false, error: "The email was not accepted." };
  return { ok: true, to: recipients };
}

export type TickOutcome = { id: string; from: Step; to: Step | null; error?: string; modelCall?: boolean; organiserId?: string; planId?: string };

/** One tick on one row: drafting runs the model, sending sends, waiting past its deadline moves on. */
export async function tick(row: WeeklyRecap, now: Date): Promise<TickOutcome> {
  if (row.step === "drafting") {
    const d = await draft(row, now);
    if (!d.ok) return { id: row.id, from: row.step, to: null, error: d.error, modelCall: true };
    const moved = await apply(row, { kind: "drafted", draft: d.draft, sendAfter: sendAfterFor(row.weekStart) }, now);
    return { id: row.id, from: row.step, to: moved.ok ? moved.step : null, error: moved.ok ? undefined : moved.error, modelCall: true, planId: row.planId };
  }
  if (row.step === "sending") {
    const sent = await send(row, now, row.editedAt ? "organiser" : "deadline");
    if (!sent.ok) {
      const moved = await apply(row, { kind: "send-failed", error: sent.error }, now);
      return { id: row.id, from: row.step, to: moved.ok ? moved.step : null, error: sent.error };
    }
    const { error } = await companyOs.from("training_weekly_recaps").update({ sent_to: sent.to }).eq("id", row.id);
    if (error) return { id: row.id, from: row.step, to: null, error: error.message };
    const moved = await apply(row, { kind: "sent" }, now);
    return { id: row.id, from: row.step, to: moved.ok ? moved.step : null, error: moved.ok ? undefined : moved.error };
  }
  const moved = await apply(row, { kind: "tick" }, now);
  return { id: row.id, from: row.step, to: moved.ok ? moved.step : null };
}

/** The organiser's edit of the draft and their note; the row stays waiting. */
export async function editWeeklyRecap(organiserId: string, planId: string, weekStart: string, input: { draft: WeeklyDraftType; instructorNote: string | null }, now: Date): Promise<Result> {
  const { data, error } = await companyOs
    .from("training_weekly_recaps")
    .update({ draft: input.draft, instructor_note: input.instructorNote, edited_at: now.toISOString(), edited_by: organiserId })
    .eq("plan_id", planId)
    .eq("week_start", weekStart)
    .in("step", ["waiting", "failed"])
    .select("id");
  if (error) return { ok: false, error: "Could not save the edits. Try again." };
  if (!data?.length) return { ok: false, error: "This recap is not open for edits." };
  return { ok: true };
}

/** Send now or hold, from the organiser's page. */
export async function decideWeeklyRecap(organiserId: string, planId: string, weekStart: string, decision: { kind: "send-now" } | { kind: "hold"; reason: string }, now: Date): Promise<Result> {
  const row = await readWeeklyRecap(planId, weekStart);
  if (!row) return { ok: false, error: "That week was not found." };
  const moved = await apply(row, decision, now, organiserId);
  return moved.ok ? { ok: true } : moved;
}
