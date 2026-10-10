// The ONLY sanctioned path for /team code to read company_os. Every /team page
// and server action must go through here (or an equally-scoped helper) rather
// than importing the service-role `companyOs` client directly — a lint rule
// enforces that ban. The service-role key bypasses RLS, so a single unscoped
// query would leak the whole company; funnelling reads through one helper that
// injects the actor's scope filter makes that structurally impossible.

import { companyOs, companyOsUntyped } from "@/kernel/data/supabase";
import { selectIdeas } from "@/entities/ideas";
import { selectJobRequisitions } from "@/entities/hiring";
import { selectPeopleSensitive } from "@/entities/contacts";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { insertOwn, updateInScope, type ScopedTable } from "./own-service-writes";
import { one } from "@/kernel/config/embedded";
import { mustRows } from "@/kernel/data/read";
import { legalName, NAME_COLUMNS, type NamedPerson, personName, UNNAMED } from "@/kernel/config/people-name";
import { getManagerPerson } from "@/kernel/identity/manager";
import { ON_CHART_STATUSES, type OrgEntry, type OpenRole } from "@/entities/org";
import { type SensitiveRow } from "@/entities/crm";
// The org-chart and open-role shapes describe the company's own rows and live
// in entities/org (RS-09) so the admin OrgChart, which sits below /team, can
// render them without importing upward. Re-exported so team's own importers
// keep reading them from here.
export type { OrgEntry, OpenRole } from "@/entities/org";
import { updatePeople } from "@/kernel/identity/writes";

// Tables /team may read, and the column + scope each is filtered on. A table not
// listed here cannot be read from /team. Expand this deliberately, one table per
// slice, always with an explicit scope key. `team_member` filters by
// actor.teamMemberScope; `person` by actor.personScope.
type ScopeKind = "team_member" | "person";
const SCOPE_ALLOWLIST: Record<ScopedTable, { column: string; scope: ScopeKind }> = {
  time_off: { column: "team_member_id", scope: "team_member" },
  ideas: { column: "person_id", scope: "person" },
  onboarding_plans: { column: "team_member_id", scope: "team_member" },
  onboarding_tasks: { column: "team_member_id", scope: "team_member" },
  // Equipment is scoped on the CURRENT holder, so an employee sees only what
  // they are holding right now — never the register, and never an item they
  // handed back (its custody row stays, but the item is someone else's).
  equipment: { column: "current_holder_id", scope: "person" },
  equipment_requests: { column: "person_id", scope: "person" },
};

function scopeIds(actor: TeamActor, scope: ScopeKind): string[] {
  return scope === "team_member" ? actor.teamMemberScope : actor.personScope;
}

// Scoped read: returns a query builder already filtered to the actor's scope.
// Chain further .eq/.order/.limit as needed; the scope filter cannot be removed.
export function teamRead(actor: TeamActor, table: keyof typeof SCOPE_ALLOWLIST, select: string) {
  const cfg = SCOPE_ALLOWLIST[table];
  if (!cfg) throw new Error(`teamRead: '${table}' is not in the /team scope allowlist`);
  return companyOsUntyped.from(table).select(select).in(cfg.column, scopeIds(actor, cfg.scope));
}

// The actor's OWN employment summary (self-scoped by construction: filtered on
// actor.teamMemberId, which comes from the JWT-derived actor, never client input).
// Department/position/manager are reference labels, safe for the employee to see.
type PersonLite = NamedPerson & {
  email: string;
  phone: string | null;
  gender: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  avatar_url: string | null;
  metadata: Record<string, unknown> | null;
};
type ManagerName = NamedPerson;
// The employee-safe slice of people.metadata (populated from the Airtable
// import). Full DOB / bank / ID live in people_sensitive, never here.
export type ProfileExtras = {
  hometown: string | null;
  education: string | null;
  hobbies: string[];
  personalEmail: string | null;
  birthMonth: number | null;
  birthDay: number | null;
};
export type OwnProfile = {
  id: string;
  employee_number: string | null;
  employment_type: string | null;
  work_location: string | null;
  status: string | null;
  start_date: string | null;
  employmentStage: string | null;
  probationEndsOn: string | null;
  person: PersonLite | null;
  avatarUrl: string | null;
  departmentName: string | null;
  positionTitle: string | null;
  managerName: string | null;
  extras: ProfileExtras;
};

