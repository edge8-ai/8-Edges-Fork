import type { ReactNode } from "react";

export function PageHead({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow?: ReactNode;
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="admin-page-head">
      <div className="u-min-0">
        {eyebrow && <div className="admin-eyebrow">{eyebrow}</div>}
        <h1 className="admin-page-title">{title}</h1>
        {sub && <p className="admin-page-sub">{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
