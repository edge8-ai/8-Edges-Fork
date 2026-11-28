// Where to send what an advance owes (AD.13): the company's account, the amount
// and the reference, with a QR code beside them when one can be drawn. With no
// account on file it says to ask Finance rather than guessing, and a failed read
// says so, because telling someone no account exists would be untrue.
import type { ReturnAccount } from "../lib/return-account";

export function ReturnDetails({ account, amount, reference }: { account: ReturnAccount; amount: string; reference: string }) {
  return (
    <div className="adv-return">
      <dl className="u-stack u-gap-1 u-m-0">
        {account.state === "ready" ? (
          <>
            <div><dt className="admin-label">Bank</dt><dd className="u-m-0">{account.bankName}</dd></div>
            <div><dt className="admin-label">Account number</dt><dd className="u-m-0 admin-cell-mono">{account.accountNumber}</dd></div>
            <div><dt className="admin-label">Account holder</dt><dd className="u-m-0">{account.holder}</dd></div>
          </>
        ) : (
          <div>
            <dt className="admin-label">Bank and account</dt>
            <dd className="u-m-0">{account.state === "none" ? "Ask Finance for the account." : "The account could not be loaded just now. Ask Finance for it."}</dd>
          </div>
        )}
        <div><dt className="admin-label">Amount</dt><dd className="u-m-0 admin-cell-mono u-strong">{amount}</dd></div>
        <div><dt className="admin-label">Reference</dt><dd className="u-m-0 admin-cell-mono">{reference}</dd></div>
      </dl>
      {account.state === "ready" && account.qrSvg && (
        // Drawn by the qrcode library from a payload of checked ASCII values, on the server.
        <div className="adv-qr" role="img" aria-label="QR code for this transfer: scan it with your banking app" dangerouslySetInnerHTML={{ __html: account.qrSvg }} />
      )}
    </div>
  );
}
