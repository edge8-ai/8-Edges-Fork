// Client-visible workboards: the boards linked to the client's companies,
// read-only. The read is company-os's getWorkboard with clientSafe on, the
// same read the team client hub uses, so both always render the same thing.
// This wrapper only applies the portal actor's companyScope.

import type { PortalActor } from "@/kernel/identity/portal-auth";
import { getWorkboard, hasClientBoard, type WorkboardData } from "@/entities/boards";

export async function hasBoard(actor: PortalActor): Promise<boolean> {
  return hasClientBoard(actor.companyScope);
}

// Every active board of the actor's companies, as one client-safe workboard.
export async function getWorkboardForClient(actor: PortalActor): Promise<WorkboardData> {
  return getWorkboard({ scope: { kind: "companies", ids: actor.companyScope }, clientSafe: true });
}

// One chosen board, client-safe. Null unless the board belongs to one of the
// actor's companies: the id comes from the URL, so the scope is re-checked
// here rather than trusted.
export async function getWorkboardForBoard(actor: PortalActor, boardId: string): Promise<WorkboardData | null> {
  if (actor.companyScope.length === 0) return null;
  const board = await getWorkboard({ scope: { kind: "boards", ids: [boardId] }, clientSafe: true });
  const row = board.boards[0];
  if (!row || !row.client_company_id || !actor.companyScope.includes(row.client_company_id)) return null;
  return board;
}
