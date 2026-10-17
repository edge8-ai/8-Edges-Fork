import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import { mustRows } from "@/kernel/data/read";

// Reads for the Client Meetings surface. A meeting is a client meeting when it
// is linked to a client company (company_id is not null), whatever its source
// (a manual notes upload or a ThoughtFlow-imported client call). Internal
// meetings (company_id null) never appear here. The transcript text, when there
// is one, lives in call_transcripts keyed by meeting_id. Two shapes, because the
// surface is split across pages:
//   - AdminMeetingRow: the List page and the company 360 tab. No transcript and
//     no summary, so the table never drags full transcripts through.
//   - AdminMeeting: the Details page. Everything, transcript included.
// The client-facing /portal reads through entities/portal/lib/meetings.ts instead
// (summary only, published only). The meeting date is stored in started_at.

export type AiStatus = "pending" | "ready" | "failed";

export type AdminMeetingRow = {
  id: string;
  companyId: string;
  companyName: string | null;
  meetingDate: string | null;
  title: string | null;
  attendees: string[];
  aiStatus: AiStatus;
  publishedAt: string | null;
  createdAt: string;
  // Optional AI Program tag; null = company-wide (the default).
  aiProgramId: string | null;
  aiProgramName: string | null;
};

export type AdminMeeting = AdminMeetingRow & {
  transcript: string;
  aiSummary: string | null;
  aiError: string | null;
  sourceFileName: string | null;
};

const ROW_SELECT =
  "id, company_id, started_at, title, attendees, ai_status, published_at, created_at, ai_program_id, company:companies!company_id(name), ai_program:ai_programs!ai_program_id(name)";
// metadata carries the transcript for the meetings the Zoom and Lark Minutes
// writers land (Z.13): they keep it there rather than in call_transcripts.
const FULL_SELECT = `${ROW_SELECT}, summary, ai_error, source_file_name, metadata, call_transcripts(transcript)`;

type Row = {
  id: string;
  company_id: string;
  started_at: string | null;
  title: string | null;
  attendees: string[] | null;
  ai_status: AiStatus;
  published_at: string | null;
  created_at: string;
  ai_program_id: string | null;
  company?: { name: string | null } | { name: string | null }[] | null;
  ai_program?: { name: string | null } | { name: string | null }[] | null;
};

type FullRow = Row & {
  summary: string | null;
  ai_error: string | null;
  source_file_name: string | null;
  call_transcripts?: { transcript: string | null }[] | { transcript: string | null } | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * The transcript wherever its writer kept it: call_transcripts for the notes
 * upload, metadata.transcript for the meetings written outside the app (the
 * Zoom and Lark Minutes writers).
 */
export function meetingTranscript(callTranscript: string | null | undefined, metadata: Record<string, unknown> | null | undefined): string {
  if (callTranscript?.trim()) return callTranscript;
  const meta = metadata?.transcript;
  return typeof meta === "string" ? meta : "";
}

// started_at is a timestamptz stored at UTC midnight for notes; the surface only
// ever shows the calendar date, so hand back the date part.
const asDate = (ts: string | null): string | null => (ts ? ts.slice(0, 10) : null);

function mapRow(r: Row): AdminMeetingRow {
  return {
    id: r.id,
    companyId: r.company_id,
    companyName: one(r.company)?.name ?? null,
    meetingDate: asDate(r.started_at),
    title: r.title,
    attendees: r.attendees ?? [],
    aiStatus: r.ai_status,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    aiProgramId: r.ai_program_id,
    aiProgramName: one(r.ai_program)?.name ?? null,
  };
}

// `aiProgramId` narrows to meetings tagged to that program; omitted = all of
// the company's meetings (today's behavior).
export async function getMeetingsForCompany(
  companyId: string,
  aiProgramId?: string,
): Promise<AdminMeetingRow[]> {
  let q = companyOs.from("meetings").select(ROW_SELECT)
    .is("archived_at", null)
    .eq("company_id", companyId)
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (aiProgramId) q = q.eq("ai_program_id", aiProgramId);
  const { data, error: companyMeetingsErr } = await q;
  if (companyMeetingsErr) console.error("[company-os/crm] meetings", companyMeetingsErr);
  return ((data ?? []) as Row[]).map(mapRow);
}

export type LastMeeting = { date: string; title: string | null };

// The most recent meeting that has already happened, per company: what a
// "Last met" line reads. A meeting dated in the future is a plan, not a
// meeting, and one with no date cannot be placed, so both are left out. One
// narrow read for every company instead of each company's full meeting list.
// A failed read raises: "no meetings" is an answer someone acts on (it marks a
// client as gone quiet), so a failure must never pass for it.
export async function getLastMeetingsForCompanies(companyIds: string[]): Promise<Map<string, LastMeeting>> {
  const last = new Map<string, LastMeeting>();
  if (companyIds.length === 0) return last;
  const rows = mustRows(
    await companyOs
      .from("meetings")
      .select("company_id, title, started_at")
      .in("company_id", companyIds)
      .is("archived_at", null)
      .not("started_at", "is", null)
      .lte("started_at", new Date().toISOString())
      .order("started_at", { ascending: false }),
    "[crm] meetings (last per company)",
  ) as Array<{ company_id: string; title: string | null; started_at: string }>;
  // Rows arrive newest first, so the first row seen for a company is its last meeting.
  for (const r of rows) {
    if (!last.has(r.company_id)) last.set(r.company_id, { date: asDate(r.started_at) as string, title: r.title });
  }
  return last;
}

export async function getMeeting(id: string): Promise<AdminMeeting | null> {
  const { data, error: meetingErr } = await companyOs.from("meetings").select(FULL_SELECT)
    .not("company_id", "is", null)
    .is("archived_at", null)
    .eq("id", id)
    .maybeSingle();
  if (meetingErr) console.error("[company-os/crm] meetings", meetingErr);
  if (!data) return null;
  const r = data as FullRow;
  return {
    ...mapRow(r),
    transcript: meetingTranscript(one(r.call_transcripts)?.transcript, r.metadata),
    aiSummary: r.summary,
    aiError: r.ai_error,
    sourceFileName: r.source_file_name,
  };
}

export type MeetingListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "published" | "draft";
  company?: string;
  // Narrow to meetings tagged to one AI Program; omitted = all.
  aiProgramId?: string;
};

