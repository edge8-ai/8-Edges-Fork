import Link from "next/link";

// Shared card view for the clients lists (admin + team). Reuses the team-hub
// card grid. Each card deep-links to `${detailBasePath}/${id}`; `subText`
// supplies the one-line detail under the name (industry/priority for admin,
// the member's role on the account for team).
export type ClientCardRow = { id: string; name: string | null };

export function ClientCards<T extends ClientCardRow>({
  rows,
  detailBasePath,
  subText,
  hrefQuery,
}: {
  rows: T[];
  detailBasePath: string;
  subText?: (row: T) => string;
  // Optional query string (e.g. "?from=client-hubs") appended to each card link
  // so the destination can show a context-aware back-link.
  hrefQuery?: string;
}) {
  return (
    <div className="admin-hub-grid">
      {rows.map((c) => (
        <Link key={c.id} href={`${detailBasePath}/${c.id}${hrefQuery ?? ""}`} className="admin-hub-card">
          <span className="admin-hub-ico" aria-hidden>◔</span>
          <span className="admin-hub-title">{c.name || "(no name)"}</span>
          <span className="admin-hub-sub">{subText?.(c) || "View details"}</span>
        </Link>
      ))}
    </div>
  );
}
