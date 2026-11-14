// Server-only. Who an MCP client is acting for (MCP.1).
//
// An MCP client (Claude, ChatGPT, Grok) signs a person in through Supabase
// Auth's OAuth 2.1 server and then calls /api/mcp with the access token in an
// Authorization header; it carries no session cookie. This resolves that token
// to the same team actor and access a sign-in of theirs builds, so every tool
// is judged by the rules the person's own pages are judged by. GoTrue verifies
// the token on every call, as getSessionUser does for a cookie, so a revoked
// grant or a signed-out user stops working on the next request.
//
// Only a token issued to an OAuth client (one carrying `client_id`) is
// accepted: a browser session's token is the app's own sign-in, and the cookie
// guards refuse a client's token in turn (./oauth-client-token.ts), so neither
// kind of sign-in can stand in for the other.
import { supabase } from "@/kernel/data/supabase";
import type { Access } from "./access-model";
import { accessForTeamActor } from "./access-request";
import { oauthClientOf } from "./oauth-client-token";
import { teamActorForAuthUser, type TeamActor } from "./team-auth";
import { passwordGate } from "./temporary-password";

export type BearerTeamCaller = { actor: TeamActor; access: Access; clientId: string };

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * The team member an `Authorization: Bearer` header names, with what they may
 * do and the OAuth client acting for them; null when there is no token, GoTrue
 * rejects it, it was not issued to an OAuth client, its user is still on a
 * temporary password (the proxy's gate, which does not run on /api), or its
 * user has no active team record. A failure on GoTrue's side (5xx, the network) is thrown,
 * not answered as null: a null sends the client back through sign-in, which
 * would not help and would look like the person had been signed out.
 */
export async function teamCallerFromBearer(header: string | null): Promise<BearerTeamCaller | null> {
  const token = BEARER.exec(header ?? "")?.[1];
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    if (typeof error.status === "number" && error.status < 500) return null;
    throw error;
  }
  const email = data.user?.email;
  if (!data.user || !email) return null;
  const clientId = oauthClientOf(token);
  if (!clientId) return null;
  if (passwordGate(data.user, "/team")) return null;
  const actor = await teamActorForAuthUser({ id: data.user.id, email });
  if (!actor) return null;
  return { actor, access: await accessForTeamActor(actor), clientId };
}
