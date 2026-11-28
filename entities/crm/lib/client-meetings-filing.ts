// Every client's meetings reach their portal without anyone remembering to.
// Reads the Lark transcripts the Mac mini syncs nightly into call_transcripts
// (scripts/calls/sync-lark-minutes.mjs) and files two kinds, published:
//
//   1. Edge8's internal "Weekly Sprint Planning" call covers every client. Each
//      client with an active AI program gets its own slice: only the part about
//      them, written for them (client-meeting-slice). source 'notes',
//      external_id lark-minutes:<token>:<company id>. The internal call itself
//      is never filed to a client.
//   2. A direct client call ("Weekly Acme <> Edge8 Sync") becomes that
//      client's Lark meeting, summarised by the meeting summariser, exactly as
//      a pasted Minutes link would be (lark-meeting-actions.ts).
//
// Idempotent: a client that already has a row for a minute token, however the
// row was made, is skipped, so a re-run or a hand-made slice never duplicates.
import { companyOs } from "@/kernel/data/supabase";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import type { AiDataClass } from "@/kernel/ai/routing";
import { recordAudit } from "@/kernel/audit/audit";
import { larkWorkspaceHost } from "@/kernel/config/lark";
import { summarizeMeeting } from "@/entities/assistant";
import { activeClientCompanies, OWN_COMPANIES } from "@/entities/client-programs";
import { CLIENT_MEETING_SLICE_PROMPT } from "./client-meeting-slice.prompt";
import { z } from "zod/v4";

export const CLIENT_MEETING_SLICE_CLASS: AiDataClass = "C";
const AI = aiSite({ site: "client-meeting-slice", dataClass: CLIENT_MEETING_SLICE_CLASS, tier: "deep" });

const LOOKBACK_DAYS = 8;
const MAX_TRANSCRIPT_CHARS = 300_000;
const ACTOR = "cron:client-meetings";

const sliceOutput = z.object({
  summary_markdown: z.string().nullable().describe("This client's notes, or null if the call did not really discuss them."),
});
const SLICE_SCHEMA = jsonSchemaFor(sliceOutput);

type Client = { id: string; name: string; programs: string[] };
type Transcript = { id: string; minute_token: string; meeting_id: string | null; title: string | null; started_at: string | null; duration_seconds: number | null; transcript: string | null };
export type ClientMeetingsOutcome = { filed: string[]; skipped: number; failures: { subject: string; step: string; error: string }[] };

export const isSprintPlanning = (title: string) => /\bsprint planning\b/i.test(title);
const isDirectCall = (title: string) => /<>|\bsync\b|\breview\b|\broadmap\b/i.test(title) && !/1-1|1:1|discovery|interview/i.test(title);

// The words a call title uses for a client: "Acme" for Acme Pty Ltd, "PFA"
// for Pacific Freight Association, "EO" for Exporters Organization.
// Matched as whole words, so a short acronym only matches a title that says it.
const STOP = /^(pty|ltd|the|solutions|team|talent|organization|organisation|entertainment|performance|coaching|association)$/i;
export function titleWords(name: string): string[] {
  const w = name.split(/\s+/).filter(Boolean);
  const out = w.filter((x) => x.length >= 3 && !STOP.test(x)).slice(0, 1);
  if (w.length >= 2) out.push(w.map((x) => x[0]).join(""));
  return out.map((x) => x.toLowerCase());
}
export const clientsInTitle = <C extends { name: string }>(title: string, clients: C[]): C[] =>
  clients.filter((c) => titleWords(c.name).some((w) => new RegExp(`\\b${w}\\b`, "i").test(title)));

// Tag the program only when it is unambiguous; otherwise the row is company-wide.
const programOf = (c: Client) => (c.programs.length === 1 ? c.programs[0] : null);
const dateLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }) : "";
// Transcript lines open with "Name 00:03:12.941"; the speakers are the attendees.
const speakers = (text: string) => [...new Set([...text.matchAll(/^(.+?) \d{2}:\d{2}:\d{2}\.\d{3}\s*$/gm)].map((m) => m[1].trim()))].filter((s) => !/^speaker/i.test(s));

async function activeClients(): Promise<Client[]> {
  const r = await activeClientCompanies(OWN_COMPANIES);
  if (!r.ok) throw new Error(`active AI programs: ${r.error}`);
  return [...r.clients].map(([id, c]) => ({ id, name: c.company, programs: c.programIds }));
}

async function slice(t: Transcript, client: Client): Promise<string | null> {
  const llm = AI.clientIfConfigured();
  if (!llm) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const text = t.transcript ?? "";
  const response = await llm.messages.create({
    model: AI.model,
    max_tokens: 2000,
    prompt: CLIENT_MEETING_SLICE_PROMPT,
    system: CLIENT_MEETING_SLICE_PROMPT.system,
    output_config: { format: { type: "json_schema", schema: SLICE_SCHEMA } },
    messages: [{
      role: "user",
      content: fillPrompt(CLIENT_MEETING_SLICE_PROMPT.user, {
        title: t.title ?? "Weekly Sprint Planning",
        date: dateLabel(t.started_at),
        client: client.name,
        transcript: text.length > MAX_TRANSCRIPT_CHARS ? text.slice(-MAX_TRANSCRIPT_CHARS) : text,
      }),
    }],
  });
  const out = readStructuredOutput("client-meeting-slice", AI.model, response, sliceOutput, "The model declined to read this transcript.");
  if (!out.ok) throw new Error(out.error);
  return out.data.summary_markdown?.trim() || null;
}

