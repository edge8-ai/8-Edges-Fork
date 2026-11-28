// Boards' side of a won deal (S.2, docs/adr/0003).
//
// Every AI Program gets a workboard by default (Dave, 2026-09-05), and
// `ensureProgramBoard` is the idempotent way one comes into being. Until this
// landed it was called from exactly two places, both of them programme
// creation: the portal's programme form and htt's registrations. A programme
// created from the CRM admin screen had no board, because that screen only
// reads boards — so a client sold through the pipeline could reach delivery
// with nowhere for the work to go, and the gap was only ever closed by somebody
// noticing.
//
// A win is the moment that matters, and crm cannot call it: boards is the
// entity that `requires` crm, so a call from crm to boards would close a cycle.
// Crm states the fact instead, and a deployment with a pipeline and no boards
// simply has no subscriber.
import { liveProgramsForCompany } from "@/entities/client-programs";
import type { EventPayload } from "@/kernel/events";
import { ensureProgramBoard } from "./create";

/**
 * Open the delivery board of every live programme the winning account runs.
 *
 * Idempotent through `ensureProgramBoard`: an account that already has its
 * boards keeps them, so a second win on the same client changes nothing.
 *
 * Throws on either failure so the bus logs and audits it. A silent return here
 * is indistinguishable from the ordinary "this client runs no programme yet"
 * case, which is the one shape of failure nobody would ever come looking for.
 */
export async function openDeliveryBoardsForWin(payload: EventPayload<"deal.won">): Promise<void> {
  // A deal nobody has mapped to an account has no client to open a board for,
  // and guessing one from the person would be boards inventing a link crm did
  // not make.
  if (!payload.companyId) return;

  const answer = await liveProgramsForCompany(payload.companyId);
  if (!answer.ok) throw new Error(`programmes of ${payload.companyId} not read: ${answer.error}`);

  for (const program of answer.programs) {
    const board = await ensureProgramBoard({
      id: program.id,
      name: program.name,
      companyId: payload.companyId,
    });
    if (!board.ok) throw new Error(`delivery board for programme ${program.id} not opened: ${board.error}`);
  }
}
