// A team member's assigned clients and their (read-only) roadmaps. Scope source:
// company_os.staff_assignments — the active rows for THIS actor's team_member id
// are the only companies they may see here. Every roadmap read is filtered to
// that set, resolved server-side from the actor, never from a passed id. In the
// spirit of lib/team/data.ts: a purpose-built, equally-scoped helper.

import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { listDocumentsForCompanies, getDocumentRow, signedDownloadForPath, createSignedDocumentUpload, recordDocument, recordLink, deleteDocumentRow, type ClientDocument, type DocResult } from "@/entities/portal";
import { selectClientRoadmapOverview, selectClientRoadmapGroups, selectClientBacklogItems, selectAiPrograms } from "@/entities/client-programs";
import { selectPersonCompanies } from "@/entities/contacts";
import { BACKLOG_SELECT, ROADMAP_GROUPS_SELECT, effectivePriority, groupRank, type BacklogItem, type BacklogPriority, type RoadmapGroup } from "@/entities/client-programs";
import {
  fetchAll,
  fetchProgramSummaryInputs,
  getProgramDetail,
  listProgramSummaries,
  type ProgramDetail,
  type ProgramSummary,
} from "@/entities/team/lib/hub-program";
import type { ProgramPrOptions } from "@/entities/team/lib/hub-program-prs";
import {
  computeTokenUsage,
  getAllocatedTokensForCompanies,
  getTokenBalanceForCompanies,
  type TokenUsage,
} from "@/entities/portal";
import { getMeetingsForCompany, getInvoicesForCompany, type AdminMeetingRow } from "@/entities/crm";
import { getAssignmentsForCompany, selectStaffAssignments, type HubTeam } from "@/entities/contacts";
import type { HubInvoice } from "@/entities/finance";
import { selectBoards, getWorkboard, type WorkboardData } from "@/entities/boards";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export type ClientCompany = { id: string; name: string; roleTitle: string | null; industry?: string | null }; // industry: the Home tile icon (TH.1.7)

const PRIORITY_RANK: Record<BacklogPriority, number> = { now: 0, next: 1, later: 2, park: 3 };

// Active roadmap groups for a set of companies, in display order.
async function groupsForCompanies(companyIds: string[]): Promise<RoadmapGroup[]> {
  if (companyIds.length === 0) return [];
  const { data, error: groupsError } = await selectClientRoadmapGroups(ROADMAP_GROUPS_SELECT)
    .in("company_id", companyIds)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (groupsError) console.error("[team/hub] client_roadmap_groups", groupsError);
  return (data ?? []) as unknown as RoadmapGroup[];
}

// The client companies this team member is actively assigned to. A failed read
// raises, like hasClientAssignments: this list decides which clients a person
// may open, and an empty one would wrongly say "not assigned" (A.12).
export async function getActorClientCompanies(actor: Pick<TeamActor, "teamMemberId">): Promise<ClientCompany[]> {
  const rows = mustRows(
    await selectStaffAssignments("role_title, company_id, companies:companies!company_id(id, name, industry)")
      .eq("team_member_id", actor.teamMemberId)
      .eq("status", "active"),
    "[team/hub] staff_assignments",
  ) as unknown as Array<{
    role_title: string | null;
    company_id: string;
    companies: { id: string; name: string; industry: string | null } | { id: string; name: string; industry: string | null }[] | null;
  }>;
  const seen = new Set<string>();
  const out: ClientCompany[] = [];
  for (const r of rows) {
    const c = Array.isArray(r.companies) ? r.companies[0] : r.companies;
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, name: c.name, roleTitle: r.role_title, industry: c.industry ?? null });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function hasClientAssignments(actor: Pick<TeamActor, "teamMemberId">): Promise<boolean> {
  // A capability: a failed read must not answer "no" (A.12).
  return mustRows(await selectStaffAssignments("id").eq("team_member_id", actor.teamMemberId).eq("status", "active").limit(1), "[team/hub] staff_assignments").length > 0;
}

async function actorCompanyIds(actor: TeamActor): Promise<Set<string>> {
  return new Set((await getActorClientCompanies(actor)).map((c) => c.id));
}

