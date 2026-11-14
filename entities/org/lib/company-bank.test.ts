import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The company's bank account. The sentence that matters most here: chatbot_reader
// and chatbot_writer can read audit_log, so no value of the account may reach it.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { companyBankAccount, loadBankAccounts } = await import("./company-bank");
const { saveBankAccount } = await import("./company-bank-write");

const ENTITY = "7d1f0c3e-2b4a-4c5d-8e9f-0a1b2c3d4e5f";
const ACCOUNT = "12345678";
const NEW_ACCOUNT = "87654321";
const HOLDER = "Acme Co., Ltd";
const row = { legal_entity_id: ENTITY, bank_name: "Vietcombank", bank_account_number: ACCOUNT, bank_account_holder: HOLDER, updated_at: "2026-11-05T09:45:15.123456+00:00" };
const UPDATED_AT = "2026-11-05T09:45:15.123456+00:00";
const stored = { bankName: "Vietcombank", accountNumber: ACCOUNT, holder: HOLDER, updatedAt: UPDATED_AT };
const next = { bankName: "Techcombank", accountNumber: NEW_ACCOUNT, holder: HOLDER };
const by = { actor: "owner@example.test", reason: "From the bank's letter" };

const audits = () => calls.filter((c) => c.table === "audit_log" && c.ops.includes("insert")).map((c) => c.payloads[0] as Record<string, unknown>);
const writes = () => calls.filter((c) => c.table === "legal_entities_sensitive" && (c.ops.includes("update") || c.ops.includes("insert")));

beforeEach(() => {
  resetFake();
  script("audit_log", { data: null });
});

describe("companyBankAccount", () => {
  it("answers the account of the active company that keeps its books in dong, with its bank's code", async () => {
    script("legal_entities", { data: [{ id: ENTITY }] });
    script("legal_entities_sensitive", { data: [row] });
    expect(await companyBankAccount()).toEqual({ data: { bankName: "Vietcombank", accountNumber: ACCOUNT, holder: HOLDER, bin: "970436" }, error: null });
    const company = calls.find((c) => c.table === "legal_entities");
    expect(company?.filters).toEqual(expect.arrayContaining([["eq", "base_currency", "vnd"], ["eq", "active", true]]));
    expect(calls.find((c) => c.table === "legal_entities_sensitive")?.filters).toEqual(expect.arrayContaining([["eq", "legal_entity_id", ENTITY]]));
  });

  it("answers none when no such company exists, and never reads the closed table", async () => {
    script("legal_entities", { data: [] });
    expect(await companyBankAccount()).toEqual({ data: null, error: null });
    expect(calls.some((c) => c.table === "legal_entities_sensitive")).toBe(false);
  });

  it("answers none when the company has no account on file", async () => {
    script("legal_entities", { data: [{ id: ENTITY }] });
    script("legal_entities_sensitive", { data: [] });
    expect(await companyBankAccount()).toEqual({ data: null, error: null });
  });

  it("gives a failed read back as a failure, not as none", async () => {
    script("legal_entities", { data: [{ id: ENTITY }] });
    script("legal_entities_sensitive", { error: { message: "down" } });
    const answer = await companyBankAccount();
    expect(answer.data).toBeNull();
    expect(answer.error).toEqual(expect.objectContaining({ message: "down" }));
  });

  it("has no bank code for a stored bank the list no longer holds", async () => {
    script("legal_entities", { data: [{ id: ENTITY }] });
    script("legal_entities_sensitive", { data: [{ ...row, bank_name: "Old Bank" }] });
    expect((await companyBankAccount()).data?.bin).toBeNull();
  });
});

describe("loadBankAccounts", () => {
  it("raises on a failed read, so an account that failed to load never reads as none", async () => {
    script("legal_entities_sensitive", { error: { message: "down" } });
    await expect(loadBankAccounts()).rejects.toThrow();
  });
});

describe("saveBankAccount", () => {
  it("adds the first account", async () => {
    script("legal_entities_sensitive", { data: null });
    expect(await saveBankAccount(ENTITY, null, next, by)).toEqual({ ok: true });
    expect(writes()[0].ops).toContain("insert");
    expect(writes()[0].payloads[0]).toEqual({ legal_entity_id: ENTITY, bank_name: "Techcombank", bank_account_number: NEW_ACCOUNT, bank_account_holder: HOLDER });
    expect(audits()[0]).toEqual(expect.objectContaining({ record_id: ENTITY }));
  });

  it("changes one only while it still holds what the change was checked against", async () => {
    script("legal_entities_sensitive", { data: [{ legal_entity_id: ENTITY }] });
    expect(await saveBankAccount(ENTITY, stored, next, by)).toEqual({ ok: true });
    expect(writes()[0].filters).toEqual([["eq", "legal_entity_id", ENTITY], ["eq", "updated_at", UPDATED_AT]]);
  });

  // A filter goes in the request's URL, and URLs reach request logs.
  it("puts no value of the account in a filter", async () => {
    script("legal_entities_sensitive", { data: [{ legal_entity_id: ENTITY }] });
    await saveBankAccount(ENTITY, stored, next, by);
    const filters = JSON.stringify(writes()[0].filters);
    for (const value of [ACCOUNT, NEW_ACCOUNT, HOLDER, "Vietcombank", "Techcombank"]) expect(filters).not.toContain(value);
  });

  it("tells the second person to reload, and records nothing", async () => {
    script("legal_entities_sensitive", { data: [] });
    const answer = await saveBankAccount(ENTITY, stored, next, by);
    expect(answer).toEqual({ ok: false, error: expect.stringContaining("Reload") });
    expect(audits()).toEqual([]);
  });

  it("treats a first account someone else just saved the same way", async () => {
    script("legal_entities_sensitive", { error: { message: "duplicate key", code: "23505" } as { message: string } });
    expect(await saveBankAccount(ENTITY, null, next, by)).toEqual({ ok: false, error: expect.stringContaining("Reload") });
  });

  // A database error can quote the row it refused.
  it("passes on no database message", async () => {
    script("legal_entities_sensitive", { error: { message: `value ${NEW_ACCOUNT} refused` } });
    const answer = await saveBankAccount(ENTITY, stored, next, by);
    expect(JSON.stringify(answer)).not.toContain(NEW_ACCOUNT);
  });

  // The two assistant roles that can read audit_log must learn nothing of the account from it.
  it.each([["the first account", null], ["a change", stored]])("writes no value of the account to audit_log on %s", async (_name, before) => {
    script("legal_entities_sensitive", before ? { data: [{ legal_entity_id: ENTITY }] } : { data: null });
    await saveBankAccount(ENTITY, before, next, by);
    const audit = JSON.stringify(audits());
    expect(audits()).toHaveLength(1);
    expect(audit).toContain(by.reason);
    for (const value of [ACCOUNT, NEW_ACCOUNT, HOLDER, "Vietcombank", "Techcombank"]) expect(audit).not.toContain(value);
  });
});
