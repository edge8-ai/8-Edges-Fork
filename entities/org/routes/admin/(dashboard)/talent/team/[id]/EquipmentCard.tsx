import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import type { listCustodyForPerson } from "@/entities/org/lib/equipment";

type Custody = Awaited<ReturnType<typeof listCustodyForPerson>>;

// What has been assigned to this person, and what is still with them.
export function EquipmentCard({ custody, heldNow, isLeaving }: { custody: Custody; heldNow: Custody; isLeaving: boolean }) {
  return (
    <div className="admin-card admin-section-card">
      <h2 className="admin-card-title">Equipment ({heldNow.length})</h2>
      {custody.length === 0 ? (
        <div className="admin-empty">Nothing has been assigned to this person.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Tag</th>
                <th>Type</th>
                <th>Held</th>
              </tr>
            </thead>
            <tbody>
              {custody.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="admin-cell-strong">{c.equipment?.name ?? "Removed item"}</span>
                    {c.equipment?.serial_number && (
                      <div className="admin-cell-muted">{c.equipment.serial_number}</div>
                    )}
                  </td>
                  <td className="admin-cell-mono">{c.equipment?.asset_tag ?? "—"}</td>
                  <td>{c.equipment ? humanize(c.equipment.type) : "—"}</td>
                  <td>
                    {formatDate(c.assigned_at)} →{" "}
                    {c.returned_at ? (
                      formatDate(c.returned_at)
                    ) : (
                      <Badge tone="ok">Still has it</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isLeaving && heldNow.length > 0 && (
        <div className="admin-alert admin-alert--err u-mt-3">
          Leaving with {heldNow.length} {heldNow.length === 1 ? "item" : "items"} still out.
          Close {heldNow.length === 1 ? "it" : "them"} on the{" "}
          <Link href="/admin/operations/equipment">equipment register</Link> before the last day.
        </div>
      )}
    </div>
  );
}