export type MeetingListResult = {
  rows: AdminMeetingRow[];
  total: number;
  page: number;
  pageSize: number;
  error: string | null;
};

// Paginated List-page reader. Search covers the meeting title AND the client
// name: PostgREST cannot OR across an embedded table, so client names resolve
// to ids first (companies is small) and both go into one .or() on the base
// table. A search that matches no company still matches on title alone.
export async function listMeetings(params: MeetingListParams = {}): Promise<MeetingListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const from = (page - 1) * pageSize;

  let q = companyOs.from("meetings").select(ROW_SELECT, { count: "exact" })
    .is("archived_at", null)
    .range(from, from + pageSize - 1)
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  q = q.not("company_id", "is", null); // client meetings only
  if (params.company) q = q.eq("company_id", params.company);
  if (params.aiProgramId) q = q.eq("ai_program_id", params.aiProgramId);
  if (params.status === "published") q = q.not("published_at", "is", null);
  if (params.status === "draft") q = q.is("published_at", null);

  const search = (params.search ?? "").replace(/[%,()]/g, " ").trim();
  if (search) {
    const { data: matched, error: matchedErr } = await companyOs
      .from("companies")
      .select("id")
      .ilike("name", `%${search}%`);
    if (matchedErr) console.error("[company-os/crm] companies", matchedErr);
    const ids = ((matched ?? []) as { id: string }[]).map((c) => c.id);
    const clauses = [`title.ilike.%${search}%`];
    if (ids.length > 0) clauses.push(`company_id.in.(${ids.join(",")})`);
    q = q.or(clauses.join(","));
  }

  const { data, count, error } = await q;
  return {
    rows: ((data ?? []) as Row[]).map(mapRow),
    total: count ?? 0,
    page,
    pageSize,
    error: error ? error.message : null,
  };
}

export type CompanyOption = { id: string; name: string };

// Companies that have at least one client meeting, for the list-page filter.
// Deduped in JS (the client-meeting set is small); alphabetical.
export async function listClientCompanies(): Promise<CompanyOption[]> {
  const { data, error: clientCompaniesErr } = await companyOs.from("meetings").select("company_id, company:companies!company_id(name)")
    .not("company_id", "is", null)
    .is("archived_at", null);
  if (clientCompaniesErr) console.error("[company-os/crm] meetings", clientCompaniesErr);
  const seen = new Map<string, string>();
  for (const r of (data ?? []) as Row[]) {
    const name = one(r.company)?.name;
    if (r.company_id && name && !seen.has(r.company_id)) seen.set(r.company_id, name);
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Companies for the global upload picker. Active companies only, alphabetical.
export async function listCompanyOptions(): Promise<CompanyOption[]> {
  const { data, error: companyOptionsErr } = await companyOs
    .from("companies")
    .select("id, name")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (companyOptionsErr) console.error("[company-os/crm] companies", companyOptionsErr);
  return ((data ?? []) as { id: string; name: string | null }[])
    .filter((c) => c.name)
    .map((c) => ({ id: c.id, name: c.name as string }));
}
