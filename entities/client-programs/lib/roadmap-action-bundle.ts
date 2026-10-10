// The real roadmap actions, gathered into one value so a server page can hand
// them to the editors as a single prop (ui/roadmap-actions-contract.ts explains
// why the editors take them rather than import them).
import {
  acceptProposedItem,
  archiveBacklogItem,
  archiveRoadmapGroup,
  createBacklogItem,
  createRoadmapGroup,
  moveRoadmapGroup,
  restoreBacklogItem,
  restoreRoadmapGroup,
  saveRoadmapOverview,
  seedTemplateGroups,
  setEdge8Priority,
  updateBacklogItem,
  updateRoadmapGroup,
} from "./roadmap-actions";
import type { RoadmapActions, SaveRoadmapOverview } from "../ui/roadmap-actions-contract";

export const ROADMAP_ACTIONS: RoadmapActions = {
  acceptProposedItem,
  archiveBacklogItem,
  archiveRoadmapGroup,
  createBacklogItem,
  createRoadmapGroup,
  moveRoadmapGroup,
  restoreBacklogItem,
  restoreRoadmapGroup,
  seedTemplateGroups,
  setEdge8Priority,
  updateBacklogItem,
  updateRoadmapGroup,
};

export const SAVE_ROADMAP_OVERVIEW: SaveRoadmapOverview = saveRoadmapOverview;
