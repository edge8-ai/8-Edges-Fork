import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script, type Call } from "@/kernel/data/testing/fake-company-os";

// The board may notice, but only the owner of a promise may answer for it
// (2026-09-18). This handler used to write `status: "completed"` the moment a
// linked card reached a done column, which made the work tracker the author of
// somebody's growth record. It now writes a dated suggestion and nothing else.
//
// These tests pin the two halves that matter: the status is never touched, and
// a commitment that is already closed — or already carrying an unanswered
// suggestion — is left alone, so dismissing the question keeps it dismissed.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("@/entities/boards", () => ({ SUBJECT_COMMITMENT: "coaching_commitment" }));
vi.mock("@/kernel/events", () => ({ subscribe: () => undefined }));

import { suggestCommitmentKept } from "./board-subscriptions";

const payload = {
  taskId: "task-1",
  boardSlug: "revenue",
  subjectType: "coaching_commitment",
  subjectId: "commit-1",
};

// Every column filter the one update carried, as flat [column, value] pairs.
function filtersOf(call: Call): string[][] {
  return call.filters.filter((f) => f.length === 3).map((f) => [String(f[1]), String(f[2])]);
}

/** The one write: the suggestion stamp on the commitment. */
const scriptUpdate = (error: { message: string } | null = null) => script("coaching_commitments", { error });

beforeEach(() => resetFake());

describe("suggestCommitmentKept", () => {
  it("writes the suggestion and never the status", async () => {
    scriptUpdate();
    await suggestCommitmentKept(payload);

    const update = calls.find((c) => c.ops.includes("update"));
    expect(update).toBeDefined();
    const body = update!.payloads[0] as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["card_done_at"]);
    // The two words this change exists to keep out of a board-driven write.
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("closed_at");
  });

  it("leaves a commitment its owner has already closed alone", async () => {
    scriptUpdate();
    await suggestCommitmentKept(payload);
    const update = calls.find((c) => c.ops.includes("update"))!;
    const filters = filtersOf(update);
    expect(filters).toContainEqual(["status", "completed"]);
    expect(filters).toContainEqual(["status", "dropped"]);
    expect(update.ops.filter((o) => o === "neq")).toHaveLength(2);
  });

  it("does not re-ask a question that was dismissed", async () => {
    // Dismissing clears the stamp back to null, so re-stamping a row that is
    // already stamped is the only way the prompt could come back uninvited —
    // the `is(card_done_at, null)` filter is what stops that.
    scriptUpdate();
    await suggestCommitmentKept(payload);
    const update = calls.find((c) => c.ops.includes("update"))!;
    expect(update.filters.find((f) => f[0] === "is")).toEqual(["is", "card_done_at", null]);
  });

  it("ignores a card that is not a commitment", async () => {
    await suggestCommitmentKept({ ...payload, subjectType: "backlog_item" });
    expect(calls).toHaveLength(0);
  });

  it("ignores a commitment card with no subject id", async () => {
    await suggestCommitmentKept({ ...payload, subjectId: null });
    expect(calls).toHaveLength(0);
  });

  it("throws rather than losing the one prompt the member gets", async () => {
    scriptUpdate({ message: "connection reset" });
    await expect(suggestCommitmentKept(payload)).rejects.toThrow(/commit-1/);
  });
});
