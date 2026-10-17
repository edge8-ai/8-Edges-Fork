"use client";

import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import type { CardTemplate } from "@/entities/boards/lib/card-templates";
import type { BoardAttention } from "./useBoardAttention";
import type { WorkboardFilters } from "./useWorkboardFilters";
import { WorkboardPulse } from "./WorkboardPulse";
import { WorkboardNotices } from "./WorkboardNotices";
import { SprintGoalLine } from "./SprintGoalLine";
import { WorkboardEmptyState } from "./WorkboardEmptyState";

// Everything the page SAYS between the toolbar and the cards: the shape of
// what is in view and, in words, what is narrowing it (W.174), what changed
// since you last looked, what the sprint is for, and which kind of nothing an
// empty board is (W.46, W.47, W.51, W.63, W.70; the needs-a-hand band, W.62,
// went in W.177).
//
// Four blocks, each but the pulse absent unless it has something to say, and
// none of them draws a card. Gathered here because WorkboardStories is the page's
// SKELETON — the toolbar, this, the view — and four renderers with their
// reasons inline is what made that skeleton hard to see.

export function WorkboardPageNotes({
  data,
  f,
  cards,
  attention,
  canAdd,
  saving,
  onNewCard,
  onBanner,
}: {
  data: WorkboardData;
  f: WorkboardFilters;
  /** The cards the filters and the grouping settled, before the board's own window. */
  cards: Card[];
  attention: BoardAttention;
  canAdd: boolean;
  saving: boolean;
  onNewCard: (template?: CardTemplate) => void;
  onBanner: (message: string | null) => void;
}) {
  return (
    <>
      {/* The pulse carries the filter sentence at its right end (W.174). */}
      <WorkboardPulse data={data} f={f} doneWindowStart={attention.doneWindowStart} />
      <WorkboardNotices
        data={data}
        cards={cards}
        attention={attention}
        saving={saving}
        onBanner={onBanner}
      />
      {/* The sprint goal sits above the empty state because a filtered-to-
          nothing sprint still has a goal, and reading it is how someone
          decides whether the emptiness is a surprise. */}
      <SprintGoalLine sprintFilter={f.sprintFilter} sprints={data.sprints} />
      <WorkboardEmptyState data={data} f={f} canAdd={canAdd} onNewCard={onNewCard} />
    </>
  );
}
