import { companyOs } from "@/kernel/data/supabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// renameConversation and archiveConversation are owner-scoped updates whose
// boolean is what the UI shows the user. Before AR-xx they returned true
// whenever the statement itself did not error, so an update that matched no row
// (a wrong id, another user's conversation, an already-archived one) read as
// success. These tests pin the current contract: true only when a row changed.
//
// The fake Supabase client is the kernel's house fake
// (kernel/data/testing/fake-company-os.ts): `companyOs.from(table)` returns a
// chainable builder resolving to the next scripted response for that table,
// and throws on a query no test scripted.

// Every query here is on assistant_conversations.
const TABLE = "assistant_conversations";

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));

import { archiveConversation, renameConversation } from "./store";

const scope = { id: "c1", surface: "admin" as const, authUserId: "auth-1" };

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

describe("renameConversation", () => {
  it("is true when the update changed a row", async () => {
    script(TABLE, { data: [{ id: "c1" }] });
    expect(await renameConversation({ ...scope, title: "New" })).toBe(true);
  });

  it("is false when the owner scope matched nothing", async () => {
    script(TABLE, { data: [] });
    expect(await renameConversation({ ...scope, title: "New" })).toBe(false);
  });

  it("is false on a database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    script(TABLE, { error: { message: "boom" } });
    expect(await renameConversation({ ...scope, title: "New" })).toBe(false);
  });

  it("asks for the changed ids back so a no-op is visible", async () => {
    script(TABLE, { data: [{ id: "c1" }] });
    await renameConversation({ ...scope, title: "New" });
    expect(calls[0].ops).toContain("select");
  });
});

describe("archiveConversation", () => {
  it("is true when the update changed a row", async () => {
    script(TABLE, { data: [{ id: "c1" }] });
    expect(await archiveConversation(scope)).toBe(true);
  });

  it("is false when the conversation was already archived or not the caller's", async () => {
    script(TABLE, { data: [] });
    expect(await archiveConversation(scope)).toBe(false);
  });

  it("is false on a database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    script(TABLE, { error: { message: "boom" } });
    expect(await archiveConversation(scope)).toBe(false);
  });
});