function extrasOf(metadata: Record<string, unknown> | null): ProfileExtras {
  const m = metadata ?? {};
  const asStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  const asNum = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    hometown: asStr(m.hometown),
    education: asStr(m.education),
    hobbies: Array.isArray(m.hobbies) ? (m.hobbies as unknown[]).filter((h): h is string => typeof h === "string") : [],
    personalEmail: asStr(m.personal_email),
    birthMonth: asNum(m.birth_month),
    birthDay: asNum(m.birth_day),
  };
}

// PostgREST returns to-one embeds as an object, but can surface arrays; normalize.


export async function getOwnProfile(actor: TeamActor): Promise<OwnProfile | null> {
  const { data, error: dataError } = await companyOs
    .from("team_members")
    .select(
      "id, employee_number, employment_type, work_location, status, start_date, manager_id, employment_stage, probation_ends_on, " +
        `people:people!person_id(${NAME_COLUMNS}, phone, gender, emergency_contact_name, emergency_contact_phone, avatar_url, metadata), ` +
        "departments:departments!department_id(name), " +
        "positions:positions!position_id(title)",
    )
    .eq("id", actor.teamMemberId)
    .maybeSingle();
  if (dataError) console.error("[team/data] team_members", dataError);
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const dept = one(r.departments as { name: string | null } | { name: string | null }[] | null);
  const pos = one(r.positions as { title: string | null } | { title: string | null }[] | null);
  const mgr = await getManagerPerson((r.manager_id as string | null) ?? null);
  const person = one(r.people as PersonLite | PersonLite[] | null);
  return {
    id: r.id as string,
    employee_number: (r.employee_number as string | null) ?? null,
    employment_type: (r.employment_type as string | null) ?? null,
    work_location: (r.work_location as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    start_date: (r.start_date as string | null) ?? null,
    employmentStage: (r.employment_stage as string | null) ?? null,
    probationEndsOn: (r.probation_ends_on as string | null) ?? null,
    person,
    avatarUrl: person?.avatar_url ?? null,
    departmentName: dept?.name ?? null,
    positionTitle: pos?.title ?? null,
    managerName: personName(mgr, null),
    extras: extrasOf(person?.metadata ?? null),
  };
}

// Ownership assertion for id-taking mutations: confirms a target row belongs to
// the actor's scope BEFORE the caller mutates it. Closes IDOR — an action must
// never trust a client-supplied id as the authorization subject. Returns the
// row's scope id when in scope, or null when the row is missing or out of scope.
export async function assertInScope(
  actor: TeamActor,
  table: keyof typeof SCOPE_ALLOWLIST,
  id: string,
): Promise<string | null> {
  const cfg = SCOPE_ALLOWLIST[table];
  if (!cfg) throw new Error(`assertInScope: '${table}' is not in the /team scope allowlist`);
  const { data, error: dataError } = await companyOsUntyped.from(table).select(`${cfg.column}`).eq("id", id).maybeSingle();
  if (dataError) console.error("[team/data] data", dataError);
  if (!data) return null;
  const owner = (data as unknown as Record<string, string>)[cfg.column];
  return scopeIds(actor, cfg.scope).includes(owner) ? owner : null;
}

// Scoped insert: the ONLY way /team code creates company_os rows. Forces the
// table's scope column to the actor's OWN id (never the broader manager scope,
// and never a client-supplied value) so a create can only ever be "for myself".
// Spreading `row` before the forced key means any client-supplied value for
// that column is silently overwritten, not merely validated.
export async function teamInsertOwn(
  actor: TeamActor,
  table: keyof typeof SCOPE_ALLOWLIST,
  row: Record<string, unknown>,
): Promise<{ data: { id: string } | null; error: string | null }> {
  const cfg = SCOPE_ALLOWLIST[table];
  if (!cfg) throw new Error(`teamInsertOwn: '${table}' is not in the /team scope allowlist`);
  const ownId = cfg.scope === "team_member" ? actor.teamMemberId : actor.personId;
  const { data, error } = await insertOwn(table, { ...row, [cfg.column]: ownId })
    .select("id")
    .maybeSingle();
  return { data: (data as { id: string } | null) ?? null, error: error?.message ?? null };
}

// Scoped update: re-derives ownership via assertInScope immediately before
// writing, so a mutation can never trust a stale or client-forged id. Callers
// that need a narrower check than "actor's scope" (e.g. strictly self, not
// self-plus-reports) must assert that themselves before calling this.
export async function teamUpdateInScope(
  actor: TeamActor,
  table: keyof typeof SCOPE_ALLOWLIST,
  id: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  const owner = await assertInScope(actor, table, id);
  if (!owner) return { ok: false, error: "Not found." };
  const { error } = await updateInScope(table, id, patch);
  return { ok: !error, error: error?.message ?? null };
}


// The actor's leave policy approval mode, read via team_members.leave_policy_id
// (the FK, so the decision follows the policy we assign). Self-scoped by
// actor.teamMemberId.
// No policy on file means manual approval: auto-approve is opt-in per policy.
export type OwnApprovalPolicy = { policyName: string | null; autoApprove: boolean };

export async function getOwnApprovalPolicy(actor: TeamActor): Promise<OwnApprovalPolicy> {
  const { data, error: dataError } = await companyOs
    .from("team_members")
    .select("leave_policies:leave_policies!leave_policy_id(name, auto_approve)")
    .eq("id", actor.teamMemberId)
    .maybeSingle();
  if (dataError) console.error("[team/data] team_members", dataError);
  const r = data as unknown as Record<string, unknown> | null;
  const lp = one((r?.leave_policies ?? null) as { name: string | null; auto_approve: boolean } | { name: string | null; auto_approve: boolean }[] | null);
  return { policyName: lp?.name ?? null, autoApprove: lp?.auto_approve === true };
}

// The company directory: current team members (active, on leave, or on notice —
// people who work here today; pre_start and departed are excluded), with a FIXED
// safe column list. Company-visible by design, so it takes no per-actor filter —
// but it deliberately does NOT read the team_directory view, which carries every
// member's leave balance, and it exposes no contact details (deferred decision:
// names/roles only). Widening these columns is a reviewed change, not a tweak.

export type DirectoryEntry = {
  id: string;
  name: string;
  avatarUrl: string | null;
  positionTitle: string | null;
  departmentName: string | null;
  location: string | null;
  managerName: string | null;
};

export async function getDirectory(): Promise<DirectoryEntry[]> {
  const { data, error: dataError } = await companyOs
    .from("team_members")
    .select(
      "id, work_location, manager_id, " +
        "people:people!person_id(full_name, preferred_name, avatar_url), " +
        "departments:departments!department_id(name), " +
        "positions:positions!position_id(title)",
    )
    .in("status", [...ON_CHART_STATUSES]);
  if (dataError) console.error("[team/data] team_members", dataError);
  type Name = { full_name: string | null; preferred_name: string | null; avatar_url?: string | null };
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const person = one(r.people as Name | Name[] | null);
    const legal = person ? legalName(person) : UNNAMED;
    return {
    id: r.id as string,
    managerId: (r.manager_id as string | null) ?? null,
    // The directory shows the name on record (S.14: legalName, not personName),
    // and keeps the team screens' own "—" for a member with no name at all.
    name: legal === UNNAMED ? "—" : legal,
    avatarUrl: person?.avatar_url ?? null,
    positionTitle:
      one(r.positions as { title: string | null } | { title: string | null }[] | null)?.title ?? null,
    departmentName:
      one(r.departments as { name: string | null } | { name: string | null }[] | null)?.name ?? null,
    location: (r.work_location as string | null) ?? null,
    };
  });
  // Managers are directory rows themselves — resolve names in-memory instead of
  // via the ambiguous self-referencing embed (see getManagerPerson).
  const nameById = new Map(rows.map((r) => [r.id, r.name]));
  const entries = rows.map(({ managerId, ...r }) => ({
    ...r,
    managerName: (managerId && nameById.get(managerId)) || null,
  }));
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

