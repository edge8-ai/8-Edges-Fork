import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import { qboBooksHeldBy, qboSharedBooks } from "./qbo-books";

// On 2026-10-07 the AIO connection was saved with Edge8's QuickBooks company
// and the invoice sync mirrored every Edge8 invoice a second time as AIO. This
// is the question the sync now asks before it writes a row.
const conn = (realm: string) => ({ data: { realm_id: realm }, error: null });

beforeEach(() => resetQueries());

describe("qboSharedBooks", () => {
  it("names Edge8 when AIO is linked to Edge8's books", async () => {
    answerNext(conn("realm-edge8"), conn("realm-edge8"));
    await expect(qboSharedBooks("aio")).resolves.toEqual({ ok: true, sharedWith: "edge8" });
  });

  it("names nobody when AIO has its own books", async () => {
    answerNext(conn("realm-aio"), conn("realm-edge8"));
    await expect(qboSharedBooks("aio")).resolves.toEqual({ ok: true, sharedWith: null });
  });

  it("names nobody when AIO is not connected", async () => {
    answerNext({ data: null, error: null }, conn("realm-edge8"));
    await expect(qboSharedBooks("aio")).resolves.toEqual({ ok: true, sharedWith: null });
  });

  it("never asks about Edge8, the original connection", async () => {
    await expect(qboSharedBooks("edge8")).resolves.toEqual({ ok: true, sharedWith: null });
    expect(queries).toEqual([]);
  });

  it("is a failure, not a pass, when a connection cannot be read", async () => {
    answerNext({ data: null, error: { message: "boom" } }, conn("realm-edge8"));
    await expect(qboSharedBooks("aio")).resolves.toEqual({ ok: false, error: "aio connection read failed: boom" });
  });
});

// The callback asks this before it saves a connection, so a reconnect that
// lands on another company's books is refused instead of found at the next sync.
describe("qboBooksHeldBy", () => {
  it("names the other company already linked to the books", async () => {
    answerNext({ data: [{ id: "edge8" }], error: null });
    await expect(qboBooksHeldBy("aio", "realm-edge8")).resolves.toEqual({ ok: true, heldBy: "edge8" });
    expect(queries).toEqual([
      { table: "qbo_connection", steps: [["select", "id"], ["eq", "realm_id", "realm-edge8"], ["neq", "id", "aio"]] },
    ]);
  });

  it("names nobody when no other company holds the books", async () => {
    answerNext({ data: [], error: null });
    await expect(qboBooksHeldBy("aio", "realm-aio")).resolves.toEqual({ ok: true, heldBy: null });
  });

  it("is a failure, not a pass, when the read fails", async () => {
    answerNext({ data: null, error: { message: "boom" } });
    await expect(qboBooksHeldBy("aio", "realm-aio")).resolves.toEqual({ ok: false, error: "connection read failed: boom" });
  });
});
