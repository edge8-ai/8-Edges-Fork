"use server";

import { revalidatePath } from "next/cache";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { promotePersonToLead } from "@/entities/crm/lib/lifecycle";
import { escapeHtml } from "@/kernel/config/html";
import type { Result } from "@/kernel/data/result";

// The four working stages plus the two terminal exits. 'qualified' is not
// movable here: promotion goes through promoteInquiryToLead so the person
// also lands in the SDR lead queue.
const STATUSES = new Set(["new_lead", "contacted", "no_action", "spam", "archived"]);

function refresh() {
  revalidateSurfaces("/revenue/inquiries");
  // The cockpit's "Inquiries to triage" card only shows new_lead; archiving or
  // moving an inquiry must clear it there too, not just on the board.
  revalidateSurfaces("/revenue");
}

export async function moveInquiryStatus(id: string, status: string): Promise<Result> {
  await requirePermission("crm.pipeline");
  if (!STATUSES.has(status)) return { ok: false, error: "Invalid status." };
  const { error } = await companyOs.from("inquiries").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function archiveInquiry(id: string): Promise<Result> {
  return moveInquiryStatus(id, "archived");
}

export async function markInquirySpam(id: string): Promise<Result> {
  return moveInquiryStatus(id, "spam");
}

// Promote to lead: the inquiry moves to 'qualified' AND the person joins the
// SDR queue on /admin/revenue/leads via the shared lifecycle helper (upserts
// the lead satellite row with a fresh SLA, logs the transition).
export async function promoteInquiryToLead(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");

  const { data: inquiry, error: iErr } = await companyOs.from("inquiries").select("person_id")
    .eq("id", id)
    .maybeSingle();
  if (iErr || !inquiry) return { ok: false, error: iErr?.message ?? "Inquiry not found." };
  if (!inquiry.person_id) return { ok: false, error: "No contact attached to this inquiry." };

  const promoted = await promotePersonToLead(inquiry.person_id, {
    reason: "inquiry_promoted",
    changedBy: admin.email,
  });
  if (!promoted.ok) return promoted;

  const { error: uErr } = await companyOs.from("inquiries").update({ status: "qualified" })
    .eq("id", id);
  if (uErr) return { ok: false, error: uErr.message };

  refresh();
  revalidateSurfaces("/revenue/leads");
  revalidatePath("/admin/contacts");
  return { ok: true };
}

export async function replyToInquiry(input: {
  to: string | null;
  subject: string;
  body: string;
  doNotContact: boolean;
}): Promise<Result> {
  await requirePermission("crm.pipeline");
  if (input.doNotContact) return { ok: false, error: "This contact is marked do-not-contact." };
  if (!input.to) return { ok: false, error: "No email address on file for this contact." };
  if (!input.body.trim()) return { ok: false, error: "Message is empty." };
  if (!process.env.RESEND_API_KEY) return { ok: false, error: "Email is not configured (RESEND_API_KEY)." };

  await sendTransactionalEmail({
    to: input.to,
    subject: input.subject.trim() || "Re: your inquiry",
    html: `<div>${escapeHtml(input.body).replace(/\n/g, "<br>")}</div>`,
    replyTo: process.env.ADMIN_EMAILS?.split(",")[0]?.trim(),
  });
  return { ok: true };
}
