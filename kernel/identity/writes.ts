// The writes an entity may make to the kernel's identity tables (multi-entity
// design §4; ME-13). The kernel owns `people`, `admins`, `team_members`,
// `portal_members` and `portal_assume_sessions`, and it is a library with no
// door, so an entity imports this module by its kernel path instead of writing
// the table raw; the table-ownership gate (scripts/check-table-ownership.mjs)
// fails a raw entity write to a kernel table. Each writer is the verb of the
// statement its caller used to build inline — it returns the PostgREST
// builder so the caller keeps its own filters, select and error handling, and
// moving the call here changed no behaviour. The auth guard stays with the
// caller: the kernel does not know which of the four to six entities that
// maintain a person row is acting.
import { companyOs, rpcArgs } from "@/kernel/data/supabase";
import type { Json, TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

type Writable =
  | "people"
  | "admins"
  | "team_members"
  | "portal_members"
  | "portal_assume_sessions"
  | "companies"
  | "documents"
  | "access_roles"
  | "access_role_permissions"
  | "access_role_assignments";
type Insert<T extends Writable> =
  | TablesInsert<{ schema: "company_os" }, T>
  | TablesInsert<{ schema: "company_os" }, T>[];
type Update<T extends Writable> =
  TablesUpdate<{ schema: "company_os" }, T>;

export const insertPeople = (row: Insert<"people">) => companyOs.from("people").insert(row);
export const updatePeople = (patch: Update<"people">) => companyOs.from("people").update(patch);
export const upsertPeople = (row: Insert<"people">, options?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
  companyOs.from("people").upsert(row, options);
export const deletePeople = () => companyOs.from("people").delete();
// `companies` is a kernel table for the same reason `people` is: portal-auth
// resolves the signed-in member's company on every request, and a kernel that
// imports an entity to do it would be worse than a kernel table with no
// exclusive owner. Contacts owns the screens over it (RS-01).
export const insertCompanies = (row: Insert<"companies">) => companyOs.from("companies").insert(row);
export const updateCompanies = (patch: Update<"companies">) => companyOs.from("companies").update(patch);
export const deleteCompanies = () => companyOs.from("companies").delete();
// companies.metadata is shared by writers that each own a few keys (the portal's
// company form, the QuickBooks customer mapping), so a writer never sends the
// whole object: it names the keys it changes and the database applies them to
// the row as stored (S.18). Sending `metadata` through updateCompanies after
// reading it is how one writer's save used to drop another's keys.
// Both resolve to `data: false` when the company does not exist.
export const mergeCompanyMetadata = (companyId: string, patch: { [key: string]: Json | undefined }) =>
  companyOs.rpc("merge_company_metadata", { p_company_id: companyId, p_patch: patch });
// Makes one company the only holder of `value` in the `key` list, removing it
// from every other company in the same transaction; a null company only
// removes it.
export const assignCompanyMetadataId = (key: string, value: string, companyId: string | null) =>
  companyOs.rpc("assign_company_metadata_id", rpcArgs({ p_key: key, p_value: value, p_company_id: companyId }));
// The one way a routine adds a company (Z.11): the live company whose website
// has this host, or, when none does and `create` is set, a new one, under a
// per-host advisory lock so two inquiries from one new company make one. The
// function creates for any host it is given, a free mailbox's included: the
// caller decides that the host names a company (entities/crm/lib/free-mail.ts).
// Answers no row when the host is not a plain host name, or nothing matched
// and `create` was not set.
export const findOrCreateCompanyByHost = (host: string, name: string | null, create: boolean) =>
  companyOs.rpc("find_or_create_company_by_host", rpcArgs({ p_host: host, p_name: name, p_create: create }));
// `documents` is a kernel table too: it is file metadata, not any one entity's
// business — hiring stores resumes in it, company-os stores contracts, portal
// stores deliverables. An owner among them would make every other entity ask
// that one for permission to keep a file.
export const insertDocuments = (row: Insert<"documents">) => companyOs.from("documents").insert(row);
export const deleteDocuments = () => companyOs.from("documents").delete();
export const insertTeamMembers = (row: Insert<"team_members">) => companyOs.from("team_members").insert(row);
export const updateTeamMembers = (patch: Update<"team_members">) => companyOs.from("team_members").update(patch);
export const insertPortalMembers = (row: Insert<"portal_members">) => companyOs.from("portal_members").insert(row);
export const updatePortalMembers = (patch: Update<"portal_members">) => companyOs.from("portal_members").update(patch);
export const insertPortalAssumeSessions = (row: Insert<"portal_assume_sessions">) => companyOs.from("portal_assume_sessions").insert(row);
export const updatePortalAssumeSessions = (patch: Update<"portal_assume_sessions">) => companyOs.from("portal_assume_sessions").update(patch);

// The access tables (ADR 0013), written only by Settings → Access. Grants and
// role permissions are append-only: a revoke sets revoked_at, nothing is
// deleted, so there is no delete writer.
export const insertAccessRoles = (row: Insert<"access_roles">) => companyOs.from("access_roles").insert(row);
export const insertAccessRolePermissions = (row: Insert<"access_role_permissions">) => companyOs.from("access_role_permissions").insert(row);
export const updateAccessRolePermissions = (patch: Update<"access_role_permissions">) => companyOs.from("access_role_permissions").update(patch);
export const insertAccessRoleAssignments = (row: Insert<"access_role_assignments">) => companyOs.from("access_role_assignments").insert(row);
export const updateAccessRoleAssignments = (patch: Update<"access_role_assignments">) => companyOs.from("access_role_assignments").update(patch);
