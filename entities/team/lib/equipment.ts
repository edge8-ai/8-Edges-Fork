import type { TeamActor } from "@/kernel/identity/team-auth";
import { teamRead } from "./data";

// "My Equipment" reads. teamRead already clamps to the actor's person scope,
// but a manager's scope includes their direct reports, and this page is
// strictly first-person, so every query narrows again to actor.personId.

export type MyEquipment = {
  id: string;
  asset_tag: string;
  type: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  processor: string | null;
  ram: string | null;
  storage: string | null;
  screen_size: number | null;
  condition: string | null;
  status: string;
  image_url: string | null;
};

export type MyEquipmentRequest = {
  id: string;
  type: string;
  reason: string | null;
  needed_by: string | null;
  status: string;
  decision_note: string | null;
  created_at: string;
};

export async function getMyEquipment(actor: TeamActor): Promise<MyEquipment[]> {
  const { data, error: equipmentError } = await teamRead(
    actor,
    "equipment",
    "id, asset_tag, type, name, brand, model, serial_number, processor, ram, storage, " +
      "screen_size, condition, status, image_url",
  )
    .eq("current_holder_id", actor.personId)
    .is("archived_at", null)
    .order("type", { ascending: true })
    .order("name", { ascending: true });
  if (equipmentError) console.error("[team/equipment] equipment", equipmentError);
  return (data ?? []) as unknown as MyEquipment[];
}

export async function getMyEquipmentRequests(actor: TeamActor): Promise<MyEquipmentRequest[]> {
  const { data, error: requestsError } = await teamRead(
    actor,
    "equipment_requests",
    "id, type, reason, needed_by, status, decision_note, created_at",
  )
    .eq("person_id", actor.personId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (requestsError) console.error("[team/equipment] equipment_requests", requestsError);
  return (data ?? []) as unknown as MyEquipmentRequest[];
}
