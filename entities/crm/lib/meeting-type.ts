import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import type { AiDataClass } from "@/kernel/ai/routing";
import { fenceUntrusted, untrustedPreamble } from "@/kernel/ai/screen";
import { recordAuditMany, type AuditInput } from "@/kernel/audit/audit";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { MEETING_TYPE_PROMPT } from "./meeting-type.prompt";

// Meetings are typed after they land. Most writers set meeting_type when they
// file a meeting, but a meeting filed without one (an agent's direct write, a
// hand upload) stays untyped, and an untyped Sales call is missing from
// Meetings booked. The hourly meeting-type routine finds those and types them:
//
//   1. the transcript's own tag, when it says sales: Sales, with no model call;
//   2. otherwise Claude reads the opening of the transcript and chooses, from
//      Sales and AI Program Review for a client call (a client call is one or
//      the other), and from the whole taxonomy for anything else;
//   3. a meeting with no transcript (one entered by hand) is judged from its
//      title alone, from the whole taxonomy; with no title either, it is left
//      untyped, because there is nothing to read.
//
// It only fills a blank: the update is guarded on meeting_type being null, so a
// type a person set, or one set while the routine ran, is never overwritten.
// Each change is audited.

export const MEETING_TYPES = [
  "Sales",
  "AI Program Review",
  "1-1",
  "Team Ceremony",
  "Leadership Sync",
  "Vendor Call",
  "Performance",
  "Training",
  "English Training",
  "General",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const CLIENT_CALL_TYPES = ["Sales", "AI Program Review"] as const satisfies readonly MeetingType[];

// Class C, as meeting-summary: a transcript is internal business content.
export const MEETING_TYPE_CLASS: AiDataClass = "C";
const AI = aiSite({ site: "meeting-type", dataClass: MEETING_TYPE_CLASS, tier: "fast", routeSeconds: 300 });

/** The opening of a call says what it is for; about ten minutes of speech. */
export const TRANSCRIPT_CHARS = 12_000;
/** At most this many meetings are typed per run; the rest wait for the next hour. */
export const PER_RUN = 20;
const MAX_TOKENS = 200;

const meetingTypeOutput = z.object({
  meeting_type: z.enum(MEETING_TYPES).describe("The kind of meeting, chosen only from the allowed types."),
});
const OUTPUT_SCHEMA = jsonSchemaFor(meetingTypeOutput);

export type UntypedMeeting = { id: string; title: string | null; callType: string | null; transcript: string | null };

/** How a meeting will be typed: from its tag, by a model read limited to `allowed`, or not at all. */
export type TypePlan =
  | { by: "tag"; type: MeetingType }
  | { by: "model"; allowed: readonly MeetingType[] }
  | { by: "none"; reason: string };

export function planFor(m: UntypedMeeting): TypePlan {
  if (m.callType === "sales") return { by: "tag", type: "Sales" };
  if (!m.transcript?.trim()) return m.title?.trim() ? { by: "model", allowed: MEETING_TYPES } : { by: "none", reason: "no transcript or title" };
  return { by: "model", allowed: m.callType === "client" ? CLIENT_CALL_TYPES : MEETING_TYPES };
}

export function typeMessages(m: UntypedMeeting, allowed: readonly MeetingType[], nonce?: string): { system: string; user: string } {
  const body = m.transcript?.trim() ? m.transcript.slice(0, TRANSCRIPT_CHARS) : MEETING_TYPE_PROMPT.parts.noTranscript;
  const fence = fenceUntrusted("untrusted_transcript", body, nonce);
  const system = fillPrompt(MEETING_TYPE_PROMPT.system, {
    transcriptPreamble: untrustedPreamble(fence.nonce, "untrusted_transcript", MEETING_TYPE_PROMPT.parts.transcriptWhat),
  });
  const user = fillPrompt(MEETING_TYPE_PROMPT.user, { title: m.title ?? "(no title)", types: allowed.join(", "), transcript: fence.text });
  return { system, user };
}

export type TypeRead = { ok: true; type: MeetingType } | { ok: false; error: string };

/** The model's choice, or why it is unusable: a type outside `allowed` is unusable, never coerced. */
export function readType(raw: z.infer<typeof meetingTypeOutput>, allowed: readonly MeetingType[]): TypeRead {
  return allowed.includes(raw.meeting_type) ? { ok: true, type: raw.meeting_type } : { ok: false, error: `${raw.meeting_type} is not one of ${allowed.join(", ")}` };
}

/** The model call; replaced in tests. */
export type MeetingTyper = (m: UntypedMeeting, allowed: readonly MeetingType[]) => Promise<TypeRead>;

export const typeByModel: MeetingTyper = async (m, allowed) => {
  const llm = AI.clientIfConfigured();
  if (!llm) return { ok: false, error: "The AI provider's key is not configured." };
  const { system, user } = typeMessages(m, allowed);
  const response = await llm.messages.create({
    prompt: MEETING_TYPE_PROMPT,
    model: AI.model,
    max_tokens: MAX_TOKENS,
    system,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
  });
  const out = readStructuredOutput("meeting-type", AI.model, response, meetingTypeOutput, "The model declined to type this meeting.");
  if (!out.ok) return { ok: false, error: out.error };
  return readType(out.data, allowed);
};

type Row = { id: string; title: string | null; call_transcripts: { call_type: string; transcript: string } | { call_type: string; transcript: string }[] | null };

/** The oldest live untyped meetings, with their transcript when one is filed. */
export async function untypedMeetings(limit = PER_RUN): Promise<UntypedMeeting[]> {
  const rows = mustRows(
    await companyOs
      .from("meetings")
      .select("id, title, call_transcripts(call_type, transcript)")
      .is("meeting_type", null)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(limit),
    "[crm/meeting-type] untyped meetings",
  ) as Row[];
  return rows.map((r) => {
    const ct = Array.isArray(r.call_transcripts) ? r.call_transcripts[0] : r.call_transcripts;
    return { id: r.id, title: r.title, callType: ct?.call_type ?? null, transcript: ct?.transcript ?? null };
  });
}

export type TypeOutcome =
  | { id: string; action: "typed"; type: MeetingType; by: "tag" | "model" }
  | { id: string; action: "skipped"; reason: string }
  | { id: string; action: "failed"; error: string };

/** Types every untyped meeting it can, one run's worth. A failure on one meeting never stops the rest. */
export async function typeUntypedMeetings(typer: MeetingTyper = typeByModel): Promise<TypeOutcome[]> {
  const outcomes: TypeOutcome[] = [];
  const audits: AuditInput[] = [];
  for (const m of await untypedMeetings()) {
    const plan = planFor(m);
    if (plan.by === "none") {
      outcomes.push({ id: m.id, action: "skipped", reason: plan.reason });
      continue;
    }
    const read = plan.by === "tag" ? ({ ok: true, type: plan.type } as const) : await typer(m, plan.allowed).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    if (!read.ok) {
      outcomes.push({ id: m.id, action: "failed", error: read.error });
      continue;
    }
    const { data, error } = await companyOs
      .from("meetings")
      .update({ meeting_type: read.type, updated_at: new Date().toISOString() })
      .eq("id", m.id)
      .is("meeting_type", null)
      .select("id");
    if (error) {
      outcomes.push({ id: m.id, action: "failed", error: error.message });
      continue;
    }
    if (!data?.length) {
      outcomes.push({ id: m.id, action: "skipped", reason: "typed while the routine ran" });
      continue;
    }
    outcomes.push({ id: m.id, action: "typed", type: read.type, by: plan.by });
    audits.push({ table: "meetings", recordId: m.id, operation: "update", actor: "routine:meeting-type", context: { meeting_type: read.type, by: plan.by } });
  }
  await recordAuditMany(audits);
  return outcomes;
}
