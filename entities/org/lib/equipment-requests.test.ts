import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// fileOwnEquipmentRequest carries the rule team's funnel applied until A.88.6
// (teamInsertOwn): a request is always filed for the actor's own person id. A
// row that names someone else is overwritten, never trusted.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { fileOwnEquipmentRequest } = await import("./equipment-requests");

beforeEach(() => resetFake());

describe("fileOwnEquipmentRequest", () => {
  it("files the request for the actor's own person id, whatever the row says", async () => {
    script("equipment_requests", { data: { id: "req-1" } });
    const row = { person_id: "someone-else", type: "laptop", reason: "Mine broke", needed_by: null };
    await expect(fileOwnEquipmentRequest({ personId: "me" }, row as never)).resolves.toEqual({ data: { id: "req-1" }, error: null });
    const insert = calls.find((c) => c.table === "equipment_requests" && c.ops.includes("insert"));
    expect(insert?.payloads[0]).toMatchObject({ person_id: "me", type: "laptop" });
  });

  it("answers a refused insert as a sentence", async () => {
    script("equipment_requests", { data: null, error: { message: "row level security" } });
    await expect(fileOwnEquipmentRequest({ personId: "me" }, { type: "laptop", reason: "x" } as never)).resolves.toEqual({ data: null, error: "row level security" });
  });
});
