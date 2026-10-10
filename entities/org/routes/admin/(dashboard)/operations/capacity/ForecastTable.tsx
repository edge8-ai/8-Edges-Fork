import { Badge } from "@/kernel/ui/Badge";
import { formatHours } from "@/kernel/ui/format";
import type { RoleForecast } from "@/entities/org/lib/capacity-model";
import type { CapacityRole } from "@/entities/org/lib/capacity";
import { weekLabel } from "./labels";

// The twelve-week grid: one row per role, one column per week, each cell the
// hours still free that week. Free is the figure somebody acts on (it is the
// headroom a new deal would use), so it is the one printed; supply and committed
// sit in the cell's title for anyone checking the sum. There is no totals row:
// hours of different roles do not add up to anything that could be sold.
//
// A short week says so in words as well as colour (WCAG: never colour alone),
// through the err Badge, which is one of the few things that may carry
// --admin-err. The rows are roles; no person appears here by design.
export function ForecastTable({ roles, rows }: { roles: CapacityRole[]; rows: RoleForecast[] }) {
  if (rows.length === 0) {
    return <div className="admin-empty">No capacity roles yet. Add a role below to see its next twelve weeks.</div>;
  }
  const names = new Map(roles.map((r) => [r.id, r]));
  const weeks = rows[0].weeks.map((w) => w.weekStart);

  return (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <caption className="u-sr-only">
            Free hours per role for each of the next twelve weeks, starting on the Monday shown.
          </caption>
          <thead>
            <tr>
              <th scope="col">Role</th>
              {weeks.map((w) => (
                <th key={w} scope="col" className="admin-cell-mono u-nowrap">
                  {weekLabel(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const role = names.get(row.roleId);
              return (
                <tr key={row.roleId}>
                  <td className="u-nowrap">
                    <div className="admin-cell-strong">{role?.name ?? "Unknown role"}</div>
                    <div className="admin-cell-muted">{formatHours(role?.hoursPerWeek ?? 0)} h/week</div>
                  </td>
                  {row.weeks.map((w) => (
                    <td
                      key={w.weekStart}
                      className="admin-cell-mono u-nowrap"
                      title={`${formatHours(w.supply)} h supplied, ${formatHours(w.committed)} h committed`}
                    >
                      {w.free < 0 ? <Badge tone="err">Short {formatHours(-w.free)}</Badge> : formatHours(w.free)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
