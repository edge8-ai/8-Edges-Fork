import { companyOs } from "@/kernel/data/supabase";
import { selectVendors } from "@/entities/finance";
import {
  ASSIGNMENT_SELECT,
  type AssignmentRow,
} from "@/entities/org/lib/equipment-shared";
import { NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";

// Read helpers for the equipment register. Writes go through the server
// actions in the module (and, for custody changes, the assign_equipment /
// return_equipment RPCs, which are atomic).

export type VendorOption = { id: string; name: string };

// Custody history for one item, newest period first. The row with
// returned_at null is the current holder.
export async function listAssignments(equipmentId: string): Promise<AssignmentRow[]> {
  const { data, error: assignmentsErr } = await companyOs
    .from("equipment_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("equipment_id", equipmentId)
    .order("assigned_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (assignmentsErr) console.error("[company-os/equipment] equipment_assignments", assignmentsErr);
  return (data ?? []) as unknown as AssignmentRow[];
}

// Assignable people now live in lib/admin/people-options, shared with every
// other person picker. Re-exported so the equipment module keeps one import.
//
// Anyone who currently holds an item is merged in by the caller, so a leaver
// can still be handed back from even though they are not assignable.

export async function listVendorOptions(): Promise<VendorOption[]> {
  const { data, error: vendorsErr } = await selectVendors("id, name")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (vendorsErr) console.error("[company-os/equipment] vendors", vendorsErr);
  return (data ?? []) as VendorOption[];
}

export type PersonCustody = {
  id: string;
  assigned_at: string;
  returned_at: string | null;
  condition_in: string | null;
  equipment: {
    id: string;
    asset_tag: string;
    name: string;
    type: string;
    status: string;
    serial_number: string | null;
  } | null;
};

// Everything this person has ever held, open periods first. Powers the
// Equipment block on the team member profile, which is also the offboarding
// check: anything still open has to come back before their last day.
export async function listCustodyForPerson(personId: string): Promise<PersonCustody[]> {
  const { data, error: custodyErr } = await companyOs
    .from("equipment_assignments")
    .select(
      "id, assigned_at, returned_at, condition_in, " +
        "equipment:equipment!equipment_assignments_equipment_id_fkey(id, asset_tag, name, type, status, serial_number)",
    )
    .eq("person_id", personId)
    .order("returned_at", { ascending: true, nullsFirst: true })
    .order("assigned_at", { ascending: false });
  if (custodyErr) console.error("[company-os/equipment] equipment_assignments", custodyErr);
  return (data ?? []) as unknown as PersonCustody[];
}

export type PendingRequest = {
  id: string;
  type: string;
  reason: string | null;
  needed_by: string | null;
  created_at: string;
  person: ({ id: string } & NamedPerson) | null;
};

// Open asks from /team. Surfaced on the equipment list so a request can't sit
// unseen in a table nobody opens.
export async function listPendingRequests(): Promise<PendingRequest[]> {
  const { data, error: requestsErr } = await companyOs
    .from("equipment_requests")
    .select(
      "id, type, reason, needed_by, created_at, " +
        `person:people!equipment_requests_person_id_fkey(id, ${NAME_COLUMNS})`,
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (requestsErr) console.error("[company-os/equipment] equipment_requests", requestsErr);
  return (data ?? []) as unknown as PendingRequest[];
}

// Counts for the list page subtitle: what is out, what is on the shelf, and
// what the register is worth.
export async function equipmentSummary(): Promise<{
  total: number;
  inUse: number;
  inStock: number;
  valueVnd: number;
}> {
  const { data, error: summaryErr } = await companyOs
    .from("equipment")
    .select("status, cost_vnd")
    .is("archived_at", null);
  if (summaryErr) console.error("[company-os/equipment] equipment", summaryErr);

  const rows = (data ?? []) as { status: string; cost_vnd: number | null }[];
  return {
    total: rows.length,
    inUse: rows.filter((r) => r.status === "in_use").length,
    inStock: rows.filter((r) => r.status === "in_stock").length,
    valueVnd: rows.reduce((sum, r) => sum + Number(r.cost_vnd ?? 0), 0),
  };
}
