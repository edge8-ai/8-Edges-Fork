"use server";

import { z } from "zod/v4";
import { companyOs } from "@/kernel/data/supabase";
import type { Result } from "@/kernel/data/result";
import { requirePermission } from "@/kernel/identity/access-request";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { readInquiryAgainNow } from "./inquiry-chain";
import { updateInquiries } from "./writes";

// The three things a person does with the qualifier's read (Z.11, spec section
// 11), shared by the Leads card and the Inquiries board. A correction is
// recorded beside the read and moves nobody; a restore puts a held inquiry back
// in New and changes nothing else; Read again replaces the read, and files only
// an inquiry its run never filed (one stopped before filing), so it never
// promotes, links or moves an inquiry twice. Each guards first.

function refresh(): void {
  revalidateSurfaces("/revenue/leads");
  revalidateSurfaces("/revenue/inquiries");
}

const correctionInput = z.object({
  inquiryId: z.uuid(),
  verdict: z.enum(["sales", "not_sales", "spam", "needs_a_person"]),
  fit: z.number().int().min(0).max(5),
});

/**
 * Record what the read should have been. The same verdict and fit is an
 * acceptance; anything else is a correction. It moves nobody: a spam
 * correction still needs Disqualify, and a sales correction still needs
 * Promote.
 */
export async function correctQualifierRead(inquiryId: string, verdict: string, fit: number): Promise<Result> {
  const access = await requirePermission("crm.pipeline");
  const input = correctionInput.safeParse({ inquiryId, verdict, fit });
  if (!input.success) return { ok: false, error: "Pick what the inquiry is, and a fit from 0 to 5." };
  const { data: row, error: readError } = await companyOs.from("inquiry_triage").select("verdict, fit").eq("inquiry_id", input.data.inquiryId).maybeSingle();
  if (readError) return { ok: false, error: `inquiry_triage: ${readError.message}` };
  if (!row || !row.verdict) return { ok: false, error: "The qualifier has not read this inquiry yet." };
  const accepted = row.verdict === input.data.verdict && (row.fit ?? null) === input.data.fit;
  const { data, error } = await companyOs
    .from("inquiry_triage")
    .update({
      review: accepted ? "accepted" : "corrected",
      corrected_verdict: accepted ? null : input.data.verdict,
      corrected_fit: accepted ? null : input.data.fit,
      reviewed_by: access.personId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("inquiry_id", input.data.inquiryId)
    .select("inquiry_id");
  if (error) return { ok: false, error: `inquiry_triage: ${error.message}` };
  if (!data || data.length !== 1) return { ok: false, error: "The inquiry's run was not found." };
  refresh();
  return { ok: true };
}

/** Put an inquiry the qualifier held as spam back in New. Promote it from there as today. */
export async function restoreHeldInquiry(inquiryId: string): Promise<Result> {
  await requirePermission("crm.pipeline");
  const id = z.uuid().safeParse(inquiryId);
  if (!id.success) return { ok: false, error: "Unknown inquiry." };
  const { data, error } = await updateInquiries({ status: "new_lead" }).eq("id", id.data).eq("status", "spam").select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length !== 1) return { ok: false, error: "This inquiry is no longer held as spam. Reload to see where it is." };
  refresh();
  return { ok: true };
}

/**
 * Read the inquiry again: a new read replaces the old one and any correction
 * of it, and its first step runs now. The person's saved GPCT answers are not
 * touched.
 */
export async function readInquiryAgain(inquiryId: string): Promise<Result> {
  await requirePermission("crm.pipeline");
  const id = z.uuid().safeParse(inquiryId);
  if (!id.success) return { ok: false, error: "Unknown inquiry." };
  try {
    const out = await readInquiryAgainNow(id.data);
    if (!out.ok) return out;
    refresh();
    const r = out.result;
    if ("skipped" in r) return { ok: false, error: r.skipped };
    if (!r.ok) return { ok: false, error: `The qualifier could not read it this time (${r.error.slice(0, 160)}). The driver tries again within five minutes.` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
