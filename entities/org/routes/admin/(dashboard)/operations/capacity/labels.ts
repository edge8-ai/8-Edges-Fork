import type { CapacitySource } from "@/entities/org/lib/capacity-schemas";

// Display words shared by the capacity screen's panels.

/** A week's Monday as "Sep 28". Read in UTC because the value is a calendar date with no zone. */
export function weekLabel(monday: string): string {
  return new Date(`${monday}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export const SOURCE_LABELS: Record<CapacitySource, string> = {
  manual: "Manual",
  deal: "Deal",
  requisition: "Requisition",
  work_request: "Work request",
};
