import { companyOs, type Json } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { ScreenFlag } from "@/kernel/ai/screen";
import { one } from "@/kernel/config/embedded";
import { NAME_ONLY_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { selectPersonCompanies } from "@/entities/contacts";
import { ASSIGNABLE_STATUSES } from "../people-options";
import { meetingTranscript } from "../meetings";
import { CHAIN_START } from "./steps";

// What the meeting-to-actions chain reads beyond its own rows (Z.13): the
// meeting, its company, the company's contacts, the team roster and the CRM's
// log of sent email; and the one thing it writes on the meeting, what the
// transcript screen flagged. A failed read throws (rule 2): "no contacts"
// would send to nobody, and "no meeting" would close the run.

// ── The meeting, as the chain reads it ──────────────────────────────────────

export type ChainMeeting = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  companyWebsite: string | null;
  lifecycleStage: string | null;
  title: string | null;
  meetingType: string | null;
  meetingDate: string | null;
  attendees: string[];
  summary: string | null;
  transcript: string;
  ownerId: string | null;
  createdBy: string | null;
  archivedAt: string | null;
  aiProgramId: string | null;
  aiStatus: string | null;
  createdAt: string;
};

type MeetingRow = {
  id: string;
  company_id: string | null;
  title: string | null;
  meeting_type: string | null;
  started_at: string | null;
  attendees: string[] | null;
  summary: string | null;
  owner_id: string | null;
  created_by: string | null;
  archived_at: string | null;
  ai_program_id: string | null;
  ai_status: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  company: { name: string | null; website_url: string | null; lifecycle_stage: string | null } | { name: string | null; website_url: string | null; lifecycle_stage: string | null }[] | null;
  call_transcripts: { transcript: string | null }[] | { transcript: string | null } | null;
  meeting_participants: { display_name: string | null }[] | null;
};

export async function loadChainMeeting(meetingId: string): Promise<ChainMeeting | null> {
  const rows = mustRows(
    await companyOs
      .from("meetings")
      .select(
        "id, company_id, title, meeting_type, started_at, attendees, summary, owner_id, created_by, archived_at, ai_program_id, ai_status, created_at, metadata, company:companies!company_id(name, website_url, lifecycle_stage), call_transcripts(transcript), meeting_participants(display_name)",
      )
      .eq("id", meetingId)
      .limit(1),
    "[meeting-actions] meeting",
  ) as unknown as MeetingRow[];
  const r = rows[0];
  if (!r) return null;
  const company = one(r.company);
  const named = [...(r.attendees ?? []), ...(r.meeting_participants ?? []).map((p) => p.display_name ?? "")];
  return {
    id: r.id,
    companyId: r.company_id,
    companyName: company?.name ?? null,
    companyWebsite: company?.website_url ?? null,
    lifecycleStage: company?.lifecycle_stage ?? null,
    title: r.title,
    meetingType: r.meeting_type,
    meetingDate: r.started_at ? r.started_at.slice(0, 10) : null,
    attendees: [...new Set(named.map((n) => n.trim()).filter(Boolean))],
    summary: r.summary,
    transcript: meetingTranscript(one(r.call_transcripts)?.transcript, r.metadata),
    ownerId: r.owner_id,
    createdBy: r.created_by,
    archivedAt: r.archived_at,
    aiProgramId: r.ai_program_id,
    aiStatus: r.ai_status,
    createdAt: r.created_at,
  };
}

/**
 * Client meetings the tick may open a run for, none with a run yet, oldest
 * first. The newest `limit` written since the chain started are read, so a
 * meeting that will never be in scope cannot hold the window shut.
 */
export async function openCandidates(limit: number): Promise<
  { id: string; companyId: string | null; archivedAt: string | null; summary: string | null; aiStatus: string | null; lifecycleStage: string | null; meetingType: string | null; createdAt: string }[]
> {
  const rows = mustRows(
    await companyOs
      .from("meetings")
      .select("id, company_id, archived_at, summary, ai_status, meeting_type, created_at, company:companies!company_id(lifecycle_stage), meeting_followups(id)")
      .not("company_id", "is", null)
      .is("archived_at", null)
      .not("summary", "is", null)
      .gte("created_at", CHAIN_START)
      .order("created_at", { ascending: false })
      .limit(limit),
    "[meeting-actions] candidates",
  ) as unknown as {
    id: string;
    company_id: string | null;
    archived_at: string | null;
    summary: string | null;
    ai_status: string | null;
    meeting_type: string | null;
    created_at: string;
    company: { lifecycle_stage: string | null } | { lifecycle_stage: string | null }[] | null;
    meeting_followups: { id: string }[] | { id: string } | null;
  }[];
  return rows
    .filter((r) => !one(r.meeting_followups))
    .reverse()
    .map((r) => ({
      id: r.id,
      companyId: r.company_id,
      archivedAt: r.archived_at,
      summary: r.summary,
      aiStatus: r.ai_status,
      lifecycleStage: one(r.company)?.lifecycle_stage ?? null,
      meetingType: r.meeting_type,
      createdAt: r.created_at,
    }));
}

// ── People ───────────────────────────────────────────────────────────────────

export type ClientContact = { personId: string; name: string; names: string[]; email: string };

type PersonEmbed = NamedPerson & { id: string; email: string | null; first_name: string | null; last_name: string | null; archived_at: string | null; do_not_contact: boolean | null };

