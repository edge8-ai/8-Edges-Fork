"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { companyOs } from "@/kernel/data/supabase";
import { selectPersonCompanies } from "@/entities/contacts";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { ASSUME_COOKIE, ASSUME_SESSION_MINUTES } from "@/kernel/identity/portal-auth";
import { insertPortalAssumeSessions } from "@/kernel/identity/writes";
import type { Result } from "@/kernel/data/result";

// Starts an Assume session: view /portal scoped to one client company, WITHOUT
// touching the admin's real Supabase session (see lib/portal-auth.ts for how
// requirePortalMember() reads this back). Pass personId to view as a specific
// active portal member with that member's real role (the point: verifying what
// a contributor/viewer actually sees); omit it for companies with no portal
// users yet, which fall back to the primary CRM contact viewed as admin. The
// cookie holds only an opaque session id — nothing forgeable, nothing to leak
// beyond a reference to a row that expires in ASSUME_SESSION_MINUTES and can
// be ended early from the /portal banner.
export async function startAssumeSession(companyId: string, personId?: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.assume");
  if (!companyId) return { ok: false, error: "Missing company." };

  let assumePersonId: string;
  if (personId) {
    // Never trust the client pairing: the person must be an active portal
    // member of THIS company, or the session (and its role lookup) would let a
    // typo view one company's portal under another person's identity.
    const { data: member, error: memberErr } = await companyOs
      .from("portal_members")
      .select("person_id")
      .eq("company_id", companyId)
      .eq("person_id", personId)
      .eq("status", "active")
      .maybeSingle();
    if (memberErr) return { ok: false, error: memberErr.message };
    if (!member) return { ok: false, error: "That person is not an active portal member of this company." };
    assumePersonId = personId;
  } else {
    const { data: link, error: linkErr } = await selectPersonCompanies("person_id")
      .eq("company_id", companyId)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (linkErr) return { ok: false, error: linkErr.message };
    if (!link) return { ok: false, error: "This company has no linked contact to view as." };
    assumePersonId = (link as { person_id: string }).person_id;
  }

  const expiresAt = new Date(Date.now() + ASSUME_SESSION_MINUTES * 60 * 1000);
  const { data: session, error } = await insertPortalAssumeSessions({
      company_id: companyId,
      person_id: assumePersonId,
      started_by: admin.email,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (error || !session) return { ok: false, error: error?.message ?? "Could not start session." };

  (await cookies()).set(ASSUME_COOKIE, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  await recordAudit({
    table: "portal_assume_sessions",
    recordId: session.id,
    operation: "insert",
    actor: admin.email,
    context: { action: "assume_start", company_id: companyId, person_id: assumePersonId },
  });

  redirect("/portal");
}
