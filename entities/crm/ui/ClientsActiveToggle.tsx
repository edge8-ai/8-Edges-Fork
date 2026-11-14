import Link from "next/link";
import { mergeQuery, type SearchParamsObj } from "@/kernel/ui/url";

// Server component. Flips the ?inactive=1 view flag on the Clients list,
// preserving the other query params (search, sort, filters, page). Default view
// is active clients only (customer/evangelist); the inactive view drops the
// lifecycle filter to reveal every non-archived company.
export function ClientsActiveToggle({
  basePath,
  searchParams,
  showInactive,
}: {
  basePath: string;
  searchParams: SearchParamsObj;
  showInactive: boolean;
}) {
  const href = basePath + mergeQuery(searchParams, { inactive: showInactive ? null : "1", page: 1 });
  return (
    <Link href={href} className="admin-btn admin-btn--sm">
      {showInactive ? "Active clients only" : "Show inactive"}
    </Link>
  );
}