// The org chart: same audience and safe column list as the directory (names,
// roles, departments, city, photo — no contact details), plus manager_id and
// employment_type so the page can assemble the reporting tree and label
// contractors. A failed read raises: an empty list would draw "0 people" over
// a blank chart, which is a wrong answer; the page shows its error state.
export async function getOrgChart(): Promise<OrgEntry[]> {
  const rows = mustRows(
    await companyOs
      .from("team_members")
      .select(
        "id, person_id, manager_id, employment_type, work_location, " +
          `people:people!person_id(${NAME_COLUMNS}, avatar_url), ` +
          "departments:departments!department_id(name), " +
          "positions:positions!position_id(title)",
      )
      .in("status", [...ON_CHART_STATUSES]),
    "[team/data] team_members org chart",
  );
  type Name = NamedPerson & { avatar_url?: string | null };
  const entries = (rows as unknown as Record<string, unknown>[]).map((r) => {
    const person = one(r.people as Name | Name[] | null);
    const dept = one(r.departments as { name: string | null } | { name: string | null }[] | null);
    const pos = one(r.positions as { title: string | null } | { title: string | null }[] | null);
    const legal = person ? legalName(person, null) : null;
    return {
      id: r.id as string,
      personId: r.person_id as string,
      name: personName(person, "—"),
      legalName: legal,
      avatarUrl: person?.avatar_url ?? null,
      positionTitle: pos?.title ?? null,
      departmentName: dept?.name ?? null,
      location: (r.work_location as string | null) ?? null,
      employmentType: (r.employment_type as string | null) ?? null,
      managerId: (r.manager_id as string | null) ?? null,
    };
  });
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

// Open headcount, keyed by the hiring manager who owns it. job_requisitions
// stores hiring_manager_id against people, not team_members, so callers that
// work in team_member ids (the org chart) match on OrgEntry.personId. Company
// visible like the rest of /team: title, location, and the public posting link
// only — never salary bands or candidate data.
// A failed read raises, like getOrgChart; a caller that can live without the
// roles says so at its own call site.
export async function getOpenRoles(): Promise<OpenRole[]> {
  const rows = mustRows(
    await selectJobRequisitions("id, title, slug, location, employment_type, is_public, hiring_manager_id").eq("status", "open"),
    "[team/data] job_requisitions",
  );
  const roles = (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    title: (r.title as string | null) ?? "Open role",
    slug: (r.slug as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    employmentType: (r.employment_type as string | null) ?? null,
    isPublic: Boolean(r.is_public),
    hiringManagerPersonId: (r.hiring_manager_id as string | null) ?? null,
  }));
  return roles.sort((a, b) => a.title.localeCompare(b.title));
}

