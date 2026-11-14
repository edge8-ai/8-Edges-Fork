// A connector's token must never pass as the app's own sign-in (MCP.1): every
// cookie guard asks firstPartyUser, which reads the session once and validates
// exactly the token it inspected.
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { firstPartyUser, oauthClientOf } from "./oauth-client-token";

const jwt = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

/** A session client whose cookie holds `accessToken`, and whose GoTrue knows `usersByToken`. */
function clientWith(accessToken: unknown, usersByToken: Record<string, unknown>) {
  const getUser = vi.fn(async (token?: string) => ({ data: { user: (token && usersByToken[token]) ?? null } }));
  const client = {
    auth: { getUser, getSession: async () => ({ data: { session: accessToken === undefined ? null : { access_token: accessToken } } }) },
  } as unknown as SupabaseClient;
  return { client, getUser };
}

describe("oauthClientOf", () => {
  it("reads the client_id claim, and nothing from a token without one", () => {
    expect(oauthClientOf(jwt({ sub: "u", client_id: "c1" }))).toBe("c1");
    expect(oauthClientOf(jwt({ sub: "u" }))).toBeNull();
    expect(oauthClientOf(jwt({ sub: "u", client_id: "" }))).toBeNull();
    expect(oauthClientOf("not-a-jwt")).toBeNull();
    expect(oauthClientOf(null)).toBeNull();
  });
});

describe("firstPartyUser", () => {
  const ana = { id: "u1", email: "ana@example.test" };
  const own = jwt({ sub: "u1" });
  const connector = jwt({ sub: "u1", client_id: "client-claude" });

  it("is the user for an ordinary sign-in, validated with the very token the session holds", async () => {
    const { client, getUser } = clientWith(own, { [own]: ana });
    expect(await firstPartyUser(client)).toBe(ana);
    expect(getUser).toHaveBeenCalledWith(own);
  });

  it("is nobody when the session holds an OAuth client's token, and never asks GoTrue", async () => {
    const { client, getUser } = clientWith(connector, { [connector]: ana });
    expect(await firstPartyUser(client)).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("is nobody with no session, an unreadable token or a token that is not a string", async () => {
    expect(await firstPartyUser(clientWith(undefined, {}).client)).toBeNull();
    expect(await firstPartyUser(clientWith("garbage", { garbage: ana }).client)).toBeNull();
    expect(await firstPartyUser(clientWith(42, {}).client)).toBeNull();
  });

  it("is nobody when GoTrue rejects the session's token", async () => {
    expect(await firstPartyUser(clientWith(own, {}).client)).toBeNull();
  });
});
