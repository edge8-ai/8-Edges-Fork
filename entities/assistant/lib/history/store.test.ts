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

import { archiveConversation, findToolCall, renameConversation } from "./store";

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

// QS.9: a drafted Bounty's link carries only the id of the draft_bounty call,
// read back here from the reader's own conversations. Another person's id, or
// some other tool's call, finds nothing.
describe("findToolCall", () => {
  const CALL = "toolu_01AbCdEfGhIjKlMnOpQr";
  const own = { surface: "team" as const, authUserId: "auth-1", callId: CALL, tool: "draft_bounty" };
  const row = (name: string) => ({
    messages: [
      { role: "user", content: "give everyone a quest" },
      { role: "assistant", content: [{ type: "tool_use", id: CALL, name, input: { title: "Watch the launch" } }] },
    ],
  });

  it("reads the call's input from the caller's own conversations, scoped on surface and owner", async () => {
    script(TABLE, { data: [row("draft_bounty")] });
    expect(await findToolCall(own)).toEqual({ title: "Watch the launch" });
    const read = calls.find((c) => c.table === TABLE)!;
    expect(read.filters).toContainEqual(["eq", "surface", "team"]);
    expect(read.filters).toContainEqual(["eq", "owner_auth_user_id", "auth-1"]);
    expect(read.filters).toContainEqual(["filter", "messages", "cs", JSON.stringify([{ role: "assistant", content: [{ type: "tool_use", id: CALL }] }])]);
  });

  it("finds nothing for an id no conversation of the caller's holds, so another person's draft opens nothing", async () => {
    script(TABLE, { data: [] });
    expect(await findToolCall(own)).toBeNull();
  });

  it("finds nothing when the id is some other tool's call, or the read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    script(TABLE, { data: [row("my_quests")] }, { data: null, error: { message: "boom" } });
    expect(await findToolCall(own)).toBeNull();
    expect(await findToolCall(own)).toBeNull();
  });
});
