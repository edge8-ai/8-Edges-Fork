// Ideas Backlog constants shared by the /team submission flow and the
// /admin/innovation backlog. Pure data — safe to import from client components
// (no server-only imports here).

import type { BadgeTone } from "@/kernel/ui/Badge";

// The four offices, mapped 1:1 from the A01 Four Outcomes (increased revenue,
// higher-performing people, cheaper operations, valuable innovation).
export const IDEA_OFFICES = ["revenue", "talent", "operations", "innovation"] as const;
export type IdeaOffice = (typeof IDEA_OFFICES)[number];

export const OFFICE_LABEL: Record<IdeaOffice, string> = {
  revenue: "Revenue",
  talent: "Talent",
  operations: "Operations",
  innovation: "Innovation",
};

export function officeTone(office: string | null): BadgeTone {
  switch (office) {
    case "revenue":
      return "ok";
    case "talent":
      return "info";
    case "operations":
      return "warn";
    case "innovation":
      return "neutral";
    default:
      return "neutral";
  }
}

export const IDEA_STATUSES = ["new", "in_review", "approved", "declined", "archived"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  new: "New",
  in_review: "In review",
  approved: "Approved",
  declined: "Declined",
  archived: "Archived",
};

export function ideaStatusTone(status: string | null): BadgeTone {
  switch (status) {
    case "new":
      return "info";
    case "in_review":
      return "warn";
    case "approved":
      return "ok";
    case "declined":
      return "err";
    default:
      return "neutral";
  }
}