export async function fileClientMeetings(now = new Date()): Promise<ClientMeetingsOutcome> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86400_000).toISOString();
  const [clients, transcriptsRes, meetingsRes] = await Promise.all([
    activeClients(),
    companyOs.from("call_transcripts").select("id, minute_token, meeting_id, title, started_at, duration_seconds, transcript")
      .gte("started_at", since).not("minute_token", "is", null),
    companyOs.from("meetings").select("company_id, external_id, metadata").gte("started_at", since),
  ]);
  if (transcriptsRes.error) throw new Error(`call transcripts: ${transcriptsRes.error.message}`);
  if (meetingsRes.error) throw new Error(`meetings: ${meetingsRes.error.message}`);

  const known = new Set<string>();
  for (const m of (meetingsRes.data ?? []) as { company_id: string | null; external_id: string | null; metadata: { lark_minute_token?: string } | null }[]) {
    if (m.metadata?.lark_minute_token) known.add(`${m.company_id}|${m.metadata.lark_minute_token}`);
    if (m.external_id) known.add(`${m.company_id}|${m.external_id}`);
  }

  const outcome: ClientMeetingsOutcome = { filed: [], skipped: 0, failures: [] };
  const publishedAt = now.toISOString();

  for (const t of (transcriptsRes.data ?? []) as Transcript[]) {
    const title = t.title ?? "";
    const sprint = isSprintPlanning(title);
    if (!sprint && !isDirectCall(title)) continue;
    const targets = (sprint ? clients : clientsInTitle(title, clients).slice(0, 1)).filter((c) => !known.has(`${c.id}|${t.minute_token}`));
    if (!sprint && t.meeting_id) continue; // already some meeting's transcript
    const ended = t.started_at && t.duration_seconds ? new Date(new Date(t.started_at).getTime() + t.duration_seconds * 1000).toISOString() : null;
    const host = larkWorkspaceHost();
    const minutesUrl = host ? `https://${host}/minutes/${t.minute_token}` : null;

    // The slices of one call are independent, so they run side by side to fit the route's time.
    await Promise.all(targets.map(async (c) => {
      try {
        if (sprint) {
          const summary = await slice(t, c);
          if (!summary) { outcome.skipped += 1; return; }
          const { data, error } = await companyOs.from("meetings").insert({
            company_id: c.id, ai_program_id: programOf(c), source: "notes",
            external_id: `lark-minutes:${t.minute_token}:${c.id}`, meeting_type: "General",
            title: `Weekly Sprint Planning, ${dateLabel(t.started_at)}: ${c.name}`,
            started_at: t.started_at, ended_at: ended, duration_seconds: t.duration_seconds,
            attendees: speakers(t.transcript ?? ""), summary, ai_status: "ready", ai_model: AI.model,
            minutes_url: minutesUrl, published_at: publishedAt, created_by: ACTOR,
            metadata: { note_kind: "sprint-planning-client-slice", lark_minute_token: t.minute_token },
          }).select("id").single();
          if (error || !data) throw new Error(error?.message ?? "no row came back");
          await recordAudit({ table: "meetings", recordId: data.id, operation: "insert", actor: ACTOR, context: { origin: "sprint_slice", published: true } });
        } else {
          const { data, error } = await companyOs.from("meetings").insert({
            company_id: c.id, ai_program_id: programOf(c), source: "lark", external_id: t.minute_token,
            meeting_type: "AI Program Review", title, started_at: t.started_at, ended_at: ended,
            duration_seconds: t.duration_seconds, recording_url: minutesUrl, minutes_url: minutesUrl,
            ai_status: "pending", created_by: ACTOR,
            metadata: { origin: ACTOR, lark_minute_token: t.minute_token, minute_token: t.minute_token },
          }).select("id").single();
          if (error || !data) throw new Error(error?.message ?? "no row came back");
          const linked = await companyOs.from("call_transcripts").update({ meeting_id: data.id }).eq("id", t.id);
          if (linked.error) throw new Error(`link transcript: ${linked.error.message}`);
          const summary = await summarizeMeeting(data.id);
          if (!summary.ok) throw new Error(`summary: ${summary.error}`); // the row stays, as failed, for a person to retry
          const pub = await companyOs.from("meetings").update({ published_at: publishedAt, updated_at: publishedAt }).eq("id", data.id);
          if (pub.error) throw new Error(`publish: ${pub.error.message}`);
          await recordAudit({ table: "meetings", recordId: data.id, operation: "insert", actor: ACTOR, context: { origin: "lark_client_call", published: true } });
        }
        known.add(`${c.id}|${t.minute_token}`);
        outcome.filed.push(`${c.name}: ${title} (${dateLabel(t.started_at)})`);
      } catch (err) {
        outcome.failures.push({ subject: `${c.name} / ${t.minute_token}`, step: sprint ? "slice" : "client call", error: err instanceof Error ? err.message : String(err) });
      }
    }));
  }
  return outcome;
}
