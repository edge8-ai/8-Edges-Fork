import Link from "next/link";
import { mergeQuery, type SearchParamsObj } from "@/kernel/ui/url";

// Server component. A link that flips the ?archived=1 view flag on a list page,
// preserving the other query params (search, sort, page).
export function ArchivedToggle({
  basePath,
  searchParams,
  showArchived,
}: {
  basePath: string;
  searchParams: SearchParamsObj;
  showArchived: boolean;
}) {
  const href = basePath + mergeQuery(searchParams, { archived: showArchived ? null : "1", page: 1 });
  return (
    <Link href={href} className="admin-btn admin-btn--sm">
      {showArchived ? "Hide archived" : "Show archived"}
    </Link>
  );
}
