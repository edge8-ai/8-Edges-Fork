"use server";

// Settings → Access writes (ADR 0013, AC.17): grant a role with a reason,
// revoke a grant, create a one-person role, and add or take away a role's
// permissions. Every action asks for access.manage first, then the rule in
// kernel/identity/access-grants.ts: nobody hands out more than they hold, an
// implied role follows its fact, and a permission no installed area declares is
// refused. Grants and role permissions are append-only (a revoke stamps
// revoked_at) and every write is audited. Since AC.20 this is also where Admin
// and Super Admin are granted: granting Admin sends a new admin their sign-in
// email, and nobody may take Admin or Super Admin from themselves or revoke the
// last Super Admin grant.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows, readOr } from "@/kernel/data/read";
import { recordAudit } from "@/kernel/audit/audit";
import { requirePermission } from "@/kernel/identity/access-request";
import { removePermissionRefusal } from "@/kernel/identity/access-grants";
import { sendAccessEmail } from "@/entities/company-os/lib/admin-sign-in";
import { addRolePermissionAs, createRoleAs, grantRoleTo, heldBy, loadRole, revokeGrantAs } from "@/entities/company-os/lib/access-grant";
import { updateAccessRolePermissions } from "@/kernel/identity/writes";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const Id = z.string().uuid();
const Reason = z.string().trim().min(3, "Say why, in a few words.").max(500);
const ScopeIn = z.enum(["own", "team", "clients", "all"]);

function refresh() {
  revalidatePath("/admin/settings/access");
}

export async function grantRole(personId: string, roleId: string, reason: string): Promise<Result> {
  const access = await requirePermission("access.manage");
  const input = z.object({ personId: Id, roleId: Id, reason: Reason }).safeParse({ personId, roleId, reason });
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Pick a person and a role, and say why." };

  // The rule and the write are the invite's too (entities/company-os/lib/access-grant.ts).
  const granted = await grantRoleTo({ access, personId: input.data.personId, roleId: input.data.roleId, reason: input.data.reason });
  if (!granted.ok) return { ok: false, error: granted.error };
  refresh();
  if (granted.roleKey !== "admin") return { ok: true, message: granted.message };
  return { ok: true, message: `${granted.message} ${await signInEmailFor(input.data.personId)}`.trim() };
}

// A new admin with no login yet is invited to set a password (AC.20, the job
// Settings → Admins used to do). The grant has already landed, so a failure
// here is reported in the message rather than as a failed grant.
async function signInEmailFor(personId: string): Promise<string> {
  const person = readOr(await companyOs.from("people").select("email").eq("id", personId).limit(1), "[access] people", [])[0];
  if (!person?.email) return "They have no email on their record, so no sign-in email was sent.";
  const sent = await sendAccessEmail(person.email);
  if (!sent.ok) return `The sign-in email could not be sent (${sent.error}); they can use "Forgot password" on the login page.`;
  return sent.message ?? "";
}
export async function revokeGrant(assignmentId: string, reason: string): Promise<Result> {
  const access = await requirePermission("access.manage");
  const input = z.object({ assignmentId: Id, reason: Reason }).safeParse({ assignmentId, reason });
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Say why the grant ends." };
  // The rule and the write are the invite's Cancel too (entities/company-os/lib/access-grant.ts).
  const revoked = await revokeGrantAs(access, input.data.assignmentId, input.data.reason);
  if (!revoked.ok) return revoked;
  refresh();
  return { ok: true, message: revoked.message };
}

export async function createRole(name: string, description: string): Promise<Result> {
  const access = await requirePermission("access.manage");
  const input = z
    .object({ name: z.string().trim().min(2).max(80), description: z.string().trim().min(3, "Say what holding it means.").max(300) })
    .safeParse({ name, description });
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Give the role a name and a sentence." };
  // The invite's custom shape creates its one-person role the same way.
  const created = await createRoleAs(access, input.data.name, input.data.description);
  if (!created.ok) return created;
  refresh();
  return { ok: true, message: created.message };
}

export async function addRolePermission(roleId: string, permission: string, scope: string): Promise<Result> {
  const access = await requirePermission("access.manage");
  const input = z.object({ roleId: Id, permission: z.string().trim().min(3).max(120), scope: ScopeIn }).safeParse({ roleId, permission, scope });
  if (!input.success) return { ok: false, error: "Pick a permission and how far it reaches." };
  const added = await addRolePermissionAs(access, input.data.roleId, input.data.permission, input.data.scope);
  if (!added.ok) return added;
  refresh();
  return { ok: true, message: added.message };
}


export async function removeRolePermission(rolePermissionId: string): Promise<Result> {
  const access = await requirePermission("access.manage");
  const id = Id.safeParse(rolePermissionId);
  if (!id.success) return { ok: false, error: "That permission row is not valid." };

  const pair = mustRows(
    await companyOs.from("access_role_permissions").select("id, role_id, permission, scope, revoked_at").eq("id", id.data).limit(1),
    "[access] access_role_permissions",
  )[0];
  if (!pair || pair.revoked_at) return { ok: false, error: "That permission is no longer on the role." };
  const found = await loadRole(pair.role_id);
  if (!found) return { ok: false, error: "That role no longer exists." };
  const refusal = removePermissionRefusal(found.role, await heldBy(access));
  if (refusal) return { ok: false, error: refusal };

  const { error } = await updateAccessRolePermissions({ revoked_at: new Date().toISOString(), revoked_by: access.personId })
    .eq("id", pair.id)
    .is("revoked_at", null);
  if (error) return { ok: false, error: `Could not take the permission off: ${error.message}` };
  await recordAudit({
    table: "access_role_permissions",
    recordId: pair.id,
    operation: "update",
    actor: access.user.email,
    oldData: { revoked_at: null },
    newData: { role: found.role.key, permission: pair.permission, scope: pair.scope, revoked: true },
  });
  refresh();
  return { ok: true, message: `${found.role.name} no longer holds ${pair.permission}.` };
}
