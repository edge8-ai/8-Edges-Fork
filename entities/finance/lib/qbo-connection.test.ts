import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import { qboConnection, rotateQboTokens, saveQboConnection } from "./qbo-connection";

// A.65: the queries company-os's QuickBooks client built by hand around
// selectQboConnection / upsertQboConnection / updateQboConnection before the
// card. The rotation's second filter, on the refresh token used, is what keeps
// two lambdas from clobbering each other's tokens, so it is pinned here.
const q = (...steps: Query["steps"]): Query => ({ table: "qbo_connection", steps });
const tokens = {
  access_token: "at",
  refresh_token: "rt-new",
  access_token_expires_at: "2026-10-18T04:00:00.000Z",
  refresh_token_expires_at: "2027-01-26T03:00:00.000Z",
  updated_at: "2026-10-18T03:00:00.000Z",
};
const connection = { id: "edge8", realm_id: "realm-1", environment: "production", connected_by: "ops@example.test", ...tokens };

const cases: [string, () => Promise<unknown>, Query][] = [
  ["qboConnection", () => qboConnection("edge8"), q(["select", "*"], ["eq", "id", "edge8"], ["maybeSingle"])],
  ["saveQboConnection", () => saveQboConnection(connection), q(["upsert", connection])],
  [
    "rotateQboTokens",
    () => rotateQboTokens("edge8", "rt-old", tokens),
    q(["update", tokens], ["eq", "id", "edge8"], ["eq", "refresh_token", "rt-old"], ["select", "id"]),
  ],
];

beforeEach(() => resetQueries());

describe("finance's QuickBooks-connection questions and commands make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });

  it("answers a failed save as a Result carrying the database's message", async () => {
    answerNext({ data: null, error: { message: "write refused" } });
    expect(await saveQboConnection(connection)).toEqual({ ok: false, error: "write refused" });
  });
});
