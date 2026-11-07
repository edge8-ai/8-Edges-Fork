import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";

// What company-os's Resend webhook and its daily broadcast recap ask of
// campaigns' email tables, and the two writes they make (A.70, ADR 0018).
// Until A.70 the door handed out `selectEmailCampaignRecipients`,
// `selectEmailMessages`, `selectEmailCampaigns`, `insertEmailEvents` and
// `updateEmailCampaigns`, and company-os chained its own filters onto them.
// Each function here is the exact query or write its caller made: same
// columns, filters, order, limit, single-row form and payload.
// entities/campaigns/lib/email-tracking.test.ts pins each one.
//
// The selects are literal, so PostgREST types the rows.

/** The broadcast a Resend email was sent for, as `{ campaign_id }` or null. */
export function campaignOfResendEmail(resendEmailId: string) {
  return companyOs.from("email_campaign_recipients").select("campaign_id").eq("resend_email_id", resendEmailId).maybeSingle();
}

/** The personal message a Resend email carried, as `{ id }` or null. */
export function messageOfResendEmail(resendEmailId: string) {
  return companyOs.from("email_messages").select("id").eq("resend_email_id", resendEmailId).maybeSingle();
}

/** Records one delivery event from Resend's webhook. Resolves to `{ error }`. */
export function recordEmailEvent(row: TablesInsert<{ schema: "company_os" }, "email_events">) {
  return companyOs.from("email_events").insert(row);
}

/**
 * Sent broadcasts whose recap is not posted yet and that went out at or before
 * `settledBefore`, oldest first, at most `limit` (the daily recap cron).
 */
export function broadcastsAwaitingRecap(settledBefore: string, limit: number) {
  return companyOs
    .from("email_campaigns")
    .select("id, name, subject, approved_at")
    .eq("status", "sent")
    .is("summary_posted_at", null)
    .lte("sent_at", settledBefore)
    .order("sent_at", { ascending: true })
    .limit(limit);
}

/** Latches a broadcast's recap as posted now, so the cron does not post it again. Resolves to `{ error }`. */
export function markRecapPosted(campaignId: string) {
  return companyOs.from("email_campaigns").update({ summary_posted_at: new Date().toISOString() }).eq("id", campaignId);
}
