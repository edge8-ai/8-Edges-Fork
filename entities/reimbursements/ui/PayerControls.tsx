// The payer's controls on a payment run (RB.7), composed once for the Team
// Finance page and its Admin mirror: for each person still to pay, record
// the payment with its receipt or return it; for one paid, open the bank's
// receipt; and above the list, "Mark selected paid" for several people in
// turn. The actions are the page's, handed in, because nothing under ui/ may
// import a route.
import type { ReactNode } from "react";
import type { RunDetail, RunPayment } from "../lib/run-view";
import { MarkSelectedPaid } from "./MarkSelectedPaid";
import { OpenDocument } from "./OpenDocument";
import { RecordPayment, type PayerActions } from "./RecordPayment";

export type PayerControlActions = PayerActions & {
  openReceipt: (paymentId: string, fileId: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
};

const payable = (p: RunPayment) => ({ id: p.id, personName: p.personName, amountVnd: p.amountVnd });

export function payerControls(run: RunDetail, actions: PayerControlActions): { controls: (p: RunPayment) => ReactNode; bulk: ReactNode } {
  const { openReceipt, ...record } = actions;
  const toPay = run.payments.filter((p) => p.state === "to_pay");
  return {
    controls: (p) => {
      if (p.state === "to_pay") return <RecordPayment payment={payable(p)} actions={record} />;
      if (p.state === "paid" && p.receiptFileId) return <OpenDocument claimId={p.id} fileId={p.receiptFileId} label="bank receipt" openFile={openReceipt} />;
      return null;
    },
    bulk: <MarkSelectedPaid payments={toPay.map(payable)} actions={record} />,
  };
}
