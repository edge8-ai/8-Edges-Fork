// The vendor register: the questions other entities ask of it and the writes
// they make to it (A.65, ADR 0018). Company-os and the team hub add and edit
// vendors, org's equipment screen picks one, and crm's generic archive,
// restore and erase handle a vendor alongside a person, a company and a deal.
import type { PostgrestError } from "@supabase/supabase-js";
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";
import type { Result } from "@/kernel/data/result";

type VendorInsert = TablesInsert<{ schema: "company_os" }, "vendors">;
type VendorUpdate = TablesUpdate<{ schema: "company_os" }, "vendors">;

/** The vendors still in use, by name: what a picker offers. */
export async function vendorOptions() {
  return companyOs.from("vendors").select("id, name").is("archived_at", null).order("name", { ascending: true });
}

/** Adds a vendor and answers its id. The caller has already checked the fields its form collects. */
export async function addVendor(row: VendorInsert) {
  return companyOs.from("vendors").insert(row).select("id").single();
}

/** Writes a change to one vendor. */
export async function changeVendor(vendorId: string, patch: VendorUpdate): Promise<Result> {
  const { error } = await companyOs.from("vendors").update(patch).eq("id", vendorId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Stamps a vendor archived (or clears the stamp, to restore it). With
 * `liveOnly` the stamp lands only on a vendor not already archived, so
 * archiving twice keeps the first date and actor.
 */
export async function stampVendorArchive(
  vendorId: string,
  stamp: { archived_at: string | null; archived_by: string | null },
  liveOnly: boolean,
): Promise<{ error: PostgrestError | null }> {
  const query = companyOs.from("vendors").update(stamp).eq("id", vendorId);
  return liveOnly ? query.is("archived_at", null) : query;
}

/**
 * Erases a vendor. The error is PostgREST's own, so the caller can tell a
 * foreign-key refusal (23503) from any other failure.
 */
export async function eraseVendor(vendorId: string): Promise<{ error: PostgrestError | null }> {
  return companyOs.from("vendors").delete().eq("id", vendorId);
}
