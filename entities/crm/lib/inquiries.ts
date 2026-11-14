// Inquiries, as the entities that take one in ask about them (A.63): the public
// contact form, a retreat sign-up, a portal member's general request, and the
// Stripe fulfilment that marks a paid retreat inquiry won.
import { companyOs } from "@/kernel/data/supabase";
import type { Json, TablesInsert } from "@/kernel/data/supabase/database.types";

export type InquiryInput = TablesInsert<{ schema: "company_os" }, "inquiries">;

/** Takes an inquiry in and answers with its id. */
export async function recordInquiry(row: InquiryInput) {
  return companyOs.from("inquiries").insert(row).select("id").single();
}

/** A person's most recent requests sent from the portal, newest first, at most `limit`. */
export async function portalInquiriesOf(personId: string, limit: number) {
  return companyOs
    .from("inquiries")
    .select("id, subject, status, created_at")
    .eq("person_id", personId)
    .eq("source", "portal")
    .order("created_at", { ascending: false })
    .limit(limit);
}

/** A person's most recent retreat inquiry, or null. */
export async function latestRetreatInquiry(personId: string) {
  return companyOs
    .from("inquiries")
    .select("id, status, metadata")
    .eq("person_id", personId)
    .eq("type", "retreat")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

/**
 * Marks an inquiry won with the metadata the caller merged. An inquiry already
 * won is left alone, so a redelivered payment writes nothing.
 */
export async function markInquiryWon(inquiryId: string, metadata: { [key: string]: Json | undefined }) {
  return companyOs.from("inquiries").update({ status: "won", metadata }).eq("id", inquiryId).neq("status", "won");
}
