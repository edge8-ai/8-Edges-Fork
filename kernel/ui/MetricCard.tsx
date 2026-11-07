import Link from "next/link";
import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
}) {
  const inner = (
    <>
      <div className="admin-kpi-label">{label}</div>
      <div className="admin-kpi-val">{value}</div>
      {sub && <div className="admin-kpi-note">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="admin-kpi">
      {inner}
    </Link>
  ) : (
    <div className="admin-kpi">{inner}</div>
  );
}
