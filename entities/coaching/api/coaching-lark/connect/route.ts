import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { LARK_CALENDAR_SCOPE, larkAuthorizeUrl, larkUserConfigured } from "@/kernel/messaging/lark-user";

// Starts the Lark sign-in that lets the daily pickup read this coach's own 1-1
// recordings. The random state lands in an httpOnly cookie and the callback
// checks it, the standard CSRF guard (same shape as /api/qbo/connect).
// ?calendar=1 also asks for calendar read, which the daily discovery-call check
// needs from whoever takes those calls; nobody else is asked for it.
export async function GET(request: Request) {
  await requireTeamMember();
  const origin = await getSiteOrigin();
  if (!larkUserConfigured()) return NextResponse.redirect(`${origin}/team/coaching?lark=unconfigured`);
  const state = crypto.randomUUID();
  (await cookies()).set("lark_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 60 });
  const extraScopes = new URL(request.url).searchParams.get("calendar") === "1" ? [LARK_CALENDAR_SCOPE] : [];
  return NextResponse.redirect(larkAuthorizeUrl(state, `${origin}/api/coaching-lark/callback`, extraScopes));
}
