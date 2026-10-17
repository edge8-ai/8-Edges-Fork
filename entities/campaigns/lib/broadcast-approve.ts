import { companyOs } from "@/kernel/data/supabase";
import { getBroadcast, type BroadcastRow } from "./broadcasts";
import { materializeRecipients } from "./recipients";
import { INTRO_MARKER } from "./series-template";
import { letterAwaitsApproval } from "./letter/send-step";

// What Approve checks before it writes (A.55): the step that runs between the
// lifecycle's status check and its write, moved here from the route action so
// the action is guard, call, refresh. These are the broadcast's own checks, not
// the letter's freeze (lockLetterCopy): a letter is approved through its send
// approval, and a plain Approve of one is refused below (Y.17).

export type ApprovalReady = { ok: true; campaign: BroadcastRow; recipients: number };

/** Why this draft must not be approved yet, or the broadcast and its pending recipient count. */
export async function approvalChecks(id: string): Promise<ApprovalReady | { ok: false; error: string }> {
  const campaign = await getBroadcast(id);
  if (!campaign) return { ok: false, error: "Broadcast not found." };
  const awaiting = await letterAwaitsApproval(id);
  if (awaiting) return { ok: false, error: awaiting };
  if (!campaign.bodyMd.trim()) return { ok: false, error: "Write the email body before approving." };
  if (campaign.bodyMd.includes(INTRO_MARKER)) return { ok: false, error: "Write this week's intro before approving." };
  // Asked before the list is built, which adds rows: a series issue with no
  // send moment is refused without touching its recipients.
  if (campaign.seriesId && !campaign.scheduledAt) {
    return { ok: false, error: "This series issue has no send time. Set a schedule before approving." };
  }

  // A saved audience is resolved again at approval, so anyone who joined it
  // since the list was built (a new tag, a new client) is included.
  if (campaign.audienceId) {
    const built = await materializeRecipients(campaign);
    if (!built.ok) return { ok: false, error: built.error };
  }

  const { count, error } = await companyOs
    .from("email_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "Build the recipient list before approving." };
  return { ok: true, campaign, recipients: count };
}
