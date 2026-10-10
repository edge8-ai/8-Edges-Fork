// The interview loop: how many conversations a requisition puts a candidate
// through, what each is for, and who runs it. Read by admin (/admin/talent/jobs)
// and by /team/hiring; written only from admin.
//
// Not to be confused with application_stages, the pipeline every candidate
// walks. One pipeline stage ("Interview") expands into N loop steps.

import { companyOs, companyOsUntyped } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import type { Result } from "@/kernel/data/result";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export type LoopInterviewer = { personId: string; name: string };

export type LoopStep = {
  id: string;
  position: number;
  name: string;
  durationMinutes: number | null;
  interviewers: LoopInterviewer[];
};

type PersonRow = { id: string } & NamedPerson;


// Every loop step for a set of requisitions, keyed by requisition id. One query
// per table regardless of how many reqs: /team/hiring asks for a whole
// department at once.
export async function getLoopsForRequisitions(
  reqIds: string[],
): Promise<Map<string, LoopStep[]>> {
  const byReq = new Map<string, LoopStep[]>();
  if (reqIds.length === 0) return byReq;

  const { data: stepRows, error: stepErr } = await companyOs.from("requisition_loop_steps").select("id, job_requisition_id, position, name, duration_minutes")
    .in("job_requisition_id", reqIds)
    .order("position");
  if (stepErr) console.error("[company-os/hiring] requisition_loop_steps", stepErr);
  const steps = (stepRows ?? []) as Array<{
    id: string;
    job_requisition_id: string;
    position: number;
    name: string;
    duration_minutes: number | null;
  }>;
  if (steps.length === 0) return byReq;

  const { data: ivRows, error: ivErr } = await companyOsUntyped
    .from("requisition_loop_interviewers")
    .select(`loop_step_id, interviewer_id, people:people!interviewer_id(id, ${NAME_COLUMNS})`)
    .in("loop_step_id", steps.map((s) => s.id));
  if (ivErr) console.error("[company-os/hiring] requisition_loop_interviewers", ivErr);

  const byStep = new Map<string, LoopInterviewer[]>();
  for (const r of ((ivRows ?? []) as unknown as Record<string, unknown>[])) {
    const person = one(r.people as PersonRow | PersonRow[] | null);
    const stepId = r.loop_step_id as string;
    const list = byStep.get(stepId) ?? [];
    list.push({ personId: r.interviewer_id as string, name: personName(person, "-") });
    byStep.set(stepId, list);
  }

  for (const s of steps) {
    const list = byReq.get(s.job_requisition_id) ?? [];
    list.push({
      id: s.id,
      position: s.position,
      name: s.name,
      durationMinutes: s.duration_minutes,
      interviewers: (byStep.get(s.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    });
    byReq.set(s.job_requisition_id, list);
  }
  return byReq;
}

export async function getLoop(reqId: string): Promise<LoopStep[]> {
  return (await getLoopsForRequisitions([reqId])).get(reqId) ?? [];
}

// Everyone who can be put in a loop: live team members, by person id (loops
// reference people, so the picker must too).
export type InterviewerOption = { personId: string; name: string };

const LIVE_STATUSES = ["active", "pre_start", "on_leave", "notice"];

export async function getInterviewerOptions(): Promise<InterviewerOption[]> {
  const { data, error: membersErr } = await companyOs
    .from("team_members")
    .select(`person_id, status, people:people!person_id(id, ${NAME_COLUMNS})`)
    .in("status", LIVE_STATUSES);
  if (membersErr) console.error("[company-os/hiring] team_members", membersErr);
  const seen = new Set<string>();
  const out: InterviewerOption[] = [];
  for (const r of ((data ?? []) as unknown as Record<string, unknown>[])) {
    const person = one(r.people as PersonRow | PersonRow[] | null);
    const personId = (r.person_id as string | null) ?? null;
    if (!personId || seen.has(personId)) continue;
    seen.add(personId);
    out.push({ personId, name: personName(person, "-") });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Steps land at the bottom of the loop; position is dense but never reused, so
// a delete leaves a gap that the next add closes.
async function nextPosition(reqId: string): Promise<number> {
  const { data, error: posErr } = await companyOs.from("requisition_loop_steps").select("position")
    .eq("job_requisition_id", reqId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (posErr) console.error("[company-os/hiring] requisition_loop_steps", posErr);
  const top = (data as { position: number | null } | null)?.position;
  return typeof top === "number" ? top + 1 : 1;
}

export async function addLoopStep(
  reqId: string,
  input: { name: string; durationMinutes: number | null; interviewerIds: string[] },
): Promise<Result> {
  const name = input.name.trim();
  if (!reqId) return { ok: false, error: "Not found." };
  if (!name) return { ok: false, error: "Name the interview first." };
  if (name.length > 120) return { ok: false, error: "Keep the name under 120 characters." };
  if (input.durationMinutes != null && (input.durationMinutes < 5 || input.durationMinutes > 480))
    return { ok: false, error: "Duration must be between 5 and 480 minutes." };

  const { data, error } = await companyOs.from("requisition_loop_steps").insert({
      job_requisition_id: reqId,
      position: await nextPosition(reqId),
      name,
      duration_minutes: input.durationMinutes,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not add the interview." };

  const stepId = (data as { id: string }).id;
  return setStepInterviewers(stepId, input.interviewerIds);
}

export async function updateLoopStep(
  stepId: string,
  input: { name: string; durationMinutes: number | null },
): Promise<Result> {
  const name = input.name.trim();
  if (!stepId) return { ok: false, error: "Not found." };
  if (!name) return { ok: false, error: "The interview needs a name." };
  const { error } = await companyOs.from("requisition_loop_steps").update({ name, duration_minutes: input.durationMinutes, updated_at: new Date().toISOString() })
    .eq("id", stepId);
  return error ? { ok: false, error: "Could not update the interview." } : { ok: true };
}

export async function deleteLoopStep(stepId: string): Promise<Result> {
  if (!stepId) return { ok: false, error: "Not found." };
  const { error } = await companyOs.from("requisition_loop_steps").delete().eq("id", stepId);
  return error ? { ok: false, error: "Could not remove the interview." } : { ok: true };
}

// Replace the whole interviewer set for a step. Simpler than diffing, and the
// sets are two or three people.
export async function setStepInterviewers(stepId: string, personIds: string[]): Promise<Result> {
  if (!stepId) return { ok: false, error: "Not found." };
  const unique = [...new Set(personIds.filter(Boolean))];
  const { error: delErr } = await companyOsUntyped
    .from("requisition_loop_interviewers")
    .delete()
    .eq("loop_step_id", stepId);
  if (delErr) return { ok: false, error: "Could not update the interviewers." };
  if (unique.length === 0) return { ok: true };
  const { error } = await companyOsUntyped
    .from("requisition_loop_interviewers")
    .insert(unique.map((personId) => ({ loop_step_id: stepId, interviewer_id: personId })));
  return error ? { ok: false, error: "Could not update the interviewers." } : { ok: true };
}

// Move a step one place up or down, swapping positions with its neighbour.
export async function moveLoopStep(stepId: string, direction: "up" | "down"): Promise<Result> {
  const { data, error: stepReadErr } = await companyOs.from("requisition_loop_steps").select("id, job_requisition_id, position")
    .eq("id", stepId)
    .maybeSingle();
  if (stepReadErr) return { ok: false, error: stepReadErr.message };
  const step = data as { id: string; job_requisition_id: string; position: number } | null;
  if (!step) return { ok: false, error: "Not found." };

  const { data: neighbourRow, error: neighbourErr } = await companyOs.from("requisition_loop_steps").select("id, position")
    .eq("job_requisition_id", step.job_requisition_id)
    [direction === "up" ? "lt" : "gt"]("position", step.position)
    .order("position", { ascending: direction !== "up" })
    .limit(1)
    .maybeSingle();
  if (neighbourErr) return { ok: false, error: neighbourErr.message };
  const neighbour = neighbourRow as { id: string; position: number } | null;
  if (!neighbour) return { ok: true }; // already at the end

  const stamp = new Date().toISOString();
  const [a, b] = await Promise.all([
    companyOs.from("requisition_loop_steps").update({ position: neighbour.position, updated_at: stamp })
      .eq("id", step.id),
    companyOs.from("requisition_loop_steps").update({ position: step.position, updated_at: stamp })
      .eq("id", neighbour.id),
  ]);
  return a.error || b.error ? { ok: false, error: "Could not reorder." } : { ok: true };
}
