// Load / rename / delete a single conversation. Same guard + owner-scoping as the
// list route: loading another user's id (or crossing the admin/team boundary) 404s
// because the store filters on (surface, owner_auth_user_id). Deletion is a soft
// archive (PATCH { archived: true }), never a hard delete.

import { NextResponse } from "next/server";
import { resolveAssistantActor } from "@/entities/assistant/lib/history/actor";
import {
  getConversation,
  renameConversation,
  archiveConversation,
} from "@/entities/assistant/lib/history/store";

// Route-segment config is declared by the app/ mount, not here: Next reads it by
// statically analysing the file under app/ and would not see it through a
// re-export.

const MAX_TITLE_LEN = 200;

export async function GET(
  _request: Request,
  props: { params: Promise<{ surface: string; id: string }> }
) {
  const params = await props.params;
  const actor = await resolveAssistantActor(params.surface);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const conversation = await getConversation({
    id: params.id,
    surface: actor.surface,
    authUserId: actor.authUserId,
  });
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ surface: string; id: string }> }
) {
  const params = await props.params;
  const actor = await resolveAssistantActor(params.surface);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: unknown; archived?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.archived === true) {
    await archiveConversation({
      id: params.id,
      surface: actor.surface,
      authUserId: actor.authUserId,
    });
    return NextResponse.json({ ok: true });
  }

  if (typeof body.title === "string") {
    const title = body.title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LEN);
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    await renameConversation({
      id: params.id,
      surface: actor.surface,
      authUserId: actor.authUserId,
      title,
    });
    return NextResponse.json({ ok: true, title });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
