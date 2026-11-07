import type { MultiSelectOption } from "@/kernel/ui/MultiSelect";
import { INTERNAL } from "./board-view-types";
import { clientLabel } from "@/entities/boards/lib/card-facts";

// The board filter's options (WB-04, 2026-09-16). A client can have several
// boards, and on a many-board scope their cards merge into the same lanes, so
// the toolbar offers a second cut by board. It is offered only where it says
// something the client filter cannot: when the boards in view include a client
// with more than one board. On a many-client scope the client filter is the
// first cut, so the boards on offer are the chosen clients' and there is
// nothing to offer until a client is chosen; a one-client scope (a hub tab,
// the portal) offers every board straight away. An empty list hides the filter.
export type FilterableBoard = { id: string; name: string; client_company_id: string | null; client_name: string | null };

const clientKey = (b: Pick<FilterableBoard, "client_company_id">): string => b.client_company_id ?? INTERNAL;

export function boardFilterOptions(boards: FilterableBoard[], clientFilter: string[]): MultiSelectOption[] {
  const manyClients = new Set(boards.map(clientKey)).size > 1;
  if (manyClients && clientFilter.length === 0) return [];
  const inView = manyClients ? boards.filter((b) => clientFilter.includes(clientKey(b))) : boards;
  const perClient = new Map<string, number>();
  for (const b of inView) perClient.set(clientKey(b), (perClient.get(clientKey(b)) ?? 0) + 1);
  if (![...perClient.values()].some((n) => n > 1)) return [];
  // With several clients in view a board name alone does not say whose it is.
  const prefixed = perClient.size > 1;
  return inView.map((b) => ({ value: b.id, label: prefixed ? `${clientLabel(b)} · ${b.name}` : b.name }));
}
