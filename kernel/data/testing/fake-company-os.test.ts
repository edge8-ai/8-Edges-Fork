import { beforeEach, describe, expect, it } from "vitest";
import { answerOnlySelectedColumns, builderFor, calls, resetFake, script, scriptStorage, storageCalls, storageFor } from "./fake-company-os";

// The house fake is what every suite's assertions stand on, so its own
// behaviour is pinned here: W.127 added `or`, `not`, `ilike` and `range` for
// suites whose code reads through them, and each must chain like the others
// and record its arguments the way `eq` and `in` do, without changing an
// existing op.

beforeEach(() => resetFake());

describe("the kernel fake", () => {
  it("chains or, not, ilike and range, and records the three filters with their arguments", async () => {
    script("t", { data: [{ id: 1 }] });
    const res = await builderFor("t")
      .select("id")
      .or("send_after.is.null,send_after.lte.2026-09-23")
      .not("coach_id", "is", null)
      .ilike("email", "a@x.test")
      .range(0, 24);
    expect(res.data).toEqual([{ id: 1 }]);
    expect(calls[0].ops).toEqual(["select", "or", "not", "ilike", "range"]);
    expect(calls[0].filters).toEqual([
      ["or", "send_after.is.null,send_after.lte.2026-09-23"],
      ["not", "coach_id", "is", null],
      ["ilike", "email", "a@x.test"],
    ]);
  });

  it("records eq and in, and a write's row, exactly as before", async () => {
    script("t", { data: null });
    await builderFor("t").update({ a: 1 }).eq("id", "x").in("k", [1, 2]);
    expect(calls[0].ops).toEqual(["update", "eq", "in"]);
    expect(calls[0].filters).toEqual([["eq", "id", "x"], ["in", "k", [1, 2]]]);
    expect(calls[0].payloads).toEqual([{ a: 1 }]);
  });

  it("still throws on a query no test scripted", async () => {
    await expect(Promise.resolve(builderFor("unscripted").select("id").or("a.eq.1"))).rejects.toThrow("unscripted query against unscripted");
  });

  it("hands back every scripted column, whatever the select asked for, unless a suite opts in", async () => {
    script("t", { data: [{ id: 1, kind: "red_invoice", mime_type: "application/pdf" }] });
    expect((await builderFor("t").select("id, kind")).data).toEqual([{ id: 1, kind: "red_invoice", mime_type: "application/pdf" }]);
  });
});

// RB.2 repair: a suite that opts in is answered the way PostgREST answers, so a
// read whose select lost a column the code goes on to read fails its test.
describe("the kernel fake, answering only the selected columns", () => {
  beforeEach(() => answerOnlySelectedColumns());

  it("cuts each row, or the one row, to the selected columns", async () => {
    script("t", { data: [{ id: 1, kind: "red_invoice", mime_type: "application/pdf" }] }, { data: { id: 2, kind: "receipt", mime_type: "image/jpeg" } });
    expect((await builderFor("t").select("id, kind").eq("id", 1)).data).toEqual([{ id: 1, kind: "red_invoice" }]);
    expect((await builderFor("t").select("kind,mime_type").maybeSingle()).data).toEqual({ kind: "receipt", mime_type: "image/jpeg" });
  });

  it("keys an embed by its alias or table name, and a cast or aliased column by its key", async () => {
    const row = { id: 1, actor: { first_name: "Linh" }, reimbursement_claim_items: { claim_id: "c1" }, at: "x", amount: 5, dropped: true };
    script("t", { data: [row] });
    const res = await builderFor("t").select("id, actor:people!events_actor_fkey(first_name, last_name), reimbursement_claim_items!inner(claim_id), at:created_at::text, amount::int");
    expect(res.data).toEqual([{ id: 1, actor: { first_name: "Linh" }, reimbursement_claim_items: { claim_id: "c1" }, at: "x", amount: 5 }]);
  });

  it("leaves the row whole for *, a bare select, a form it does not read, and a write with no returning select", async () => {
    const row = { id: 1, a: 2 };
    script("t", { data: [row] }, { data: [row] }, { data: [row] }, { data: [row] });
    expect((await builderFor("t").select("*")).data).toEqual([row]);
    expect((await builderFor("t").select()).data).toEqual([row]);
    expect((await builderFor("t").select("id, a->>b")).data).toEqual([row]);
    expect((await builderFor("t").update({ a: 3 }).eq("id", 1)).data).toEqual([row]);
  });

  it("cuts what a write returns to its returning select", async () => {
    script("t", { data: [{ id: 1, a: 2 }] });
    expect((await builderFor("t").insert({ a: 2 }).select("id")).data).toEqual([{ id: 1 }]);
  });

  it("is turned off by resetFake", async () => {
    resetFake();
    script("t", { data: [{ id: 1, a: 2 }] });
    expect((await builderFor("t").select("id")).data).toEqual([{ id: 1, a: 2 }]);
  });
});

// W.128: the storage double the deliverable actions stand on.
describe("the kernel fake's storage", () => {
  it("answers each verb from its own script, and records the bucket and arguments", async () => {
    scriptStorage("createSignedUploadUrl", { data: { token: "tok", path: "task/t1/x.png" } });
    scriptStorage("info", { data: { size: 10, contentType: "image/png" } });
    const bucket = storageFor("card-attachments");
    expect(await bucket.createSignedUploadUrl("task/t1/x.png")).toEqual({ data: { token: "tok", path: "task/t1/x.png" }, error: null });
    expect(await bucket.info("task/t1/x.png")).toEqual({ data: { size: 10, contentType: "image/png" }, error: null });
    expect(storageCalls.map((c) => [c.bucket, c.op, c.args[0]])).toEqual([
      ["card-attachments", "createSignedUploadUrl", "task/t1/x.png"],
      ["card-attachments", "info", "task/t1/x.png"],
    ]);
  });

  it("passes a scripted error through, and throws on a verb nobody scripted", async () => {
    scriptStorage("remove", { error: { message: "gone" } });
    expect(await storageFor("b").remove(["p"])).toEqual({ data: null, error: { message: "gone" } });
    await expect(storageFor("b").remove(["p"])).rejects.toThrow("unscripted storage remove on b");
  });

  it("is emptied by resetFake", async () => {
    scriptStorage("info", { data: {} });
    resetFake();
    expect(storageCalls).toHaveLength(0);
    await expect(storageFor("b").info("p")).rejects.toThrow(/unscripted/);
  });
});
