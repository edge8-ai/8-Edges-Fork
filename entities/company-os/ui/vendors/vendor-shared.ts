// Shared between the list pages (server), shelf and forms (client), on both the
// admin and the team surface.
import type { BadgeTone } from "@/kernel/ui/Badge";

export const VENDOR_TYPES = ["car", "tour", "travel_agency", "conference_room", "other"] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

// Stored as the display string; "" / null = unrated.
export const VENDOR_RATINGS = ["Preferred", "Average", "Poor Experience", "To Consider"] as const;

export function ratingTone(rating: string | null): BadgeTone {
  switch (rating) {
    case "Preferred":
      return "ok";
    case "Average":
      return "info";
    case "To Consider":
      return "warn";
    case "Poor Experience":
      return "err";
    default:
      return "neutral";
  }
}

export type VendorInput = {
  type: VendorType;
  name: string;
  price_range?: string;
  address?: string;
  phone?: string;
  tax_id?: string;
  bank_info?: string;
  primary_contact_name?: string;
  primary_contact_email?: string;
  primary_contact_phone?: string;
  secondary_contact_name?: string;
  secondary_contact_email?: string;
  secondary_contact_phone?: string;
  rating?: string;
  url?: string;
  notes?: string;
};

export type VendorRow = {
  id: string;
  type: string;
  name: string;
  price_range: string | null;
  address: string | null;
  phone: string | null;
  tax_id: string | null;
  bank_info: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  secondary_contact_name: string | null;
  secondary_contact_email: string | null;
  secondary_contact_phone: string | null;
  rating: string | null;
  url: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
};

export const VENDOR_SELECT =
  "id, type, name, price_range, address, phone, tax_id, bank_info, " +
  "primary_contact_name, primary_contact_email, primary_contact_phone, " +
  "secondary_contact_name, secondary_contact_email, secondary_contact_phone, " +
  "rating, url, notes, archived_at, created_at";

// What the team surface may read of a vendor. Bank details and tax IDs are
// admin-only, so they are left out of the query itself: a column that is never
// selected cannot leak through a row handed to a client component.
export type TeamVendorRow = Omit<VendorRow, "tax_id" | "bank_info">;

export const TEAM_VENDOR_SELECT =
  "id, type, name, price_range, address, phone, " +
  "primary_contact_name, primary_contact_email, primary_contact_phone, " +
  "secondary_contact_name, secondary_contact_email, secondary_contact_phone, " +
  "rating, url, notes, archived_at, created_at";
