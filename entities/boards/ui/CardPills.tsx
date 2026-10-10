"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { BoardDetail } from "@/entities/boards/lib/data";
import { epicColorIndex, type CardPrSync, type EpicRow } from "@/entities/boards/lib/types";
import { createEpic, setCardEpic } from "@/entities/boards/lib/epic-actions";
import type { Result } from "@/kernel/data/result";
import type { Form } from "./board-view-types";
import { CardPillPicker } from "./CardPillPicker";
import { EpicPanel, SprintPanel } from "./CardPillPanels";
import { CardPrRow } from "./CardPrRow";
import { EMPTY_FIELD, createEpicForCard, pillsToDraw, sprintPillLabel } from "./card-pills";
import { sprintChip } from "./card-chips";
import { Icon } from "@/kernel/ui/Icon";
import { saigonToday } from "@/kernel/config/dates";

const NO_BOARD = "Choose the client and brand first";

/**
 * Sprint · Epic · PR (Sprint first since W.168, following client and brand), as three labelled rows under the drawer's header
 * (docs/plans/2026-09-29-card-planning-pills.md; labelled rows since W.152).
 *
 * These are the three decisions most cards carry (93%, 66% and 49% of the 764
 * people-made cards in the 60 days to 2026-09-24). Behind "+ Add field" each
 * cost a menu choice on most cards, and a new card never showed them, so cards
 * were made without them. As full-width selects they cost three rows of height.
 * As pills they are one line, always on screen, in the pinned header, and
 * never required: an empty pill is the whole nudge.
 *
 * Since W.152 they are on every card on every board, and an empty one reads
 * "None" as a value rather than "+ Epic" as an action, so a person can tell at
 * a glance what is set and what is not (the work card redesign, 2026-10-05).
 *
 * A read-only surface draws only the fields that hold something, as plain
 * text; the PR stays a link.
 */
