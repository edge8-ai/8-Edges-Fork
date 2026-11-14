// The portal's general requests: a client's ask that is not a contractor work
// request lands in the CRM inquiries pipeline, like the public contact form. It
// stayed here when the work-request flow became its own entity (ADR 0025): the
// inquiry is crm's record and the page that files it is the portal's.
import type { PortalActor } from "@/kernel/identity/portal-auth";
import type { Result } from "@/kernel/data/result";
import { portalInquiriesOf, recordInquiry } from "@/entities/crm";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyOps } from "@/kernel/messaging/lark";
import { SOURCE_SITE } from "@/kernel/config/utils";

// A general ask lands in the CRM inquiries pipeline like the public contact
// form — but the person already exists (the actor) and they're already a
// customer, so no getOrCreatePerson and no lead promotion.
export async function createPortalInquiryForActor(
  actor: PortalActor,
  input: { subject: string; message: string },
): Promise<Result> {
  const subject = input.subject?.trim();
  const message = input.message?.trim();
  if (!subject) return { ok: false, error: "Add a short subject." };
  if (!message) return { ok: false, error: "Describe what you need." };

  const { error } = await recordInquiry({
    person_id: actor.personId,
    type: "consultation",
    subject,
    message,
    source: "portal",
    source_site: SOURCE_SITE,
    status: "new_lead",
    metadata: {
      origin: "portal",
      company_id: actor.companyScope[0] ?? null,
      name: actor.displayName,
      email: actor.email,
      ...(actor.impersonation ? { assumed_by: actor.impersonation.adminEmail } : {}),
    },
  });
  if (error) return { ok: false, error: "Couldn't send your request. Please try again." };

  const companyName = actor.memberships[0]?.companyName ?? "client";
  await notifyOps(
    `🧑‍💼 Portal general request from ${actor.displayName} (${companyName}): "${subject}". Review: ${await getSiteOrigin()}/admin/revenue/inquiries`,
    { category: "client" },
  );
  return { ok: true };
}

export async function listPortalInquiriesForActor(
  actor: PortalActor,
): Promise<Array<{ id: string; subject: string | null; status: string; createdAt: string }>> {
  const { data, error: inquiriesError } = await portalInquiriesOf(actor.personId, 5);
  if (inquiriesError) console.error("[portal] inquiries read failed:", inquiriesError.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    subject: r.subject,
    status: r.status,
    createdAt: r.created_at,
  }));
}
