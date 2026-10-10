"use client";

import type { OceanDimensionKey } from "@/entities/coaching/lib/types";
import type { CoachTabId } from "@/entities/coaching/lib/coach-tabs";

export type RenderedHtml = {
  meetings: Record<string, { prep: string | null; summary: string | null; shared: string | null }>;
  trends: Record<string, string | null>;
  checkins: Record<string, string | null>;
  privateProfile: string | null;
};

export type CoachTab = CoachTabId;

// What each tab is called. The ids and their order are the lib's, because
// whether a tab is offered at all is a rule with tests (G.5); only the wording
// is a UI concern and lives here. A Record rather than a second list, so adding
// a tab to the rule without naming it here does not typecheck.
export const COACH_TAB_LABELS: Record<CoachTabId, string> = {
  next: "Session",
  log: "History",
  goals: "Goals",
  person: "About them",
  performance: "Performance",
  insights: "Insights",
};

export type ActionResult = { ok: true } | { ok: false; error: string };

// K.5: the private summary, the coaching-mode estimate, the OCEAN read and the
// trend report keep landing in their tables, but none of them is the point of
// the page, and none of them is ever shown to the member. One sentence says so
// wherever the coach would otherwise look for them; the stored text is a click
// away rather than deleted.
export const STORED_NOT_SHOWN_NOTE =
  "A private summary, coaching-mode estimate and monthly trend are stored for this 1-1 and not shown. Ask if you want them surfaced.";

export const OCEAN_LABELS: Record<OceanDimensionKey, string> = {
  openness: "Openness",
  conscientiousness: "Conscientiousness",
  extraversion: "Extraversion",
  agreeableness: "Agreeableness",
  neuroticism: "Neuroticism",
};
