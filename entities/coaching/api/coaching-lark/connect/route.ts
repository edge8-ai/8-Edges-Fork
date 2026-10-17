import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { larkAuthorizeUrl, larkUserConfigured } from "@/kernel/messaging/lark-user";

// Starts the Lark sign-in that lets the daily pickup read this coach's own 1-1
// recordings. The random state lands in an httpOnly cookie and the callback
// checks it, the standard CSRF guard (same shape as /api/qbo/connect).
export async function GET() {
  await requireTeamMember();
  const origin = await getSiteOrigin();
  if (!larkUserConfigured()) return NextResponse.redirect(`${origin}/team/coaching?lark=unconfigured`);
  const state = crypto.randomUUID();
  (await cookies()).set("lark_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 60 });
  return NextResponse.redirect(larkAuthorizeUrl(state, `${origin}/api/coaching-lark/callback`));
}
