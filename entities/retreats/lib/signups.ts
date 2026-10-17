import { companyOs } from "@/kernel/data/supabase";
import { insertInquiries } from "@/entities/crm";
import { getOrCreatePerson } from "@/kernel/data/company-os";
import { SOURCE_SITE } from "@/kernel/config/utils";
import { promotePersonToLead } from "@/entities/crm";

// Records a retreat lead into the company_os schema: get-or-create the person by
// email, then insert an inquiry tagged to the Edge8 brand. Structured answers go
// into inquiries.metadata so the dashboard can filter/chart on them. It lives in
// company-os rather than the site because it is a CRM write (inquiries, then the
// lead promotion) and the site's door graph may not reach this entity (Q2); the
// billing checkout route takes it through the company-os index.

export type RetreatSignupInput = {
  email: string;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  role?: string | null;
  message?: string | null;
  eventId?: string | null;
  tierId?: string | null;
  aiFluency?: string | null;
  goal?: string | null;
  referralSource?: string | null;
  affiliateId?: string | null;
  /** Aio-website product cohort_slug. Stored in inquiries.metadata.cohort
   * so the retreat dashboard can filter by it. */
  cohortSlug?: string | null;
  /** Aio-website product tier ('base' / 'mac_mini' / 'white_glove'). */
  productTier?: string | null;
};

export type RetreatSignupResult =
  | { ok: true; personId: string; inquiryId: string }
  | { ok: false; error: string };

export async function recordRetreatSignup(
  input: RetreatSignupInput,
): Promise<RetreatSignupResult> {
  const person = await getOrCreatePerson({
    email: input.email,
    name: input.name,
    phone: input.phone,
    source: SOURCE_SITE,
  });
  if (!person.ok) {
    return { ok: false, error: person.error };
  }

  const source = input.eventId
    ? `edge8:${input.eventId}${input.tierId ? `:${input.tierId}` : ""}`
    : "edge8";

  // Compose a richer message body from the structured answers so the admin
  // dashboard (which reads inquiries.message) sees the full context.
  const messageParts: string[] = [];
  if (input.tierId) messageParts.push(`Tier: ${input.tierId}`);
  if (input.aiFluency) messageParts.push(`AI fluency: ${input.aiFluency}`);
  if (input.goal) messageParts.push(`Goal: ${input.goal}`);
  if (input.referralSource) messageParts.push(`Heard about us via: ${input.referralSource}`);
  if (input.message) messageParts.push(input.message);
  const composedMessage = messageParts.length > 0 ? messageParts.join("\n") : null;

  // Mirror the form data into inquiries.metadata so dashboards that filter /
  // chart off metadata see this signup the same way as aio-website signups.
  const metadata: Record<string, string> = {};
  if (input.company) metadata.company = input.company;
  if (input.cohortSlug) metadata.cohort = input.cohortSlug;
  if (input.productTier) metadata.tier = input.productTier;
  if (input.aiFluency) metadata.ai_fluency = input.aiFluency;
  if (input.goal) metadata.goal = input.goal;
  if (input.referralSource) metadata.referral_source = input.referralSource;

  const { data: inquiry, error: inquiryError } = await insertInquiries({
      person_id: person.id,
      type: "retreat",
      message: composedMessage,
      source,
      source_site: SOURCE_SITE,
      status: "new_lead",
      metadata,
    })
    .select("id")
    .single();

  if (inquiryError || !inquiry) {
    console.error("[signups] failed to insert inquiry:", inquiryError?.message);
    return { ok: false, error: "Could not save your inquiry. Please try again." };
  }

  // Inbound = speed-to-lead clock starts: promote into the SDR queue with an
  // SLA. Never fails the signup.
  const promoted = await promotePersonToLead(person.id, { reason: "inbound_inquiry" });
  if (!promoted.ok) console.error("[signups] lead promotion failed:", promoted.error);

  return { ok: true, personId: person.id, inquiryId: inquiry.id };
}
