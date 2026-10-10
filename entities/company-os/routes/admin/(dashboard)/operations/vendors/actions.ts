"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { insertVendors, updateVendors } from "@/entities/finance";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { toPatch } from "@/kernel/config/patch";
import { parseLinkInput } from "@/kernel/ui/url";
import { archiveRecord, restoreRecord, type Result } from "@/entities/crm";
import { VENDOR_RATINGS, VENDOR_TYPES, type VendorInput } from "@/entities/company-os/ui/vendors/vendor-shared";

function validRating(rating: string | undefined): boolean {
  return rating === undefined || rating.trim() === "" || (VENDOR_RATINGS as readonly string[]).includes(rating);
}

function refresh() {
  revalidatePath("/admin/operations/vendors");
}

// Empty strings become null so cleared fields don't persist as "".

export async function createVendor(input: VendorInput): Promise<Result & { id?: string }> {
  const { user: admin } = await requirePermission("company-os.operations");

  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Vendor name is required." };
  if (!VENDOR_TYPES.includes(input.type)) return { ok: false, error: "Invalid vendor type." };
  if (!validRating(input.rating)) return { ok: false, error: "Invalid rating." };
  const url = parseLinkInput(input.url);
  if (!url.ok) return { ok: false, error: "Website isn't a web link. Paste the full address (e.g. example.com)." };

  const row = { ...toPatch(input), name, type: input.type, url: url.value };
  const { data, error } = await insertVendors(row).select("id").single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "vendors", recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  refresh();
  return { ok: true, id: data.id };
}

export async function updateVendor(id: string, patch: Partial<VendorInput>): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");

  if (patch.type !== undefined && !VENDOR_TYPES.includes(patch.type)) {
    return { ok: false, error: "Invalid vendor type." };
  }
  if (!validRating(patch.rating)) return { ok: false, error: "Invalid rating." };
  const url = patch.url === undefined ? undefined : parseLinkInput(patch.url);
  if (url && !url.ok) return { ok: false, error: "Website isn't a web link. Paste the full address (e.g. example.com)." };
  const updates = { ...toPatch(patch), ...(url?.ok ? { url: url.value } : {}), updated_at: new Date().toISOString() };
  if ("name" in updates && !updates.name) {
    return { ok: false, error: "Vendor name can't be empty." };
  }

  const { error } = await updateVendors(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "vendors", recordId: id, operation: "update", actor: admin.email, newData: patch });
  refresh();
  return { ok: true };
}

export async function archiveVendor(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");
  const r = await archiveRecord("vendors", id, admin.email);
  if (r.ok) refresh();
  return r;
}

export async function restoreVendor(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");
  const r = await restoreRecord("vendors", id, admin.email);
  if (r.ok) refresh();
  return r;
}
