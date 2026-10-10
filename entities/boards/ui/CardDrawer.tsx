"use client";

import { formatDate } from "@/kernel/ui/format";
import type { Dispatch, SetStateAction } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { RecordHistory } from "@/kernel/ui/RecordHistory";
import { getCardRecordHistory } from "@/entities/boards/lib/card-record-history";
import type { WorkboardData, WorkboardCard, WorkboardLane } from "@/entities/boards/lib/workboard";
import { SUBJECT_COMMITMENT } from "@/entities/boards/lib/types";
import { sumSubtaskTokens } from "@/entities/boards/lib/tokens";
import { CardDrawerHeader } from "./CardDrawerHeader";
import { CardDrawerActions } from "./CardDrawerActions";
import { DraftsContext, useSectionKey, type Drafts } from "./card-drawer-sections";
import { CardStory } from "./CardStory";
import { useSubtaskOpener } from "./useSubtaskOpener";
import { CardPlanningSection } from "./CardPlanningSection";
import { CardTitleField } from "./CardTitleField";
import { drawerEyebrow } from "./card-chips";
import { focusCard } from "./focus-card";
import type { Form, RunAction } from "./board-view-types";

// The one card drawer: a right panel, read top-down (W.66, rebuilt by W.92.6).
//
// It used to be one long form — fourteen planning decisions above the thing
// you opened the drawer to read. W.66 put the story first and folded the
// planning away. W.92.6 finishes the job by asking what each field is FOR:
//
//   THE HEADER    the title, inline-editable, and the four fields somebody
//   (pinned)      changes without reading anything: column, assignee, due
//                 date, Human Tokens. Always in the same place, whatever the
//                 body has been scrolled to. Under them, the epic, sprint and
//                 PR pills (CardPills): always on screen, never required.
//   THE CARD      description · subtasks, as rows · one Activity stream, in
//                 which the comments and the card's own column history (W.34)
//                 are merged in time order.
//   PLANNING      every other decision ABOUT the card: board, priority,
//                 roadmap item, build summary, blockers, snooze, repeat,
//                 needs a hand. A plain section with a heading — no fold, no
//                 disclosure triangle, nothing to operate before reading.
//
// Same fields, same actions, same component on every surface (WB-01): a
// read-only surface opens this very drawer with the fieldsets disabled and no
// action row, in exactly this order, and nothing is hidden from it that a
// writer can see.
export function CardDrawer({
  form,
  setForm,
  data,
  activeCard,
  lanes,
  currentLaneId,
  viewerPersonId,
  readOnly,
  shareUrl,
  boardHref,
  saving,
  run,
  onMoveLane,
  onOpenCard,
  onSave,
  onArchive,
  onClose,
  error,
  drafts,
}: {
  form: Form | null;
  setForm: Dispatch<SetStateAction<Form | null>>;
  data: WorkboardData;
  activeCard: WorkboardCard | null;
  lanes: WorkboardLane[];
  /** The optimistic lane of the open card, when a move is in flight. */
  currentLaneId?: string;
  /**
   * Who is reading. Two controls turn on it: a handover only asks for a line
   * when the card is going to somebody ELSE (W.60), and "needs a hand" is the
   * assignee's own to raise and clear (W.62).
   */
  viewerPersonId: string | null;
  readOnly: boolean;
  /** The card's own shareable link (board page + ?card=id), for "Copy link". */
  shareUrl: string | null;
  /** Where the card's own board page is, on a many-board scope; null hides the link. */
  boardHref: string | null;
  saving: boolean;
  run: RunAction;
  onMoveLane: (cardId: string, laneId: string) => void;
  /** Opens another card in this drawer, for a blocker's card link (W.56). */
  onOpenCard?: (taskId: string) => void;
  onSave: () => void;
  onArchive: () => void;
  /**
   * Closing, when the caller guards unsaved edits (useCardForm's `close`,
   * W.141). Without it the drawer simply closes, as it always did.
   */
  onClose?: () => void;
  /**
   * The board's last refusal (W.141). Every write this drawer makes reports
   * through the board's banner, and the banner is drawn on the page BEHIND
   * the drawer — on a scrolled board, behind a locked scroll as well — so the
   * person clicked, the server said no, and nothing on screen changed. The
   * drawer shows it where the person is looking.
   */
  error?: string | null;
  /** The sections' unsent drafts, which the close question counts (W.141). */
  drafts?: Drafts;
}) {
  // A card with sized subtasks is worth their sum; the field shows it and refuses typing.
  const derivedTokens = activeCard ? sumSubtaskTokens(activeCard.subtasks) : null;
  const board = form ? data.boards.find((b) => b.id === form.boardId) : undefined;
  const isClientBoard = board?.client_company_id != null;
  const single = data.boards.length === 1;
  // Sprints and epics belong to a board; nothing to offer until one is chosen.
  const activeSprints = board ? data.sprints.filter((s) => s.status === "active" && s.board_id === board.id) : [];
  const activeEpics = board ? data.epics.filter((e) => e.status === "active" && e.board_id === board.id) : [];
  const slug = board?.slug ?? "";
  const openCardId = form?.id ?? null;
  const sectionKey = useSectionKey(openCardId);
  // Held here, above the Details panel the History tab unmounts (W.163 F12).
  const subtasks = useSubtaskOpener(openCardId);

  return (
    <DetailDrawer
      open={form !== null}
      onClose={onClose ?? (() => setForm(null))}
      className="wb-card-drawer"
      // "8 Edges · W.181", as the canvas reads it (W.159).
      eyebrow={form ? drawerEyebrow(board?.name ?? null, form.title, !form.id) : "Card"}
      // Escape hands focus back to the card on the board that opened this, so
      // a keyboard reader carries on from where they were instead of at the
      // top of the page.
      restoreFocus={() => focusCard(openCardId)}
      // A saved card's audit trail, as a second tab (S.4). Two surfaces do not
      // get it. A card being created has no history and no id to read one with.
      // And the one read-only board is the client's own, in the portal
      // (canEdit={false} there and nowhere else): its cards are served
      // client-safe, `getCardRecordHistory` gates on board membership, which a
      // portal member does not have, so offering the tab would only ever show
      // them a refusal.
      history={
        openCardId && !readOnly ? (
          <RecordHistory key={openCardId} load={(offset, limit) => getCardRecordHistory(openCardId, offset, limit)} />
        ) : null
      }
      title={
        form ? (
          <CardTitleField
            value={form.title}
            isNew={!form.id}
            readOnly={readOnly}
            onChange={(title) => setForm({ ...form, title })}
          />
        ) : (
          "Card"
        )
      }
      subhead={
        form && (
          <CardDrawerHeader
            form={form}
            setForm={setForm}
            data={data}
            activeCard={activeCard}
            lanes={lanes}
            currentLaneId={currentLaneId}
            activeSprints={activeSprints}
            activeEpics={activeEpics}
            derivedTokens={derivedTokens}
            viewerPersonId={viewerPersonId}
            readOnly={readOnly}
            saving={saving}
            error={error}
            onMoveLane={onMoveLane}
          />
        )
      }
    >
      {form && (
        // Remounted per card, never mid-Create (useSectionKey, W.141).
        <DraftsContext.Provider value={drafts ?? null}>
        <fieldset key={sectionKey} className="admin-form" disabled={readOnly}>
          {form.subjectType === SUBJECT_COMMITMENT && (
            <div className="admin-field admin-alert admin-alert--ok">
              <label className="admin-label u-ok">Linked commitment</label>
              <div>{form.subjectLabel ?? "Coaching commitment"}</div>
              <div className="u-sm u-mt-1">Moving this card to a done column marks the commitment kept.</div>
            </div>
          )}

          <CardStory
            form={form}
            setForm={setForm}
            activeCard={activeCard}
            slug={slug}
            readOnly={readOnly}
            saving={saving}
            run={run}
            people={data.people}
            subtasks={subtasks}
            between={(onAddSubtask) => (
              <CardPlanningSection
                form={form}
                setForm={setForm}
                data={data}
                activeCard={activeCard}
                isClientBoard={isClientBoard && !readOnly}
                backlogItems={single ? data.backlogItems : []}
                backlogGroups={single ? data.backlogGroups : []}
                people={data.people}
                slug={slug}
                readOnly={readOnly}
                saving={saving}
                run={run}
                onOpenCard={onOpenCard}
                onAddSubtask={onAddSubtask}
              />
            )}
          />

          {/* Who made the card (W.179, from Derek's spark): it was only in the
              audit log, so asking "who filed this?" meant leaving the card. */}
          {activeCard && (
            <p className="u-sm u-muted u-mt-1">
              Created by {activeCard.created_by_name ?? "someone not recorded"} · {formatDate(activeCard.created_at)}
            </p>
          )}

          {!readOnly && (
            <CardDrawerActions
              isNew={!form.id}
              saving={saving}
              shareUrl={shareUrl}
              boardHref={boardHref}
              onSave={onSave}
              onArchive={onArchive}
              onCancel={onClose ?? (() => setForm(null))}
            />
          )}
        </fieldset>
        </DraftsContext.Provider>
      )}
    </DetailDrawer>
  );
}
