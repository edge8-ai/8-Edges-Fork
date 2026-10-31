import { companyOs, type Json } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import { brandNames } from "@/entities/contacts";
import { isSourceKey, type AgentRow, type Fact, type MessageRow, type MessageStatus, type Recipient, type ReviewMode, type SkillRow, type SourceKey } from "./types";
import { type GreetedPerson, GREETING_COLUMNS, greetingName, NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// The personal email agent's reads and writes, in one file so the run and the
// pages stay functions over data. Every Supabase call checks `error` before
// `data`. Archived or cancelled, never deleted.

type Result<T = void> = T extends void ? { ok: true } | { ok: false; error: string } : { ok: true; data: T } | { ok: false; error: string };

const AGENT_SELECT =
  "id, name, brand_id, audience_id, from_email, reply_to, sources, cadence_days, send_hour, review_mode, sample_size, max_words, active, created_by, created_at, updated_at, archived_at, email_audiences(name)";

type DbAgent = {
  id: string;
  name: string;
  brand_id: string | null;
  audience_id: string;
  from_email: string | null;
  reply_to: string | null;
  sources: unknown;
  cadence_days: number;
  send_hour: number;
  review_mode: string;
  sample_size: number;
  max_words: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  email_audiences: { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function mapAgent(r: DbAgent, brandName: string | null): AgentRow {
  const sources = Array.isArray(r.sources) ? (r.sources as unknown[]).filter((s): s is SourceKey => typeof s === "string" && isSourceKey(s)) : [];
  return {
    id: r.id,
    name: r.name,
    brandId: r.brand_id,
    brandName,
    audienceId: r.audience_id,
    audienceName: one(r.email_audiences)?.name ?? null,
    fromEmail: r.from_email,
    replyTo: r.reply_to,
    sources,
    cadenceDays: r.cadence_days,
    sendHour: r.send_hour,
    reviewMode: r.review_mode === "hold_all" ? "hold_all" : "sample",
    sampleSize: r.sample_size,
    maxWords: r.max_words,
    active: r.active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  };
}

// Brand names come through the contacts door, never an embed on the agent
// row, so the ownership ratchet sees one read of brands from this entity.
async function brandNameMap(): Promise<Map<string, string>> {
  const { data, error } = await brandNames();
  if (error) {
    console.error("[campaigns/personal] brands read", error);
    return new Map();
  }
  return new Map(((data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
}

export async function listAgents(): Promise<{ rows: AgentRow[]; error?: string }> {
  const [{ data, error }, brands] = await Promise.all([
    companyOs.from("email_agents").select(AGENT_SELECT).is("archived_at", null).order("name"),
    brandNameMap(),
  ]);
  if (error) return { rows: [], error: error.message };
  return { rows: ((data ?? []) as unknown as DbAgent[]).map((r) => mapAgent(r, r.brand_id ? (brands.get(r.brand_id) ?? null) : null)) };
}

export async function getAgent(id: string): Promise<AgentRow | null> {
  const [{ data, error }, brands] = await Promise.all([
    companyOs.from("email_agents").select(AGENT_SELECT).eq("id", id).maybeSingle(),
    brandNameMap(),
  ]);
  if (error) console.error("[campaigns/personal] agent read", error);
  if (error || !data) return null;
  const r = data as unknown as DbAgent;
  return mapAgent(r, r.brand_id ? (brands.get(r.brand_id) ?? null) : null);
}


export type AgentInput = {
  name: string;
  brandId: string | null;
  audienceId: string;
  fromEmail: string | null;
  replyTo: string | null;
  sources: SourceKey[];
  cadenceDays: number;
  sendHour: number;
  reviewMode: ReviewMode;
  sampleSize: number;
  maxWords: number;
  active: boolean;
};

function agentRow(input: AgentInput) {
  return {
    name: input.name,
    brand_id: input.brandId,
    audience_id: input.audienceId,
    from_email: input.fromEmail,
    reply_to: input.replyTo,
    sources: input.sources as unknown as Json,
    cadence_days: input.cadenceDays,
    send_hour: input.sendHour,
    review_mode: input.reviewMode,
    sample_size: input.sampleSize,
    max_words: input.maxWords,
    active: input.active,
  };
}

// A new agent starts with version 1 of its skill, so it can run at once.
export async function createAgent(input: AgentInput, skillMd: string, createdBy: string): Promise<Result<{ id: string }>> {
  const { data, error } = await companyOs.from("email_agents").insert({ ...agentRow(input), created_by: createdBy }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert returned no row" };
  const skill = await addSkill(data.id, skillMd, "First version.", createdBy);
  if (!skill.ok) return skill;
  return { ok: true, data: { id: data.id } };
}

export async function updateAgent(id: string, input: AgentInput): Promise<Result> {
  const { error } = await companyOs.from("email_agents").update({ ...agentRow(input), updated_at: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function archiveAgent(id: string): Promise<Result> {
  const now = new Date().toISOString();
  const { error } = await companyOs.from("email_agents").update({ archived_at: now, active: false, updated_at: now }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}


// ---------------------------------------------------------------------- skills

type DbSkill = { id: string; agent_id: string; version: number; body_md: string; note: string | null; created_by: string | null; created_at: string };

const mapSkill = (r: DbSkill): SkillRow => ({ id: r.id, agentId: r.agent_id, version: r.version, bodyMd: r.body_md, note: r.note, createdBy: r.created_by, createdAt: r.created_at });

export async function listSkills(agentId: string): Promise<SkillRow[]> {
  const { data, error } = await companyOs.from("email_agent_skills").select("id, agent_id, version, body_md, note, created_by, created_at")
    .eq("agent_id", agentId)
    .order("version", { ascending: false });
  if (error) {
    console.error("[campaigns/personal] skills read", error);
    return [];
  }
  return ((data ?? []) as DbSkill[]).map(mapSkill);
}

export async function latestSkill(agentId: string): Promise<SkillRow | null> {
  const [first] = await listSkills(agentId);
  return first ?? null;
}

// Every save is a new version; nothing is edited in place, because messages
// cite the version that wrote them.
export async function addSkill(agentId: string, bodyMd: string, note: string | null, createdBy: string): Promise<Result<{ id: string; version: number }>> {
  const current = await latestSkill(agentId);
  const version = (current?.version ?? 0) + 1;
  const { data, error } = await companyOs.from("email_agent_skills").insert({ agent_id: agentId, version, body_md: bodyMd, note, created_by: createdBy }).select("id, version").single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert returned no row" };
  return { ok: true, data: { id: data.id, version: data.version } };
}

// -------------------------------------------------------------------- messages

const MESSAGE_SELECT =
  `id, agent_id, skill_id, person_id, routine_run_id, status, hold_reason, skip_reason, subject, body_md, facts, edited_at, approved_by, approved_at, send_after, claimed_at, sent_at, resend_email_id, error, interaction_id, created_at, updated_at, email_agent_skills(version), people(${NAME_COLUMNS})`;

type DbMessage = {
  id: string;
  agent_id: string;
  skill_id: string;
  person_id: string;
  routine_run_id: string | null;
  status: string;
  hold_reason: string | null;
  skip_reason: string | null;
  subject: string;
  body_md: string;
  facts: unknown;
  edited_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  send_after: string | null;
  claimed_at: string | null;
  sent_at: string | null;
  resend_email_id: string | null;
  error: string | null;
  interaction_id: string | null;
  created_at: string;
  updated_at: string;
  email_agent_skills: { version: number } | { version: number }[] | null;
  people: (NamedPerson & { email: string }) | (NamedPerson & { email: string })[] | null;
};

function mapMessage(r: DbMessage): MessageRow {
  const person = one(r.people);
  return {
    id: r.id,
    agentId: r.agent_id,
    skillId: r.skill_id,
    skillVersion: one(r.email_agent_skills)?.version ?? null,
    personId: r.person_id,
    recipientName: personName(person, null),
    personEmail: person?.email ?? null,
    routineRunId: r.routine_run_id,
    status: r.status as MessageStatus,
    holdReason: r.hold_reason,
    skipReason: r.skip_reason,
    subject: r.subject,
    bodyMd: r.body_md,
    facts: Array.isArray(r.facts) ? (r.facts as Fact[]) : [],
    editedAt: r.edited_at,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    sendAfter: r.send_after,
    claimedAt: r.claimed_at,
    sentAt: r.sent_at,
    resendEmailId: r.resend_email_id,
    error: r.error,
    interactionId: r.interaction_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listMessages(agentId: string, status?: MessageStatus, limit = 200): Promise<{ rows: MessageRow[]; error?: string }> {
  let q = companyOs.from("email_messages").select(MESSAGE_SELECT).eq("agent_id", agentId).order("created_at", { ascending: false }).limit(limit);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };
  return { rows: ((data ?? []) as unknown as DbMessage[]).map(mapMessage) };
}

export async function getMessage(id: string): Promise<MessageRow | null> {
  const { data, error } = await companyOs.from("email_messages").select(MESSAGE_SELECT).eq("id", id).maybeSingle();
  if (error) console.error("[campaigns/personal] message read", error);
  if (error || !data) return null;
  return mapMessage(data as unknown as DbMessage);
}


// The latest message per person for one agent, which is what the cadence
// rule reads. One query for the whole audience, newest first, first wins.
export async function latestMessageByPerson(agentId: string): Promise<{ rows: Map<string, { status: string; createdAt: string; sentAt: string | null }>; error?: string }> {
  const { data, error } = await companyOs.from("email_messages").select("person_id, status, created_at, sent_at")
    .eq("agent_id", agentId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return { rows: new Map(), error: error.message };
  const rows = new Map<string, { status: string; createdAt: string; sentAt: string | null }>();
  for (const r of (data ?? []) as { person_id: string; status: string; created_at: string; sent_at: string | null }[]) {
    if (!rows.has(r.person_id)) rows.set(r.person_id, { status: r.status, createdAt: r.created_at, sentAt: r.sent_at });
  }
  return { rows };
}

export async function lastSentAt(agentId: string, personId: string): Promise<string | null> {
  const { data, error } = await companyOs.from("email_messages").select("sent_at")
    .eq("agent_id", agentId)
    .eq("person_id", personId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("[campaigns/personal] last sent read", error);
  return (data as { sent_at: string | null } | null)?.sent_at ?? null;
}

export type MessageInsert = {
  agentId: string;
  skillId: string;
  personId: string;
  status: MessageStatus;
  holdReason?: string | null;
  skipReason?: string | null;
  subject?: string;
  bodyMd?: string;
  facts?: Fact[];
  sendAfter?: string | null;
};

export async function insertMessage(m: MessageInsert): Promise<Result<{ id: string }>> {
  const { data, error } = await companyOs.from("email_messages").insert({
      agent_id: m.agentId,
      skill_id: m.skillId,
      person_id: m.personId,
      status: m.status,
      hold_reason: m.holdReason ?? null,
      skip_reason: m.skipReason ?? null,
      subject: m.subject ?? "",
      body_md: m.bodyMd ?? "",
      facts: (m.facts ?? []) as unknown as Json,
      send_after: m.sendAfter ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert returned no row" };
  return { ok: true, data: { id: data.id } };
}

export type MessagePatch = Partial<{ status: MessageStatus; holdReason: string | null; subject: string; bodyMd: string; editedAt: string | null; approvedBy: string | null; approvedAt: string | null; sendAfter: string | null }>;

export async function updateMessage(id: string, patch: MessagePatch): Promise<Result> {
  const row: TablesUpdate<{ schema: "company_os" }, "email_messages"> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.holdReason !== undefined) row.hold_reason = patch.holdReason;
  if (patch.subject !== undefined) row.subject = patch.subject;
  if (patch.bodyMd !== undefined) row.body_md = patch.bodyMd;
  if (patch.editedAt !== undefined) row.edited_at = patch.editedAt;
  if (patch.approvedBy !== undefined) row.approved_by = patch.approvedBy;
  if (patch.approvedAt !== undefined) row.approved_at = patch.approvedAt;
  if (patch.sendAfter !== undefined) row.send_after = patch.sendAfter;
  const { error } = await companyOs.from("email_messages").update(row).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}


// How many messages each agent has in each status, for the list page.
export async function messageCounts(agentIds: string[]): Promise<Map<string, Record<MessageStatus, number>>> {
  const counts = new Map<string, Record<MessageStatus, number>>();
  if (agentIds.length === 0) return counts;
  const { data, error } = await companyOs.from("email_messages").select("agent_id, status").in("agent_id", agentIds).limit(20000);
  if (error) {
    console.error("[campaigns/personal] counts read", error);
    return counts;
  }
  for (const r of (data ?? []) as { agent_id: string; status: MessageStatus }[]) {
    const row = counts.get(r.agent_id) ?? { drafted: 0, held: 0, approved: 0, sending: 0, sent: 0, skipped: 0, cancelled: 0 };
    row[r.status] = (row[r.status] ?? 0) + 1;
    counts.set(r.agent_id, row);
  }
  return counts;
}

// Release every drafted message of an agent: what approving the sample means.
export async function approveDrafted(agentId: string, by: string): Promise<Result<{ released: number }>> {
  const now = new Date().toISOString();
  const { data, error } = await companyOs.from("email_messages")
    .update({ status: "approved", approved_by: by, approved_at: now, updated_at: now })
    .eq("agent_id", agentId)
    .eq("status", "drafted")
    .select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { released: (data ?? []).length } };
}

// ---------------------------------------------------------------------- people

// The people an audience resolved to, as the run addresses them. Archived
// rows are left out here; consent and do-not-contact are the send gate's job.
export async function loadRecipients(ids: string[]): Promise<{ rows: Recipient[]; error?: string }> {
  if (ids.length === 0) return { rows: [] };
  const rows: Recipient[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await companyOs.from("people").select(`id, ${GREETING_COLUMNS}, timezone, country`)
      .in("id", ids.slice(i, i + 200))
      .is("archived_at", null);
    if (error) return { rows: [], error: error.message };
    for (const p of (data ?? []) as ({ id: string; email: string; timezone: string | null; country: string | null } & GreetedPerson)[]) {
      // The given name, never full_name's first word, a family name for Vietnamese-order rows.
      const firstName = greetingName(p, "");
      rows.push({ id: p.id, email: p.email, firstName, name: personName({ ...p, email: null }, ""), timezone: p.timezone, country: p.country });
    }
  }
  return { rows };
}
