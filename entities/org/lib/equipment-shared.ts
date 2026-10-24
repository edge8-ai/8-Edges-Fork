// Shared between the admin equipment list page (server), shelf and forms (client), and
// the team equipment pages. Lives in lib/ so the library layer is not pinned to a URL path.

import type { BadgeTone } from "@/kernel/ui/Badge";
import { NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";

export const EQUIPMENT_TYPES = [
  "laptop",
  "desktop",
  "monitor",
  "keyboard",
  "mouse",
  "phone",
  "tablet",
  "headset",
  "dock",
  "printer",
  "accessory",
  "other",
] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export const EQUIPMENT_STATUSES = [
  "in_use",
  "in_stock",
  "in_repair",
  "lost",
  "retired",
  "sold",
] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const EQUIPMENT_CONDITIONS = ["new", "good", "fair", "damaged"] as const;

// Types that carry machine specs. Everything else hides the spec fields in the
// form, so a mouse doesn't ask for a processor.
export const SPEC_TYPES: readonly string[] = ["laptop", "desktop", "tablet"];

export type EquipmentRow = {
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
  purchase_date: string | null;
  model_year: number | null;
  vendor_id: string | null;
  vendor_name_raw: string | null;
  invoice_ref: string | null;
  cost_vnd: number | null;
  cost_usd: number | null;
  status: string;
  condition: string | null;
  current_holder_id: string | null;
  notes: string | null;
  image_url: string | null;
  archived_at: string | null;
  created_at: string;
  // Embedded, for the list and shelf headers.
  holder: ({ id: string } & NamedPerson) | null;
  vendor: { id: string; name: string | null } | null;
};

// Two FKs to people/vendors would be ambiguous, so both embeds are hinted by
// constraint column (see docs: PostgREST embed FK hints).
export const EQUIPMENT_SELECT =
  "id, asset_tag, type, name, brand, model, serial_number, processor, ram, storage, " +
  "screen_size, purchase_date, model_year, vendor_id, vendor_name_raw, invoice_ref, " +
  "cost_vnd, cost_usd, status, condition, current_holder_id, notes, image_url, archived_at, created_at, " +
  `holder:people!equipment_current_holder_id_fkey(id, ${NAME_COLUMNS}), ` +
  "vendor:vendors!equipment_vendor_id_fkey(id, name)";

export type AssignmentRow = {
  id: string;
  equipment_id: string;
  person_id: string;
  assigned_at: string;
  returned_at: string | null;
  condition_out: string | null;
  condition_in: string | null;
  note: string | null;
  created_by: string | null;
  person: ({ id: string } & NamedPerson) | null;
};

// One template literal from end to end, because it interpolates NAME_COLUMNS:
// check-table-ownership reads a SELECT constant only when it opens and closes
// with the same quote, and a "…" + `…` concatenation does not.
export const ASSIGNMENT_SELECT =
  `id, equipment_id, person_id, assigned_at, returned_at, condition_out, condition_in, note, created_by, person:people!equipment_assignments_person_id_fkey(id, ${NAME_COLUMNS})`;

export function statusLabel(status: string): string {
  switch (status) {
    case "in_use":
      return "In use";
    case "in_stock":
      return "In stock";
    case "in_repair":
      return "In repair";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

// Out with someone reads as active; on the shelf is informational; anything
// that has left circulation is muted or flagged.
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "in_use":
      return "ok";
    case "in_stock":
      return "info";
    case "in_repair":
      return "warn";
    case "lost":
      return "err";
    default:
      return "neutral";
  }
}

// Human summary of the spec columns: "M3 · 16GB · 512GB · 14\"".
export function specSummary(row: {
  processor: string | null;
  ram: string | null;
  storage: string | null;
  screen_size: number | null;
}): string {
  return [row.processor, row.ram, row.storage, row.screen_size ? `${row.screen_size}"` : null]
    .filter(Boolean)
    .join(" · ");
}
