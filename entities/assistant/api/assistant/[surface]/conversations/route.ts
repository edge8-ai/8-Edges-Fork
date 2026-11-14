// Shared history API for both assistants. `surface` (admin|team) comes from the
// path so identity is checked with the right guard: resolveAssistantActor() uses
// the admin gate for 'admin' and getTeamActor() for 'team', and every store call
// is scoped to that actor's own auth.uid(). One user can never list another user's
// conversations, nor cross the admin/team boundary.

import { NextResponse } from "next/server";
import { resolveAssistantActor } from "@/entities/assistant/lib/history/actor";
import { listConversations } from "@/entities/assistant/lib/history/store";

// The route-segment config (runtime / dynamic / fetchCache) is declared by the
// app/ mount, not here: Next reads it by statically analysing the file under
// app/, so a value exported from this module would never be seen. Its note —
// Next 14 freezes fetch, and thus supabase-js reads, in route handlers even
// under force-dynamic — travels with it.

export async function GET(_request: Request, props: { params: Promise<{ surface: string }> }) {
  const params = await props.params;
  const actor = await resolveAssistantActor(params.surface);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const conversations = await listConversations({
    surface: actor.surface,
    authUserId: actor.authUserId,
  });
  return NextResponse.json({ conversations });
}