function orderItems(items: BacklogItem[], rank: Map<string, number>): BacklogItem[] {
  return items.sort(
    (a, b) =>
      (rank.get(a.group_key) ?? 9999) - (rank.get(b.group_key) ?? 9999) ||
      (a.client_sort_order ?? a.sort_order) - (b.client_sort_order ?? b.sort_order),
  );
}

export type ClientRoadmap = {
  company: ClientCompany;
  overview: string | null;
  groups: RoadmapGroup[];
  items: BacklogItem[];
};

// Full read-only roadmap for one assigned client. Returns null if the company is
// not in the actor's assignment set (authorization, not just "not found").
export async function getClientRoadmapForActor(
  actor: TeamActor,
  companyId: string,
): Promise<ClientRoadmap | null> {
  const companies = await getActorClientCompanies(actor);
  const company = companies.find((c) => c.id === companyId);
  if (!company) return null;

  const [{ data: itemRows }, groups, { data: overviewRow }] = await Promise.all([
    selectClientBacklogItems(BACKLOG_SELECT)
      .eq("company_id", companyId)
      .is("archived_at", null),
    groupsForCompanies([companyId]),
    selectClientRoadmapOverview("body")
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  const items = orderItems((itemRows ?? []) as unknown as BacklogItem[], groupRank(groups));
  const overview = ((overviewRow as { body: string } | null)?.body ?? "").trim() || null;
  return { company, overview, groups, items };
}

export type ClientRoadmapSnippet = {
  company: ClientCompany;
  total: number;
  items: Array<{ id: string; ref: string | null; title: string; priority: BacklogPriority }>;
};

// Home-page snippets: one per assigned client that has a roadmap, each with its
// top few items (highest effective priority first, parked excluded).
export async function getClientRoadmapSnippets(
  actor: TeamActor,
  perClient = 3,
): Promise<ClientRoadmapSnippet[]> {
  const companies = await getActorClientCompanies(actor);
  if (companies.length === 0) return [];
  const ids = companies.map((c) => c.id);

  const [{ data }, allGroups] = await Promise.all([
    selectClientBacklogItems("id, company_id, ref, title, group_key, edge8_priority, client_priority, sort_order, client_sort_order")
      .in("company_id", ids)
      .is("archived_at", null),
    groupsForCompanies(ids),
  ]);
  const rows = (data ?? []) as unknown as Array<
    Pick<BacklogItem, "id" | "company_id" | "ref" | "title" | "group_key" | "edge8_priority" | "client_priority" | "sort_order" | "client_sort_order">
  >;

  const snippets: ClientRoadmapSnippet[] = [];
  for (const company of companies) {
    const mine = rows.filter((r) => r.company_id === company.id);
    if (mine.length === 0) continue;
    const rank = groupRank(allGroups.filter((g) => g.company_id === company.id));
    const ranked = mine
      .map((r) => ({ ...r, priority: effectivePriority(r) }))
      .filter((r) => r.priority !== "park")
      .sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          (rank.get(a.group_key) ?? 9999) - (rank.get(b.group_key) ?? 9999) ||
          (a.client_sort_order ?? a.sort_order) - (b.client_sort_order ?? b.sort_order),
      );
    snippets.push({
      company,
      total: mine.length,
      items: ranked.slice(0, perClient).map((r) => ({ id: r.id, ref: r.ref, title: r.title, priority: r.priority })),
    });
  }
  return snippets;
}

// The client-visible workboard for an assigned company: exactly what the
// client sees on the portal (the same getWorkboard read, client-safe). Null
// when unassigned (authorization); a company with no active board comes back
// with no boards. With untaggedOnly, only company-wide (ai_program_id null)
// boards qualify; program-tagged boards render in their AI Program view.
export async function getHubWorkboardForActor(
  actor: TeamActor,
  companyId: string,
  opts?: { untaggedOnly?: boolean },
): Promise<WorkboardData | null> {
  const companies = await actorCompanyIds(actor);
  if (!companies.has(companyId)) return null;
  return getWorkboard({ scope: { kind: "companies", ids: [companyId], untaggedOnly: opts?.untaggedOnly }, clientSafe: true });
}

// Whether a company has any AI Programs at all: the switch the hub tab pages
// use to decide between "everything" (no programs, today's behavior) and
// "untagged only" (programs exist; tagged rows live in their program view).
export async function companyHasPrograms(companyId: string): Promise<boolean> {
  const { data, error: programsError } = await selectAiPrograms("id")
    .eq("company_id", companyId)
    .limit(1);
  if (programsError) console.error("[team/hub] ai_programs", programsError);
  return (data ?? []).length > 0;
}

export type HubTabFlags = { hasPrograms: boolean; dropCompanyWide: boolean };

// Flags for the hub tab nav. dropCompanyWide mirrors the admin hub home's
// guarded drop rule exactly: the Work Board and Roadmap tabs drop together
// only when at least one board or roadmap item is program-tagged AND zero
// untagged ones remain, so nothing ever becomes unreachable and a company
// with programs but no boards/items keeps its tabs.
export async function getHubTabFlags(companyId: string): Promise<HubTabFlags> {
  const [{ data: progRows }, { data: boardRows }, items] = await Promise.all([
    selectAiPrograms("id").eq("company_id", companyId).limit(1),
    selectBoards("ai_program_id")
      .eq("client_company_id", companyId)
      .eq("status", "active")
      .is("archived_at", null),
    // Paginated: backlog items routinely outgrow PostgREST's 1000-row cap, and
    // a truncated read here could wrongly drop the company-wide tabs.
    fetchAll<{ ai_program_id: string | null }>(() =>
      selectClientBacklogItems("ai_program_id")
        .eq("company_id", companyId)
        .is("archived_at", null)
        .order("id"),
    ),
  ]);
  const hasPrograms = (progRows ?? []).length > 0;
  const boards = (boardRows ?? []) as Array<{ ai_program_id: string | null }>;
  const untaggedBoards = boards.filter((b) => !b.ai_program_id).length;
  const untaggedItems = items.filter((i) => !i.ai_program_id).length;
  const taggedCount = boards.length - untaggedBoards + (items.length - untaggedItems);
  return {
    hasPrograms,
    dropCompanyWide: hasPrograms && taggedCount > 0 && untaggedBoards === 0 && untaggedItems === 0,
  };
}

export type HubOverview = { usage: TokenUsage; programs: ProgramSummary[] };

// The hub Overview's top band for an assigned client: the company-grain token
// usage and the AI Program summaries, both derived from one shared fetch of
// the delivery rows (same one-fetch discipline as the admin hub home). Null
// when the company is not in the actor's active assignment set.
export async function getHubOverviewForActor(
  actor: TeamActor,
  companyId: string,
): Promise<HubOverview | null> {
  const companies = await actorCompanyIds(actor);
  if (!companies.has(companyId)) return null;

  const [inputs, balance, allocatedTokens, plannedRows] = await Promise.all([
    fetchProgramSummaryInputs(companyId),
    getTokenBalanceForCompanies([companyId]),
    getAllocatedTokensForCompanies([companyId]),
    // Paginated: a truncated read here would undercount plannedTokens once the
    // company's active backlog passes PostgREST's 1000-row cap.
    fetchAll<{ token_high: number | null }>(() =>
      selectClientBacklogItems("token_high")
        .eq("company_id", companyId)
        .is("archived_at", null)
        .order("id"),
    ),
  ]);

  const programs = await listProgramSummaries(companyId, inputs);
  const plannedTokens = plannedRows.reduce((sum, r) => sum + Number(r.token_high ?? 0), 0);
  const usage = computeTokenUsage({ balance, allocatedTokens, plannedTokens, delivery: inputs.delivery });
  return { usage, programs };
}

// One AI Program's full detail for an assigned client. Null both when the
// company is outside the actor's assignments (authorization) and when the
// program is not one of that company's (getProgramDetail only ever matches
// programs of the given company), so either way the page 404s.
export async function getProgramDetailForActor(
  actor: TeamActor,
  companyId: string,
  programId: string,
  prOpts: ProgramPrOptions = {},
): Promise<ProgramDetail | null> {
  const companies = await actorCompanyIds(actor);
  if (!companies.has(companyId)) return null;
  return getProgramDetail(companyId, programId, prOpts);
}

// Read-only client documents for an assigned company (title, date, uploader,
// download; no writes on /team). Same authorization rule as the roadmap above:
// the company must be in the actor's active assignment set.
export async function getClientDocumentsForActor(
  actor: TeamActor,
  companyId: string,
): Promise<ClientDocument[] | null> {
  const companies = await actorCompanyIds(actor);
  if (!companies.has(companyId)) return null;
  return listDocumentsForCompanies([companyId]);
}

// Meetings for an assigned client. Team members are internal Edge8 staff, so
// they see every meeting for the company (draft and published alike) plus the
// publish state; the client-facing /portal filters to published only. Null when
// the company is not in the actor's active assignment set.
export async function getClientMeetingsForActor(
  actor: TeamActor,
  companyId: string,
): Promise<AdminMeetingRow[] | null> {
  const companies = await actorCompanyIds(actor);
  if (!companies.has(companyId)) return null;
  return getMeetingsForCompany(companyId);
}

// A client-safe invoice row for the hub (no `memo`, mirroring entities/portal/lib/invoices).
export type { HubInvoice } from "@/entities/finance";

// Invoices for an assigned client. Same authorization rule as the other reads;
// `memo` is dropped so the shape is safe to reuse on client-facing surfaces.
export async function getClientInvoicesForActor(
  actor: TeamActor,
  companyId: string,
): Promise<HubInvoice[] | null> {
  const companies = await actorCompanyIds(actor);
  if (!companies.has(companyId)) return null;
  const rows = await getInvoicesForCompany(companyId);
  return rows.map((r) => ({
    id: r.id,
    docNumber: r.doc_number,
    txnDate: r.txn_date,
    dueDate: r.due_date,
    currency: r.currency,
    amountCents: r.amount_cents,
    balanceCents: r.balance_cents,
    status: r.status,
  }));
}

// HubTeam describes the two sides of an assigned client and lives in contacts
// with the staff-assignments reader, so the admin company 360 can build and
// render it without importing up.
export type { HubTeam } from "@/entities/contacts";

// The people on both sides of an assigned client: Edge8 assigned staff (only
// the client-visible assignments) and the client's own contacts. Null when the
// company is not in the actor's active assignment set.
export async function getClientTeamForActor(actor: TeamActor, companyId: string): Promise<HubTeam | null> {
  const companies = await actorCompanyIds(actor);
  if (!companies.has(companyId)) return null;

  const [assignments, { data: peopleRows }] = await Promise.all([
    getAssignmentsForCompany(companyId),
    selectPersonCompanies(`role, is_primary, people:people!person_id(${NAME_COLUMNS})`)
      .eq("company_id", companyId),
  ]);

  const edge8 = assignments
    .filter((a) => a.client_visible)
    .map((a) => ({ name: personName(a, "Edge8"), roleTitle: a.role_title || a.position_title, email: a.email }));

  const rows = (peopleRows ?? []) as Array<{ role: string | null; is_primary: boolean | null; people: NamedPerson | NamedPerson[] | null }>;
  const client = rows
    .map((r) => {
      const p = Array.isArray(r.people) ? r.people[0] : r.people;
      return { name: personName(p, "Unknown"), title: r.role, email: p?.email ?? null, isPrimary: !!r.is_primary };
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name))
    .map(({ name, title, email }) => ({ name, title, email }));

  return { edge8, client };
}

// The actor's email, from their own person row. uploaded_by on
// program_documents is an email everywhere; TeamActor doesn't carry one.
export async function getActorEmail(actor: TeamActor): Promise<string | null> {
  const { data, error: emailError } = await companyOs.from("people").select("email").eq("id", actor.personId).maybeSingle();
  if (emailError) console.error("[team/hub] people", emailError);
  return (data as { email: string | null } | null)?.email ?? null;
}

// Team members may add documents to an assigned client's vault. Same
// authorization rule as reads: the company must be in the actor's active
// assignment set, resolved server-side; the ids in the input are never trusted.

// Optional programId tags the upload to one of the company's own AI Programs
// (validated here, never trusted); the program view passes it so its uploads
// land in that program's Documents tab.
async function programBelongsToCompany(companyId: string, programId: string): Promise<boolean> {
  const { data, error: programError } = await selectAiPrograms("id")
    .eq("id", programId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (programError) console.error("[team/hub] ai_programs", programError);
  return Boolean(data);
}

export async function signedClientDocumentUploadForActor(
  actor: TeamActor,
  input: { companyId: string; filename: string; programId?: string | null },
): Promise<DocResult<{ signedUrl: string; path: string }>> {
  const companies = await actorCompanyIds(actor);
  if (!companies.has(input.companyId)) return { ok: false, error: "Not found." };
  if (input.programId && !(await programBelongsToCompany(input.companyId, input.programId))) {
    return { ok: false, error: "Invalid AI Program." };
  }
  return createSignedDocumentUpload({
    companyId: input.companyId,
    filename: input.filename,
    programId: input.programId ?? null,
  });
}

export async function recordClientDocumentForActor(
  actor: TeamActor,
  input: { companyId: string; path: string; filename: string; sizeBytes: number | null; programId?: string | null },
): Promise<DocResult> {
  const companies = await actorCompanyIds(actor);
  if (!companies.has(input.companyId)) return { ok: false, error: "Not found." };
  if (input.programId && !(await programBelongsToCompany(input.companyId, input.programId))) {
    return { ok: false, error: "Invalid AI Program." };
  }
  const email = await getActorEmail(actor);
  if (!email) return { ok: false, error: "Could not resolve your account email." };
  return recordDocument({ ...input, programId: input.programId ?? null, uploadedBy: email });
}

// External link into an assigned client's vault; same scope rule as uploads.
export async function addClientLinkForActor(
  actor: TeamActor,
  input: { companyId: string; url: string; title?: string | null },
): Promise<DocResult> {
  const companies = await actorCompanyIds(actor);
  if (!companies.has(input.companyId)) return { ok: false, error: "Not found." };
  const email = await getActorEmail(actor);
  if (!email) return { ok: false, error: "Could not resolve your account email." };
  return recordLink({ companyId: input.companyId, url: input.url, title: input.title, uploadedBy: email });
}

// Uploader-only delete, same rule as the client portal: the document must be
// in the actor's assignment scope AND carry their email as uploader.
export async function deleteOwnClientDocumentForActor(
  actor: TeamActor,
  documentId: string,
): Promise<DocResult> {
  const row = await getDocumentRow(documentId);
  if (!row) return { ok: false, error: "Not found." };
  const companies = await actorCompanyIds(actor);
  if (!companies.has(row.companyId)) return { ok: false, error: "Not found." };
  const email = await getActorEmail(actor);
  if (!email || (row.uploadedBy ?? "").toLowerCase() !== email.toLowerCase()) {
    return { ok: false, error: "You can only delete documents you uploaded." };
  }
  return deleteDocumentRow(row);
}

// Signed download for a document of an assigned company, IDOR-guarded on the
// assignment scope.
export async function signedClientDocumentDownloadForActor(
  actor: TeamActor,
  documentId: string,
): Promise<{ ok: true; url: string; filename: string } | { ok: false; error: string }> {
  const row = await getDocumentRow(documentId);
  if (!row) return { ok: false, error: "Not found." };
  const companies = await actorCompanyIds(actor);
  if (!companies.has(row.companyId)) return { ok: false, error: "Not found." };
  if (!row.storagePath) {
    return row.url ? { ok: true, url: row.url, filename: row.filename } : { ok: false, error: "Not found." };
  }
  const r = await signedDownloadForPath(row.storagePath, row.filename);
  if (!r.ok) return r;
  return { ok: true, url: r.url, filename: row.filename };
}
