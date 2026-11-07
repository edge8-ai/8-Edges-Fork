import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { recordAudit } from "@/kernel/audit/audit";
import { exchangeLarkCode, larkUserOpenId } from "@/kernel/messaging/lark-user";
import { saveLarkConnection } from "@/entities/coaching/lib/lark-connection";

// Lark's OAuth callback: checks the state cookie, swaps the code for this
// person's tokens, and stores them against the signed-in team member, never
// against anyone named in the request.
export async function GET(request: Request) {
  const actor = await requireTeamMember();
  const origin = await getSiteOrigin();
  const back = (status: string) => NextResponse.redirect(`${origin}/team/coaching?lark=${status}`);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("lark_oauth_state")?.value;
  jar.delete("lark_oauth_state");
  if (!state || !expected || state !== expected) return back("state_mismatch");
  if (!code) return back("denied");

  const tokens = await exchangeLarkCode(code, `${origin}/api/coaching-lark/callback`);
  if ("error" in tokens) {
    console.error("[coaching-lark/callback] exchange failed:", tokens.error);
    return back("error");
  }
  const openId = await larkUserOpenId(tokens.accessToken);
  if (!openId) return back("error");
  const saved = await saveLarkConnection(actor.teamMemberId, openId, tokens);
  if (!saved.ok) {
    console.error("[coaching-lark/callback] save failed:", saved.error);
    return back("error");
  }
  await recordAudit({
    table: "lark_user_connections",
    recordId: actor.teamMemberId,
    operation: "update",
    actor: actor.email,
    newData: { open_id: openId, scope: tokens.scope },
    context: { kind: "lark_connect" },
  });
  return back("connected");
}
