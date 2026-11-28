import { beforeEach, describe, expect, it, vi } from "vitest";

// The three answers a person returning an advance can get. None on file and a
// failed read send them to different places, and neither may look like an account.
const door = vi.hoisted(() => ({ answer: { data: null, error: null } as { data: unknown; error: { message: string } | null } }));
vi.mock("@/entities/org", () => ({ companyBankAccount: async () => door.answer }));
vi.mock("./vietqr", async (importActual) => ({ ...(await importActual<typeof import("./vietqr")>()), vietQrSvg: async (p: string) => `<svg>${p}</svg>` }));

import { readReturnAccount } from "./return-account";

const ACCOUNT = "12345678";
const transfer = { amountVnd: 2_500_000, reference: "AD-0012 HOAN UNG" };
const account = { bankName: "Vietcombank", accountNumber: ACCOUNT, holder: "Acme Co., Ltd", bin: "970436" };

beforeEach(() => {
  door.answer = { data: null, error: null };
});

describe("readReturnAccount", () => {
  it("gives the account and a code with this transfer's amount and reference", async () => {
    door.answer = { data: account, error: null };
    const answer = await readReturnAccount(transfer);
    expect(answer).toMatchObject({ state: "ready", bankName: "Vietcombank", accountNumber: ACCOUNT, holder: "Acme Co., Ltd" });
    const qr = answer.state === "ready" ? answer.qrSvg : "";
    expect(qr).toContain("540725000005802VN");
    expect(qr).toContain("AD-0012 HOAN UNG");
    expect(qr).toContain(ACCOUNT);
  });

  it("says none is on file when none is, and not that it failed", async () => {
    expect(await readReturnAccount(transfer)).toEqual({ state: "none" });
  });

  it("says a failed read failed, and not that none is on file", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    door.answer = { data: null, error: { message: "down" } };
    expect(await readReturnAccount(transfer)).toEqual({ state: "unavailable" });
    quiet.mockRestore();
  });

  it("still gives the account, with no code, for a bank with no code", async () => {
    door.answer = { data: { ...account, bin: null }, error: null };
    expect(await readReturnAccount(transfer)).toMatchObject({ state: "ready", accountNumber: ACCOUNT, qrSvg: null });
  });

  it("still gives the account, with no code, when the transfer could not be carried", async () => {
    door.answer = { data: account, error: null };
    expect(await readReturnAccount({ ...transfer, reference: "HOÀN ỨNG" })).toMatchObject({ state: "ready", qrSvg: null });
  });
});
