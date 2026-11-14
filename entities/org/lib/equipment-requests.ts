// What other entities ask of, and do to, the equipment register (A.67). Until
// A.67 the door handed out `selectEquipment` and
// `insertEquipmentRequests`. This file stays apart from ./equipment.ts,
// which reads finance's vendors: org's door graph does not reach finance, and
// exporting that file would make org require it.
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { selectEquipment } from "./reads";
import { insertEquipmentRequests } from "./writes";

/** The purchase cost of every item on the register, in VND: the operations cockpit's equipment total. */
export async function equipmentCosts() {
  const { data, error } = await selectEquipment("cost_vnd");
  return { data: data as { cost_vnd: number | null }[] | null, error };
}

export type EquipmentRequestInput = TablesInsert<{ schema: "company_os" }, "equipment_requests">;

/** File a team member's request for equipment and return the new request's id. */
export async function fileEquipmentRequest(row: EquipmentRequestInput) {
  const { data, error } = await insertEquipmentRequests(row).select("id").maybeSingle();
  return { data: data as { id: string } | null, error };
}

/**
 * Files the actor's OWN equipment request (A.88.6, the rule team's teamInsertOwn
 * applied): person_id is always the actor's own, never a value the row carries,
 * which is overwritten rather than trusted. Answers its error as a sentence.
 */
export async function fileOwnEquipmentRequest(
  actor: Pick<TeamActor, "personId">,
  row: Omit<EquipmentRequestInput, "person_id"> & { person_id?: unknown },
): Promise<{ data: { id: string } | null; error: string | null }> {
  const { data, error } = await fileEquipmentRequest({ ...row, person_id: actor.personId });
  return { data, error: error?.message ?? null };
}