// Both org chart pages load through here and share one error state: null means
// a read failed (already logged); an empty company is an empty list, not null.
export async function loadOrgChart(): Promise<{ entries: OrgEntry[]; openRoles: OpenRole[] } | null> {
  try {
    const [entries, openRoles] = await Promise.all([getOrgChart(), getOpenRoles()]);
    return { entries, openRoles };
  } catch (e) {
    console.error("[team/data] org chart unavailable", e);
    return null;
  }
}

// Ideas that Spark Solutions: ideas and learnings are company-visible by
// design (the Learn and Share value — the whole team sees the feed), so like
// getDirectory these take no per-actor filter. The safety boundary is the
// FIXED column list (nothing beyond what the submitter typed plus their name)
// and the archived exclusion — archiving in the admin backlog is how a post
// is taken off the team feed. Widening the columns is a reviewed change.
export type SharedIdea = {
  id: string;
  kind: string;
  person_id: string;
  title: string;
  problem: string | null;
  data_needed: string | null;
  workflow: string | null;
  roi: string | null;
  story: string | null;
  takeaway: string | null;
  source_urls: string[] | null;
  office: string | null;
  ai_plan: string | null;
  ai_error: string | null;
  status: string;
  created_at: string;
  submitterName: string;
};

// One template literal from end to end: check-table-ownership reads a SELECT
// constant only when it opens and closes with the same quote.
const SHARED_IDEA_SELECT =
  `id, kind, person_id, title, problem, data_needed, workflow, roi, story, takeaway, source_urls, office, ai_plan, ai_error, status, created_at, people:people!person_id(${NAME_COLUMNS})`;

