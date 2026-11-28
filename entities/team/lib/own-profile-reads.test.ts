import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { ReadFailure } from "@/kernel/data/read";
import type { TeamActor } from "@/kernel/identity/team-auth";

// The profile page reads the person's own rows, fills an editor from them, and
// the editor's save writes every field back. A read that failed and answered
// "nothing" therefore became a save that erased data: twelve sensitive fields
// written as null, or people.metadata replaced by the few keys the form sends.
// These pin that a failed read stops the chain before anything is written.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  companyOsUntyped: {},
}));

const { getOwnSensitive, updateOwnBasics } = await import("./data");

const actor = { personId: "p-1", teamMemberId: "tm-1" } as TeamActor;
const writes = (table: string) => calls.filter((c) => c.table === table && c.ops.some((o) => o === "update" || o === "insert" || o === "upsert"));

describe("own profile reads before a save", () => {
  beforeEach(() => resetFake());

  it("raises when the sensitive record cannot be read, instead of answering none", async () => {
    script("people_sensitive", { error: { message: "connection reset" } });
    await expect(getOwnSensitive(actor)).rejects.toBeInstanceOf(ReadFailure);
  });

  it("still answers null when the person has no sensitive record yet", async () => {
    script("people_sensitive", { data: null, error: null });
    await expect(getOwnSensitive(actor)).resolves.toBeNull();
  });

  it("refuses the save and writes nothing when the current metadata cannot be read", async () => {
    script("people", { error: { message: "connection reset" } });
    const res = await updateOwnBasics(actor, { phone: "0900" }, { hometown: "Huế" });
    expect(res.ok).toBe(false);
    expect(writes("people")).toHaveLength(0);
  });

  it("keeps the metadata keys the form does not send", async () => {
    script("people", { data: { metadata: { lark_open_id: "ou_1", hometown: "Đà Nẵng" } } }, { error: null });
    const res = await updateOwnBasics(actor, {}, { hometown: "Huế" });
    expect(res.ok).toBe(true);
    const patch = writes("people")[0].payloads[0] as { metadata: Record<string, unknown> };
    expect(patch.metadata).toEqual({ lark_open_id: "ou_1", hometown: "Huế" });
  });
});
