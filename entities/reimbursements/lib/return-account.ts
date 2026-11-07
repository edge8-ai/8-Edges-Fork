// Where a person returns what an advance owes (AD.13): the company's account
// from org's door, with a QR code when one can be drawn. Three states, because
// "none on file" and "could not read it" send a person to different places, and
// neither may look like an account.
import { companyBankAccount } from "@/entities/org";
import { vietQrPayload, vietQrSvg } from "./vietqr";

export type ReturnAccount =
  | { state: "ready"; bankName: string; accountNumber: string; holder: string; qrSvg: string | null }
  | { state: "none" }
  | { state: "unavailable" };

export async function readReturnAccount(transfer: { amountVnd: number; reference: string }): Promise<ReturnAccount> {
  const { data: account, error } = await companyBankAccount();
  if (error) {
    console.error("[reimbursements] the company's bank account", error.message);
    return { state: "unavailable" };
  }
  if (!account) return { state: "none" };
  const payload = account.bin ? vietQrPayload({ bin: account.bin, account: account.accountNumber, ...transfer }) : null;
  return { state: "ready", bankName: account.bankName, accountNumber: account.accountNumber, holder: account.holder, qrSvg: payload ? await vietQrSvg(payload) : null };
}
