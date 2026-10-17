"use server";

import { revalidatePath } from "next/cache";
import { insertVendors } from "@/entities/finance";
import { VENDOR_RATINGS, VENDOR_TYPES, type VendorInput } from "@/entities/company-os/client";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { toPatch } from "@/kernel/config/patch";
import type { Result } from "@/kernel/data/result";
import { parseLinkInput } from "@/kernel/ui/url";

// Team-member vendor actions for /team/vendors. Deliberately NOT a reuse of the
// admin actions in entities/company-os/routes/admin/(dashboard)/operations/vendors/actions.ts:
// those are safe only under requireAdmin(), and they accept tax IDs and bank
// details, which stay admin-only. A team member may add a vendor and nothing
// else; there is no update, archive or restore here.

type TeamVendorInput = Omit<VendorInput, "tax_id" | "bank_info">;

export async function createTeamVendor(input: TeamVendorInput): Promise<Result> {
  await requirePermission("team.vendors");
  const actor = await requireTeamMember();

  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Vendor name is required." };
  if (!VENDOR_TYPES.includes(input.type)) return { ok: false, error: "Invalid vendor type." };
  const rating = input.rating;
  if (rating !== undefined && rating.trim() !== "" && !(VENDOR_RATINGS as readonly string[]).includes(rating)) {
    return { ok: false, error: "Invalid rating." };
  }
  const url = parseLinkInput(input.url);
  if (!url.ok) return { ok: false, error: "Website isn't a web link. Paste the full address (e.g. example.com)." };

  // The row is built from an allowlist rather than spread from the input: the
  // client can send any keys it likes, and tax_id or bank_info arriving here
  // must never reach the table from the team surface.
  const fields: TeamVendorInput = {
    type: input.type,
    name,
    price_range: input.price_range,
    address: input.address,
    phone: input.phone,
    primary_contact_name: input.primary_contact_name,
    primary_contact_email: input.primary_contact_email,
    primary_contact_phone: input.primary_contact_phone,
    secondary_contact_name: input.secondary_contact_name,
    secondary_contact_email: input.secondary_contact_email,
    secondary_contact_phone: input.secondary_contact_phone,
    rating: input.rating,
    url: input.url,
    notes: input.notes,
  };
  // Empty strings become null so blank fields don't persist as "".
  const row = { ...toPatch(fields), name, type: input.type, url: url.value };
  const { data, error } = await insertVendors(row).select("id").single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "vendors",
    recordId: data.id,
    operation: "insert",
    actor: actor.email,
    newData: row,
    context: { via: "team" },
  });
  revalidatePath("/team/vendors");
  revalidatePath("/admin/operations/vendors");
  return { ok: true };
}
