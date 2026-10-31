"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { updateCompanies } from "@/kernel/identity/writes";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";

import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { toPatch } from "@/kernel/config/patch";
import { parseLinkInput } from "@/kernel/ui/url";
import { archiveRecord, guardedDelete, restoreRecord, type Result } from "@/entities/crm/lib/mutations";

export type CompanyPatch = {
  name?: string;
  website_url?: string;
  industry?: string;
  industry_normalized?: string;
  size_band?: string;
  country?: string;
  priority?: string;
  notes?: string;
  client_start_date?: string;
  client_end_date?: string;
};

function refresh(id?: string) {
  revalidateSurfaces("/revenue/companies");
  if (id) revalidateSurfaces(`/revenue/companies/${id}`);
}

export async function updateCompany(id: string, patch: CompanyPatch): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");

  const updates: CompanyOsUpdate<"companies"> = {
    updated_at: new Date().toISOString(),
    // Same conversion the loop used to do inline (drop `undefined`, blank
    // string to null); toPatch is the kernel copy, and keeps the key names
    // typed against the `companies` columns now that the client is typed.
    ...toPatch(patch),
  };
  if ("name" in updates && !updates.name) {
    return { ok: false, error: "Company name can't be empty." };
  }
  // The details card draws the website as an href. A value that is not a link
  // is refused rather than written as null, which would clear the saved one.
  if (patch.website_url !== undefined) {
    const site = parseLinkInput(patch.website_url);
    if (!site.ok) return { ok: false, error: "The website isn't a web link. Enter the company's address (e.g. acme.com)." };
    updates.website_url = site.value;
  }

  const { error } = await updateCompanies(updates).eq("id", id);
  if (error?.message.includes("companies_client_term_check")) {
    return { ok: false, error: "The end date can't be before the start date." };
  }
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "companies", recordId: id, operation: "update", actor: admin.email, newData: patch });
  refresh(id);
  return { ok: true };
}

export async function archiveCompany(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const r = await archiveRecord("companies", id, admin.email);
  if (r.ok) refresh(id);
  return r;
}

export async function restoreCompany(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const r = await restoreRecord("companies", id, admin.email);
  if (r.ok) refresh(id);
  return r;
}

// Guarded by the schema's foreign keys: a company that still has deals, job
// requisitions or projects can't be erased until those are cleared.
export async function deleteCompany(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const r = await guardedDelete("companies", id, admin.email, { via: "companies" });
  if (r.ok) refresh();
  return r;
}
