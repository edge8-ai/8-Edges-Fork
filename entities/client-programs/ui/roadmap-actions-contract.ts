// What the roadmap editors are allowed to call, as a type rather than an import.
//
// The editors are "use client" components on this entity's browser door, and
// scripts/entity-client-doors.test.mjs walks that door's import graph to prove
// nothing server-only follows it into the browser. Importing lib/roadmap-actions
// directly puts a "use server" module on that path, so the editors take the
// actions as a prop instead and the server pages that render them supply the
// real ones (ROADMAP_ACTIONS on this entity's server door). The same pattern the
// hiring applicant control uses since RS-07.
//
// Type-only imports are erased at build, so naming the two input shapes here
// drags none of that module's Supabase or auth dependencies along.
import type { BacklogItemInput, RoadmapGroupInput } from "../lib/roadmap-actions";
import type { BacklogPriority } from "../lib/client-backlog";
import type { Result } from "@/kernel/data/result";

export type { BacklogItemInput, RoadmapGroupInput };

export type RoadmapActions = {
  createBacklogItem: (companyId: string, input: BacklogItemInput) => Promise<Result & { id?: string }>;
  updateBacklogItem: (id: string, patch: Partial<BacklogItemInput>) => Promise<Result>;
  setEdge8Priority: (id: string, priority: BacklogPriority) => Promise<Result>;
  acceptProposedItem: (id: string) => Promise<Result>;
  archiveBacklogItem: (id: string) => Promise<Result>;
  restoreBacklogItem: (id: string) => Promise<Result>;
  createRoadmapGroup: (companyId: string, input: RoadmapGroupInput) => Promise<Result & { id?: string }>;
  updateRoadmapGroup: (id: string, patch: RoadmapGroupInput) => Promise<Result>;
  moveRoadmapGroup: (id: string, direction: "up" | "down") => Promise<Result>;
  archiveRoadmapGroup: (id: string) => Promise<Result>;
  restoreRoadmapGroup: (id: string) => Promise<Result>;
  seedTemplateGroups: (companyId: string) => Promise<Result>;
};

export type SaveRoadmapOverview = (companyId: string, body: string) => Promise<Result>;
