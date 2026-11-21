import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import type { BookEntry } from "../lib/advance-books";

// One advance's account 141, the same on Finance's page and Admin's. Nothing before money moves.
export function AdvanceLedger({ account, owner }: { account: { entries: BookEntry[]; balanceVnd: number }; owner: string }) {
  if (account.entries.length === 0) return null;
  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">Ledger · account 141</h2>
      <div className="admin-table-wrap admin-table-wrap--flat">
        <table className="admin-table">
          <thead><tr><th>Date</th><th>Entry</th><th>Debit 141</th><th>Credit 141</th></tr></thead>
          <tbody>
            {account.entries.map((entry, i) => (
              <tr key={`${entry.what}-${i}`}>
                <td>{entry.on ? formatDate(entry.on) : "—"}</td>
                <td>{entry.what}</td>
                <td className="admin-cell-mono">{entry.debitVnd === null ? "" : formatVndWhole(entry.debitVnd)}</td>
                <td className="admin-cell-mono">{entry.creditVnd === null ? "" : formatVndWhole(entry.creditVnd)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} className="u-strong">Balance with {owner}</td>
              <td colSpan={2} className="admin-cell-mono u-strong">{formatVndWhole(account.balanceVnd)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
