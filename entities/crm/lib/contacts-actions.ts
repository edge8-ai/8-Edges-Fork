"use server";

import { revalidatePath } from "next/cache";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { readAuditPage } from "@/kernel/audit/history-read";
import type { AuditPageResult } from "@/kernel/audit/history";
import { archiveRecord, guardedDelete, restoreRecord, type Result } from "@/entities/crm/lib/mutations";
import { getPerson360, type Person360 } from "@/entities/crm/lib/contacts";
import { updatePeople } from "@/kernel/identity/writes";
import { parseLinkInput, LINKEDIN_NOT_A_LINK } from "@/kernel/ui/url";

// Lazy loader for the contacts list shelf — related data (companies, deals) is
// fetched on row open, never preloaded per row.
export async function getPersonShelf(id: string): Promise<Person360 | null> {
  await requirePermission("crm.contacts");
  return getPerson360(id);
}

// The contact's own audit trail, for the shelf's History tab (S.4). It loads on
// the tab, not on the row, so a shelf opened to read a phone number never pays
// for it. Records only: this answers what was done to THIS contact.
export async function getPersonHistory(id: string, offset: number, limit: number): Promise<AuditPageResult> {
  await requirePermission("crm.contacts");
  return readAuditPage("people", id, offset, limit);
}

export async function updatePerson(
  id: string,
  patch: {
    full_name?: string;
    phone?: string;
    persona?: string;
    country?: string;
    linkedin_url?: string;
    notes?: string;
    do_not_contact?: boolean;
  },
): Promise<Result> {
  const { user: admin } = await requirePermission("crm.contacts");
  const clean: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) {
    clean[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  if (patch.linkedin_url !== undefined) {
    const link = parseLinkInput(patch.linkedin_url);
    if (!link.ok) return { ok: false, error: LINKEDIN_NOT_A_LINK };
    clean.linkedin_url = link.value;
  }
  const { error } = await updatePeople(clean).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "people", recordId: id, operation: "update", actor: admin.email, newData: patch });
  revalidatePath(`/admin/contacts/${id}`);
  revalidatePath("/admin/contacts");
  return { ok: true };
}

function refresh(id: string) {
  revalidatePath(`/admin/contacts/${id}`);
  revalidatePath("/admin/contacts");
  revalidateSurfaces("/revenue/leads");
}

// Archive: reversible soft-delete. The person leaves the working lists but the
// record and its history stay intact.
export async function archivePerson(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.contacts");
  const r = await archiveRecord("people", id, admin.email);
  if (r.ok) refresh(id);
  return r;
}

export async function restorePerson(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.contacts");
  const r = await restoreRecord("people", id, admin.email);
  if (r.ok) refresh(id);
  return r;
}

// Permanent erasure (GDPR right to be forgotten). Guarded by the schema's
// foreign keys: a person with orders/bookings/deals cannot be erased until those
// are cleared, and the attempt returns a clear message instead of a DB error.
export async function deletePerson(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.contacts");
  const r = await guardedDelete("people", id, admin.email, { via: "contact_360" });
  if (r.ok) {
    revalidatePath("/admin/contacts");
    revalidateSurfaces("/revenue/leads");
  }
  return r;
}
