// An advance's files and its history as a page reads them (AD.6), shared by the owner's
// page and the approver's. A caller has run its guard and decided the advance is theirs
// to read. A failed read raises: an empty history would say nothing has happened to it.
import { NAME_ONLY_COLUMNS, personName } from "@/kernel/config/people-name";
import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { selectReimbursementAdvanceFiles } from "./reads";

export type AdvanceFile = { id: string; filename: string; kind: string; mimeType: string | null; replaced: boolean };
export type AdvanceEvent = {
  id: string;
  move: string;
  actorName: string | null;
  reason: string | null;
  at: string;
  /** On a close: whether the approver decided it ("approval") or a check under the limit did ("check"). */
  approvedAs: string | null;
};

/** Whether this move ever happened on the advance. A failed read raises: no would let a money rule through. */
export async function moveHappened(advanceId: string, move: string): Promise<boolean> {
  const rows = mustRows(await companyOs.from("reimbursement_advance_events").select("id").eq("advance_id", advanceId).eq("move", move).limit(1), "[reimbursements] an advance's history");
  return rows.length > 0;
}

export async function readAdvanceFiles(advanceId: string): Promise<AdvanceFile[]> {
  const rows = mustRows(
    await selectReimbursementAdvanceFiles("id, filename, kind, mime_type, replaced_at").eq("advance_id", advanceId).not("confirmed_at", "is", null).order("created_at"),
    "[reimbursements] an advance's files",
  );
  return rows.map((f) => ({
    id: String(f.id),
    filename: String(f.filename),
    kind: String(f.kind),
    mimeType: (f.mime_type as string | null | undefined) ?? null,
    replaced: f.replaced_at !== null && f.replaced_at !== undefined,
  }));
}

/** Newest first. */
export async function readAdvanceEvents(advanceId: string): Promise<AdvanceEvent[]> {
  const rows = mustRows(
    await companyOs
      .from("reimbursement_advance_events")
      .select(`id, move, reason, created_at, metadata, actor:people!reimbursement_advance_events_actor_person_id_fkey(${NAME_ONLY_COLUMNS})`)
      .eq("advance_id", advanceId)
      .order("created_at", { ascending: false }),
    "[reimbursements] an advance's history",
  ) as unknown as Record<string, unknown>[];
  return rows.map((e) => ({
    id: String(e.id),
    move: String(e.move),
    reason: (e.reason as string | null) ?? null,
    at: String(e.created_at),
    actorName: e.actor ? personName(e.actor as Parameters<typeof personName>[0], null) : null,
    approvedAs: typeof (e.metadata as { approvedAs?: unknown } | null)?.approvedAs === "string" ? (e.metadata as { approvedAs: string }).approvedAs : null,
  }));
}