export function CardPills({
  form,
  setForm,
  activeSprints,
  allSprints,
  activeEpics,
  allEpics,
  boardSlug,
  prSynced,
  readOnly,
}: {
  form: Form;
  /**
   * The drawer's own state setter, not a plain callback: creating an epic
   * lands after two awaits and must fold into the form as it is THEN, which
   * only an updater function can read (W.163 F11).
   */
  setForm: Dispatch<SetStateAction<Form | null>>;
  activeSprints: BoardDetail["sprints"];
  /** Every sprint in scope, so a card in a closed one can still name it. */
  allSprints: readonly { id: string; name: string; starts_on: string | null; ends_on?: string | null }[];
  activeEpics: readonly EpicRow[];
  /** Every epic in scope, so a card tagged with an archived one still names it. */
  allEpics: readonly EpicRow[];
  /**
   * The card's board, whose pages a new epic refreshes (W.153). Null when the
   * board is not among the boards in scope; the picker then cannot create,
   * rather than refreshing a path that does not exist (review S6).
   */
  boardSlug: string | null;
  /** The PR's title and state as HTT last stamped them (W.161), or null. */
  prSynced: CardPrSync | null;
  readOnly: boolean;
}) {
  // Epics made from this picker (W.153), held here until the board's own data
  // comes back with them, so the card names its new epic at once instead of
  // reading "Its epic" until the page refreshes.
  const [made, setMade] = useState<EpicRow[]>([]);
  const pills = pillsToDraw(form, readOnly);
  if (pills.length === 0) return null;

  const fresh = made.filter((m) => !allEpics.some((e) => e.id === m.id));
  const epicsInScope = fresh.length ? [...allEpics, ...fresh] : allEpics;
  const epicsOnBoard = fresh.length ? [...activeEpics, ...fresh] : activeEpics;

  // Create, file the card in it at once when the card exists (review P7), and
  // close: Save then has nothing left to write for the epic, because the form
  // records the new epic as both chosen and stored.
  async function makeEpic(name: string, slug: string, close: () => void): Promise<Result> {
    const res = await createEpicForCard({
      name,
      cardId: form.id ?? null,
      create: (n) => createEpic(form.boardId, { name: n }, slug),
      setEpic: (cardId, epicId) => setCardEpic(cardId, epicId, slug),
    });
    if (!res.ok) return res;
    const row = { id: res.epicId, board_id: form.boardId, name, description: null, color: null, status: "active", sort_order: 0 } as unknown as EpicRow;
    setMade((m) => [...m, row]);
    // The form is read when the epic LANDS, not when it was asked for (W.163
    // F11). Two awaits sit between the two, and `form` here is the one this
    // render closed over: spreading it put back every edit made while the
    // epic was being created. And the drawer may since have moved to another
    // card, or closed, which this epic must not touch. A new card has no id,
    // so it is recognised by the board it was being made on, which is also
    // the board the epic now belongs to.
    const askedId = form.id ?? null;
    const askedBoard = form.boardId;
    const epicId = res.epicId;
    const saved = res.saved;
    setForm((f) => {
      const same = f !== null && (askedId ? f.id === askedId : f.id === null && f.boardId === askedBoard);
      return same ? { ...f, epicId, ...(saved ? { origEpicId: epicId } : {}) } : f;
    });
    close();
    return { ok: true };
  }

  // Sprints and epics belong to a board, so until the client and brand are
  // chosen there is nothing to offer (W.168): the pills say what comes first.
  const noBoard = !readOnly && !form.boardId;
  const epic = form.epicId ? epicsInScope.find((e) => e.id === form.epicId) : undefined;
  const sprint = form.sprintId ? allSprints.find((s) => s.id === form.sprintId) : undefined;
  const sprintClosed = !!form.sprintId && !activeSprints.some((s) => s.id === form.sprintId);
  const sprintLabel = form.sprintId ? sprintPillLabel(sprint, sprintClosed) : EMPTY_FIELD.sprint;
  const epicDot = epic && <span className="admin-board-epic-dot" data-epic-color={epicColorIndex(epic.color)} />;
  // An open sprint reads as the canvas has it: its name, its days, and "this
  // week" when it is (W.159). A closed one keeps saying it closed.
  const chip = sprint && !sprintClosed ? sprintChip(sprint, saigonToday()) : null;
  const sprintText = chip ? (
    <>
      <Icon name="cycle" />
      <span className="wb-pill-text">{chip.range ? `${chip.name} · ${chip.range}` : chip.name}</span>
      {chip.when && <span className="wb-chip-muted">{chip.when}</span>}
    </>
  ) : (
    <span className="wb-pill-text">{sprintLabel}</span>
  );

  return (
    <div className="wb-pills wb-core-fields" role="group" aria-label="Sprint, epic and pull request">
      {pills.includes("sprint") && (
        <div className="wb-core-row">
          <span className="wb-core-label">Sprint</span>
          <span className="wb-core-value">
            {readOnly ? (
              <span className="wb-pill is-static">{sprintText}</span>
            ) : noBoard ? (
              <button type="button" className="wb-pill is-empty" disabled>{NO_BOARD}</button>
            ) : (
              <CardPillPicker
                empty={!form.sprintId}
                caret
                label={sprintText}
                ariaLabel={form.sprintId ? `Sprint: ${sprintLabel}. Change it` : "Sprint: none. Choose one"}
                panelLabel="Choose a sprint"
              >
                {(close) => (
                  <SprintPanel
                    sprintId={form.sprintId}
                    activeSprints={activeSprints}
                    closed={sprintClosed ? { id: form.sprintId, name: sprint?.name ?? "Its sprint" } : null}
                    onChoose={(sprintId) => {
                      setForm({ ...form, sprintId });
                      close();
                    }}
                  />
                )}
              </CardPillPicker>
            )}
            {/* A board that plans by day has no sprint, which is not a mistake
                on the card: say so, so an empty Sprint does not read as one. */}
            {!readOnly && !noBoard && !form.sprintId && activeSprints.length === 0 && (
              <span className="wb-core-note">This board has no sprint running.</span>
            )}
            {/* A new card joins the sprint the board is filtered to; say so, so
                a card does not land in the wrong week unnoticed (W.159). */}
            {!readOnly && !form.id && !!form.sprintId && (
              <span className="wb-core-note">From the board&apos;s filter. Change it if the work isn&apos;t this week&apos;s.</span>
            )}
          </span>
        </div>
      )}

      {pills.includes("epic") && (
        <div className="wb-core-row">
          <span className="wb-core-label">Epic</span>
          <span className="wb-core-value">
            {noBoard ? (
              <button type="button" className="wb-pill is-empty" disabled>{NO_BOARD}</button>
            ) : readOnly ? (
              <span className="wb-pill is-static" title={epic?.description ?? undefined}>
                {epicDot}
                {epic?.name ?? "Its epic"}
              </span>
            ) : (
              <CardPillPicker
                empty={!form.epicId}
                caret
                label={
                  form.epicId ? (
                    <>
                      {epicDot}
                      <span className="wb-pill-text">{epic?.name ?? "Its epic"}</span>
                    </>
                  ) : (
                    <>
                      <span className="wb-chip-epic-none" aria-hidden />
                      {EMPTY_FIELD.epic}
                    </>
                  )
                }
                ariaLabel={form.epicId ? `Epic: ${epic?.name ?? "its epic"}. Change it` : "Epic: none. Choose one"}
                panelLabel="Choose an epic"
              >
                {(close) => (
                  <EpicPanel
                    epicId={form.epicId}
                    activeEpics={epicsOnBoard}
                    current={epic}
                    onCreate={form.boardId && boardSlug ? (name) => makeEpic(name, boardSlug, close) : undefined}
                    onChoose={(epicId) => {
                      setForm({ ...form, epicId });
                      close();
                    }}
                  />
                )}
              </CardPillPicker>
            )}
          </span>
        </div>
      )}

      {pills.includes("pr") && <CardPrRow form={form} setForm={setForm} synced={prSynced} readOnly={readOnly} />}
    </div>
  );
}
