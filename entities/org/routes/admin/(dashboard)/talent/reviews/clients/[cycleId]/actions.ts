"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { markClientManagerLinkCopied, type LinkCopiedResult } from "@/entities/org/lib/client-reviews/overview";
import { LinkCopiedInput } from "./schemas";

/** Records that the owner copied a client manager's link, so the overview shows when (CR.2.3). */
export async function markLinkCopiedAction(raw: LinkCopiedInput): Promise<LinkCopiedResult> {
  await requirePermission("org.reviews");
  const parsed = LinkCopiedInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  return markClientManagerLinkCopied(parsed.data.reviewId);
}