function toSharedIdea(r: Record<string, unknown>): SharedIdea {
  const person = one(r.people as ManagerName | ManagerName[] | null);
  const { people: _people, ...rest } = r;
  return { ...(rest as Omit<SharedIdea, "submitterName">), submitterName: personName(person, "—") };
}

export async function getSharedIdeas(): Promise<SharedIdea[]> {
  const { data, error: dataError } = await selectIdeas(SHARED_IDEA_SELECT)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(200);
  if (dataError) console.error("[team/data] ideas", dataError);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toSharedIdea);
}

// Single idea for the detail page. Archived rows stay visible to their own
// submitter (their history) but disappear for everyone else.
export async function getSharedIdea(actor: TeamActor, id: string): Promise<SharedIdea | null> {
  const { data, error: dataError } = await selectIdeas(SHARED_IDEA_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (dataError) console.error("[team/data] ideas", dataError);
  if (!data) return null;
  const idea = toSharedIdea(data as unknown as Record<string, unknown>);
  if (idea.status === "archived" && idea.person_id !== actor.personId) return null;
  return idea;
}

// A colleague's company-visible profile: the directory-safe fields plus the
// get-to-know-you extras people self-edit (hometown, education, hobbies).
// Deliberately NO contact details and nothing from people_sensitive — the same
// boundary as the directory; widening it is a reviewed change, not a tweak.
export type MemberProfile = {
  id: string;
  name: string;
  fullName: string | null;
  avatarUrl: string | null;
  positionTitle: string | null;
  departmentName: string | null;
  workLocation: string | null;
  employmentType: string | null;
  startDate: string | null;
  managerId: string | null;
  managerName: string | null;
  hometown: string | null;
  education: string | null;
  hobbies: string[];
};

export async function getMemberProfile(teamMemberId: string): Promise<MemberProfile | null> {
  const { data, error: dataError } = await companyOs
    .from("team_members")
    .select(
      "id, manager_id, employment_type, work_location, start_date, " +
        `people:people!person_id(${NAME_COLUMNS}, avatar_url, metadata), ` +
        "departments:departments!department_id(name), " +
        "positions:positions!position_id(title)",
    )
    .eq("id", teamMemberId)
    .in("status", [...ON_CHART_STATUSES])
    .maybeSingle();
  if (dataError) console.error("[team/data] team_members", dataError);
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  type Person = {
    full_name: string | null;
    preferred_name: string | null;
    avatar_url: string | null;
    metadata: Record<string, unknown> | null;
  };
  const person = one(r.people as Person | Person[] | null);
  const extras = extrasOf(person?.metadata ?? null);
  const managerId = (r.manager_id as string | null) ?? null;
  const mgr = await getManagerPerson(managerId);
  return {
    id: r.id as string,
    name: personName(person, "—"),
    // The name on record under the member's shown name (S.16), like /team/profile.
    fullName: legalName(person, null),
    avatarUrl: person?.avatar_url ?? null,
    positionTitle:
      one(r.positions as { title: string | null } | { title: string | null }[] | null)?.title ?? null,
    departmentName:
      one(r.departments as { name: string | null } | { name: string | null }[] | null)?.name ?? null,
    workLocation: (r.work_location as string | null) ?? null,
    employmentType: (r.employment_type as string | null) ?? null,
    startDate: (r.start_date as string | null) ?? null,
    managerId,
    managerName: personName(mgr, null),
    hometown: extras.hometown,
    education: extras.education,
    hobbies: extras.hobbies,
  };
}

// Self-scoped profile writes. Every function here is filtered on
// actor.personId (from the JWT-derived actor, never client input) and touches
// ONLY the fields an employee may edit about themselves. Employment fields,
// full_name (used for payroll), and the company email stay admin-managed;
// widening these allowlists is a security decision, not a convenience.

// people columns the employee may self-edit.
const OWN_PEOPLE_COLUMNS = [
  "preferred_name",
  "phone",
  "gender",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;
type OwnPeopleColumn = (typeof OWN_PEOPLE_COLUMNS)[number];
// people.metadata keys the employee may self-edit (birth_month/day are derived
// from the full DOB, which itself lives in the restricted people_sensitive).
const OWN_METADATA_KEYS = [
  "personal_email",
  "hometown",
  "education",
  "hobbies",
  "birth_month",
  "birth_day",
] as const;
type OwnMetadataKey = (typeof OWN_METADATA_KEYS)[number];

// Merge-write the actor's own people columns + metadata. metadata is read then
// merged (the JS client can't do a jsonb `||`), so empty/null keys are removed
// rather than written as nulls, keeping the blob tidy.
export async function updateOwnBasics(
  actor: TeamActor,
  columns: Partial<Record<OwnPeopleColumn, string | null>>,
  metadata: Partial<Record<OwnMetadataKey, unknown>>,
): Promise<{ ok: boolean; error: string | null }> {
  const { data: current, error: currentError } = await companyOs
    .from("people")
    .select("metadata")
    .eq("id", actor.personId)
    .maybeSingle();
  if (currentError) console.error("[team/data] people", currentError);
  const nextMeta: Record<string, unknown> = { ...((current as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {}) };
  for (const k of OWN_METADATA_KEYS) {
    if (!(k in metadata)) continue;
    const v = metadata[k];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) delete nextMeta[k];
    else nextMeta[k] = v;
  }
  const patch: Record<string, unknown> = { metadata: nextMeta, updated_at: new Date().toISOString() };
  for (const c of OWN_PEOPLE_COLUMNS) {
    if (c in columns) patch[c] = columns[c] ?? null;
  }
  const { error } = await updatePeople(patch).eq("id", actor.personId);
  return { ok: !error, error: error?.message ?? null };
}

// The actor's own restricted PII row (self-scoped). Returns null if none yet.
export async function getOwnSensitive(actor: TeamActor): Promise<SensitiveRow | null> {
  const { data, error: dataError } = await selectPeopleSensitive("*")
    .eq("person_id", actor.personId)
    .maybeSingle();
  if (dataError) console.error("[team/data] people_sensitive", dataError);
  return (data as SensitiveRow | null) ?? null;
}

// The actor's own company email — for the audit actor label and bank-change
// alert. Fetched server-side; never trust a client-supplied email as identity.
export async function getOwnEmail(actor: TeamActor): Promise<string | null> {
  const { data, error: dataError } = await companyOs
    .from("people")
    .select("email")
    .eq("id", actor.personId)
    .maybeSingle();
  if (dataError) console.error("[team/data] people", dataError);
  return (data as { email: string } | null)?.email ?? null;
}
