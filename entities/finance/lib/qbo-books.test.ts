import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import { qboSharedBooks } from "./qbo-books";

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
