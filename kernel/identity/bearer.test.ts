// The bearer check behind /api/mcp (MCP.1): a token is judged by GoTrue, its
// user becomes the same team actor a sign-in builds, and only a GoTrue outage
// is an error rather than "not signed in".
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, teamActorForAuthUser, accessForTeamActor } = vi.hoisted(() => ({
  getUser: vi.fn(),
  teamActorForAuthUser: vi.fn(),
  accessForTeamActor: vi.fn(),
}));

vi.mock("@/kernel/data/supabase", () => ({ supabase: { auth: { getUser } } }));
vi.mock("./team-auth", () => ({ teamActorForAuthUser }));
vi.mock("./access-request", () => ({ accessForTeamActor }));

// A JWT whose payload carries these claims; only the payload is ever read here.
const jwt = (claims: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const CLIENT_TOKEN = jwt({ sub: "u1", client_id: "client-claude" });

const { teamCallerFromBearer } = await import("./bearer");

beforeEach(() => vi.clearAllMocks());

describe("teamCallerFromBearer", () => {
  it("is null without a bearer token, and never asks GoTrue", async () => {
    expect(await teamCallerFromBearer(null)).toBeNull();
    expect(await teamCallerFromBearer("Basic abc")).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("is null when GoTrue rejects the token", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, message: "invalid JWT" } });
    expect(await teamCallerFromBearer("Bearer bad")).toBeNull();
  });

  it("throws when GoTrue itself fails, so the client is not sent to sign in again", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 503, message: "unavailable" } });
    await expect(teamCallerFromBearer("Bearer t")).rejects.toMatchObject({ status: 503 });
  });

  it("refuses a browser session's token: only a token issued to an OAuth client is a connector", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "ana@example.test" } }, error: null });
    expect(await teamCallerFromBearer(`Bearer ${jwt({ sub: "u1" })}`)).toBeNull();
    expect(teamActorForAuthUser).not.toHaveBeenCalled();
  });

  it("refuses an account still on a temporary password, as the proxy would", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "ana@example.test", app_metadata: { must_change_password: true } } },
      error: null,
    });
    expect(await teamCallerFromBearer(`Bearer ${CLIENT_TOKEN}`)).toBeNull();
    expect(teamActorForAuthUser).not.toHaveBeenCalled();
  });

  it("is null for a valid user with no active team record", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "Client@Example.test" } }, error: null });
    teamActorForAuthUser.mockResolvedValue(null);
    expect(await teamCallerFromBearer(`Bearer ${CLIENT_TOKEN}`)).toBeNull();
    expect(teamActorForAuthUser).toHaveBeenCalledWith({ id: "u1", email: "Client@Example.test" });
    expect(accessForTeamActor).not.toHaveBeenCalled();
  });

  it("builds the token user's own actor and access", async () => {
    const actor = { personId: "p1", teamMemberId: "tm1" };
    const access = { may: () => true };
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "ana@example.test" } }, error: null });
    teamActorForAuthUser.mockResolvedValue(actor);
    accessForTeamActor.mockResolvedValue(access);
    expect(await teamCallerFromBearer(`Bearer ${CLIENT_TOKEN}`)).toEqual({ actor, access, clientId: "client-claude" });
    expect(getUser).toHaveBeenCalledWith(CLIENT_TOKEN);
    expect(accessForTeamActor).toHaveBeenCalledWith(actor);
  });
});