function namesOf(p: PersonEmbed): string[] {
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ");
  return [p.display_name, p.preferred_name, p.full_name, full].filter((n): n is string => Boolean(n?.trim()));
}

/**
 * The company's contacts who may be written to: a current link, an email, not
 * archived, and not marked do-not-contact. The only people a follow-up can go
 * to (decision 12).
 */
export async function companyContacts(companyId: string): Promise<ClientContact[]> {
  const rows = mustRows(
    await selectPersonCompanies(`end_date, people(id, email, first_name, last_name, archived_at, do_not_contact, ${NAME_ONLY_COLUMNS})`).eq("company_id", companyId),
    "[meeting-actions] company contacts",
  ) as unknown as { end_date: string | null; people: PersonEmbed | PersonEmbed[] | null }[];
  const today = new Date().toISOString().slice(0, 10);
  const out = new Map<string, ClientContact>();
  for (const r of rows) {
    const p = one(r.people);
    if (!p || p.archived_at || p.do_not_contact || !p.email?.trim()) continue;
    if (r.end_date && r.end_date < today) continue;
    out.set(p.id, { personId: p.id, name: personName(p), names: namesOf(p), email: p.email.trim() });
  }
  return [...out.values()];
}

/** The people still on the team, by name: the only Edge8 names an action's owner may have. */
export async function rosterNames(): Promise<string[]> {
  const rows = mustRows(
    await companyOs.from("team_members").select(`person:people!team_members_person_id_fkey(${NAME_ONLY_COLUMNS}, archived_at)`).in("status", ASSIGNABLE_STATUSES),
    "[meeting-actions] roster",
  ) as unknown as { person: (NamedPerson & { archived_at: string | null }) | null }[];
  const names = rows.flatMap((r) => (r.person && !r.person.archived_at ? [personName(r.person, null)] : [])).filter((n): n is string => Boolean(n));
  return [...new Set(names)];
}

export type PersonRef = { id: string; name: string; email: string | null };

/** People by id, with their names and addresses. */
export async function peopleByIds(ids: string[]): Promise<PersonRef[]> {
  if (ids.length === 0) return [];
  const rows = mustRows(await companyOs.from("people").select(`id, email, ${NAME_ONLY_COLUMNS}`).in("id", ids), "[meeting-actions] people") as unknown as (NamedPerson & {
    id: string;
    email: string | null;
  })[];
  return rows.map((p) => ({ id: p.id, name: personName(p), email: p.email }));
}

/** A person by their address, for a meeting whose created_by is an email. */
export async function personByEmail(email: string): Promise<PersonRef | null> {
  const rows = mustRows(await companyOs.from("people").select(`id, email, ${NAME_ONLY_COLUMNS}`).ilike("email", email.trim().replace(/[%_\\]/g, "\\$&")).limit(1), "[meeting-actions] person by email") as unknown as (NamedPerson & {
    id: string;
    email: string | null;
  })[];
  const p = rows[0];
  return p ? { id: p.id, name: personName(p), email: p.email } : null;
}

// ── What the transcript screen flagged ──────────────────────────────────────

/**
 * What screenUntrusted found in a meeting's transcript, kept for the approver
 * to read beside the draft. meeting_followups has no JSON column, so it lives
 * on the meeting's own metadata under one key, written by this chain only.
 */
export type ScreenRecord = { flags: ScreenFlag[]; truncated: { keptChars: number; originalChars: number } | null; at: string };

export const SCREEN_KEY = "meeting_actions_screen";

/** Merge the screen's record into the meeting's metadata, leaving every other key as it was. */
export async function recordScreen(meetingId: string, record: ScreenRecord): Promise<void> {
  const rows = mustRows(await companyOs.from("meetings").select("metadata").eq("id", meetingId).limit(1), "[meeting-actions] meeting metadata") as { metadata: Record<string, unknown> | null }[];
  if (!rows[0]) throw new Error(`[meeting-actions] the meeting ${meetingId} is gone`);
  const metadata = { ...(rows[0].metadata ?? {}), [SCREEN_KEY]: record } as unknown as Json;
  const { error } = await companyOs.from("meetings").update({ metadata }).eq("id", meetingId);
  if (error) throw new Error(`[meeting-actions] screen record: ${error.message}`);
}

/** The screen's record on a meeting, or null when the chain has not screened it. */
export async function meetingScreen(meetingId: string): Promise<ScreenRecord | null> {
  const rows = mustRows(await companyOs.from("meetings").select("metadata").eq("id", meetingId).limit(1), "[meeting-actions] meeting screen") as { metadata: Record<string, unknown> | null }[];
  const raw = rows[0]?.metadata?.[SCREEN_KEY] as ScreenRecord | undefined;
  return raw && Array.isArray(raw.flags) ? raw : null;
}

// ── The CRM's log of sent email ──────────────────────────────────────────────

/**
 * Whether the follow-up's email is on the CRM timeline: sendTransactionalEmail
 * logs each accepted send to interactions with its idempotency key and the
 * meeting id the chain passed. A send whose reply was lost leaves the claim
 * without sent_at; this row is what tells the next attempt it went.
 */
export async function sentEmailLogged(meetingId: string, idempotencyKey: string): Promise<boolean> {
  const rows = mustRows(
    await companyOs
      .from("interactions")
      .select("id")
      .eq("kind", "email")
      .eq("metadata->>idempotency_key", idempotencyKey)
      .eq("metadata->>meeting_id", meetingId)
      .limit(1),
    "[meeting-actions] sent email log",
  );
  return rows.length > 0;
}
