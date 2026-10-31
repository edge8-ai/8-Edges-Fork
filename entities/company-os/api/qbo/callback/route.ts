import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAccess } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { exchangeQboCode } from "@/entities/company-os/lib/qbo";
import { getSiteOrigin } from "@/kernel/config/site-origin";

// Intuit OAuth callback: verifies the state cookie, exchanges the code for
// tokens, and stores the connection (company_os.qbo_connection). Admin-only —
// the admin who clicked Connect is still signed in here.
export async function GET(request: Request) {
  const origin = await getSiteOrigin();
  const settingsUrl = (status: string) =>
    NextResponse.redirect(`${origin}/admin/settings/quickbooks?status=${status}`);

  // Its own atom (AE.3): entering the Admin view is not enough to connect
  // the books, so an Accountant holding surface.admin is sent away.
  const access = await getAccess();
  if (!access) return NextResponse.redirect(`${await getSiteOrigin()}/admin/login`);
  if (!access.may("company-os.quickbooks")) return NextResponse.redirect(`${await getSiteOrigin()}/admin/refused?p=company-os.quickbooks`);
  const admin = access.user;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");

  const cookieState = (await cookies()).get("qbo_oauth_state")?.value;
  const entity = (await cookies()).get("qbo_oauth_entity")?.value === "aio" ? "aio" : "edge8";
  (await cookies()).delete("qbo_oauth_state");
  (await cookies()).delete("qbo_oauth_entity");
  if (!state || !cookieState || state !== cookieState) return settingsUrl("state_mismatch");
  if (!code || !realmId) return settingsUrl("missing_code");

  const result = await exchangeQboCode(code, realmId, admin.email, entity);
  if (!result.ok) {
    console.error("[qbo/callback] exchange failed:", result.error);
    return settingsUrl("error");
  }

  await recordAudit({
    table: "qbo_connection",
    // qbo_connection is keyed by the entity's text name, not a uuid, so the
    // name goes in the context and the row names no record id (B.13).
    recordId: null,
    operation: "update",
    actor: admin.email,
    newData: { realm_id: realmId },
    context: { kind: "qbo_connect", entity },
  });
  return settingsUrl("connected");
}
