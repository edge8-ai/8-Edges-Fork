import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAccess } from "@/kernel/identity/access-request";
import { buildQboAuthUrl, qboConfigured } from "@/entities/company-os/lib/qbo";
import { getSiteOrigin } from "@/kernel/config/site-origin";

// Starts the QuickBooks OAuth flow (admin-only). The random state lands in an
// httpOnly cookie and is verified by /api/qbo/callback — standard CSRF guard.
// ?entity=edge8|aio picks which company this connection is for; it rides
// through the round-trip in a cookie (Intuit only echoes `state`).
export async function GET(request: Request) {
  // Its own atom (AE.3): entering the Admin view is not enough to connect
  // the books, so an Accountant holding surface.admin is sent away.
  const access = await getAccess();
  if (!access) return NextResponse.redirect(`${await getSiteOrigin()}/admin/login`);
  if (!access.may("company-os.quickbooks")) return NextResponse.redirect(`${await getSiteOrigin()}/admin/refused?p=company-os.quickbooks`);
  const admin = access.user;
  if (!qboConfigured()) {
    return NextResponse.redirect(`${await getSiteOrigin()}/admin/settings/quickbooks?status=unconfigured`);
  }

  const entity = new URL(request.url).searchParams.get("entity") === "aio" ? "aio" : "edge8";

  const state = crypto.randomUUID();
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 10 * 60 };
  (await cookies()).set("qbo_oauth_state", state, cookieOpts);
  (await cookies()).set("qbo_oauth_entity", entity, cookieOpts);
  return NextResponse.redirect(buildQboAuthUrl(state));
}
