"use client";

import { useRef, useState, type TransitionStartFunction } from "react";
import type { useRouter } from "next/navigation";
import type { WorkboardData, WorkboardBoard } from "@/entities/boards/lib/workboard";
import { SUBJECT_COMMITMENT } from "@/entities/boards/lib/types";
import { archiveCard, createCard, setCardInternal, setCardRoadmapItem, updateCard } from "@/entities/boards/lib/actions";
import { setCardSprint } from "@/entities/boards/lib/sprint-actions";
import { setCardEpic } from "@/entities/boards/lib/epic-actions";
import type { CardTemplate } from "@/entities/boards/lib/card-templates";
import { withRejectionReported } from "@/kernel/ui/hooks/settle-write";
import { INTERNAL, type Card, type Form, type RunAction } from "./board-view-types";
import { createdBaseline, formFromCard, resyncForm, sameForm } from "./card-form-sync";
import { handPendingToNewCard } from "./new-card-deliverables";
import { stored, touchedAfterEdit, type SavedField } from "./card-autosave";
import { persistCardEdits } from "./card-persist-edits";
import { useCardAutosave } from "./useCardAutosave";

// The card form's state and its verbs: open an existing card, open a new one
// in a lane (pre-set to the active sprint and epic filters), create it (up to
// four server actions, retry-safe), and archive. A saved card has no Save:
// its edits save themselves (TH.3.2, useCardAutosave), through persistEdits
// below. The board keeps the banner and the transition so every drawer
// shares them. Since WB-01 the form also carries the board: on a many-board
// scope a new card is filed on the board the drawer's client and board
// pickers chose.
export function useCardForm({
  data,
  sprintFilter,
  epicFilter,
  setBanner,
  router,
  startSaving,
  run,
  viewerPersonId = null,
}: {
  data: WorkboardData;
  sprintFilter: string;
  epicFilter: string[];
  setBanner: (message: string | null) => void;
  router: ReturnType<typeof useRouter>;
  startSaving: TransitionStartFunction;
  /** The board runner's single-write path (useBoardActionRunner). */
  run: RunAction;
  /** Who is editing: handing a card to somebody else waits for its line (W.60). */
  viewerPersonId?: string | null;
}) {
  const [form, setForm] = useState<Form | null>(null);
  // The form as the drawer last took it from the live card; null for a new card.
  const [opened, setOpened] = useState<Form | null>(null);
  // A save in flight (W.138). `saving` disables the button, but only once
  // React has rendered it; a double click lands both clicks before that, and
  // two clicks on a new card are two inserts.
  const inFlight = useRef(false);
  // The saved fields the person edited in this drawer, each with the stored
  // value they set, until the server holds that value (TH.3.2). The resync
  // keeps them, so an edit undone while its save is out is not overwritten.
  const [touched, setTouched] = useState<Partial<Record<SavedField, string | boolean>>>({});
  const single = data.boards.length === 1 ? data.boards[0] : null;
  const boardById = (id: string): WorkboardBoard | undefined => data.boards.find((b) => b.id === id);

  // The live card changed under the open drawer (W.131): the fields nobody
  // touched take the live value and the edited ones are kept. Adjusted during
  // render, as React has state follow a prop, so the drawer never paints the
  // stale value first; the guard is `opened` catching up, which stops it.
  const live = form?.id && opened?.id === form.id ? data.cards.find((c) => c.id === form.id) : undefined;
  if (form && opened && live) {
    // The lane is the view's grouping, not the card's: it keeps the one it opened with.
    const fresh = formFromCard({ ...live, columnId: opened.laneId }, boardById(live.board_id ?? ""));
    if (!sameForm(fresh, opened)) {
      setOpened(fresh);
      setForm(resyncForm(form, opened, fresh, new Set(Object.keys(touched) as SavedField[])));
      // A field the server now holds as the person set it is theirs no longer.
      const still = Object.fromEntries(Object.entries(touched).filter(([k, v]) => stored(k as SavedField, fresh[k as SavedField]) !== v));
      if (Object.keys(still).length !== Object.keys(touched).length) setTouched(still);
    }
  }

  // The sections' unsent drafts (a comment, a subtask, a blocker), which no
  // save carries and the form cannot see; the drawer's sections flag them.
  const drafts = useRef(new Set<string>());
  const persist = (f: Form, fields: SavedField[]) =>
    persistCardEdits(f, fields, {
      board: boardById(f.boardId),
      liveCard: data.cards.find((c) => c.id === f.id),
      setForm,
      setBanner,
      refresh: () => router.refresh(),
      actions: { updateCard, setCardSprint, setCardEpic, setCardRoadmapItem, setCardInternal },
    });
  const autosave = useCardAutosave({
    form,
    opened,
    setForm,
    viewerPersonId,
    persist,
    onEdit: (changed, after) => {
      if (!opened) return;
      const apply = touchedAfterEdit(changed, after, opened, autosave.unconfirmed);
      setTouched((t) => apply(t));
    },
  });

  /**
   * Leaving a card: closing it, a blocker's card link swapping it in place, or
   * a new card opened over it (W.141). A saved card's edits are saved first
   * and the drawer moves on only once they landed (TH.3.2); if the save is
   * refused, the person stays on the card, with the refusal in front of them,
   * unless they choose to drop the edit. Before that, the same question as
   * ever when leaving would lose work no save can keep: a section's unsent
   * draft, an emptied title, or a new card's typed fields, since nothing of a
   * new card exists until Create card. Read here, not while rendering, because
   * a section flags its draft in a ref that does not re-render the drawer.
   */
  const losesWork = () =>
    drafts.current.size > 0 || (form !== null && opened !== null && (form.id ? form.title.trim() === "" : !sameForm(form, opened)));
  const leaving = useRef(false);
  // After a leave, synchronously when nothing was waiting to save (so an
  // untouched card closes at once), or once the save has landed.
  const afterLeaving = (then: () => void) => {
    const left = leave();
    if (left === true) then();
    else if (left !== false) void left.then((ok) => ok && then());
  };
  function leave(): boolean | Promise<boolean> {
    if (leaving.current) return false;
    if (losesWork() && !window.confirm("Discard your changes to this card?")) return false;
    const forget = () => {
      drafts.current.clear();
      autosave.reset();
      setTouched({});
      return true;
    };
    if (!form?.id || autosave.idle()) return forget();
    const card = autosave.current();
    leaving.current = true;
    // The drawer still shows the card while its save is out, and an edit made
    // then is saved too before the drawer moves on.
    const saveAll = async (): Promise<boolean> => {
      let saved = await autosave.flush();
      while (saved && autosave.current() === card && !autosave.idle()) saved = await autosave.flush();
      return saved;
    };
    return saveAll().then((saved) => {
      leaving.current = false;
      // The person may have opened another card while the save was out, or
      // left the board page, where no question can be answered.
      if (autosave.current() !== card || !autosave.alive()) return false;
      if (!saved && !window.confirm("Your last change to this card could not be saved. Leave it anyway and lose it?")) return false;
      return forget();
    });
  }

  function openCard(c: Card) {
    const opening = formFromCard(c, boardById(c.board_id ?? ""));
    const show = () => {
      // A message from the card closed before belongs to that card, and the
      // drawer now shows the banner inside itself (W.141).
      setBanner(null);
      setForm(opening);
      setOpened(opening);
    };
    // Re-opening the same card never asks and saves nothing early.
    if (form?.id === c.id) show();
    else afterLeaving(show);
  }

  // `template` is a board's card template (W.58). It fills the description
  // skeleton, the epic, the priority and the estimate — and deliberately not
  // the title, because the title is the one thing that differs between two
  // client onboardings. A template's epic wins over the filter's, since
  // choosing the template is the more specific act of the two.
  // `laneId` is omitted by the toolbar's New card button and by the keyboard
  // (W.32), which mean "a new card" rather than "a new card HERE"; the
  // per-column button names its own lane. The default lives here because "a
  // card with no lane chosen starts in the first one" is a fact about the
  // form, not something every caller should have to know.
  // `title` is what the column foot's field had in it when Shift+Enter asked
  // for the full card instead (W.92.8): the sentence somebody already typed
  // must not have to be typed again in the drawer.
  // `overrides` lets a many-board surface open the drawer already pointed at
  // one board and its sprint — sprint planning, where the drawer is opened
  // from a named board's panel, so the card should not start board-less
  // (the panel already knows which board and which next sprint it is).
  function openCreate(
    laneId: string = data.lanes[0]?.id ?? "",
    template?: CardTemplate,
    title = "",
    // dueDate: the day picked on the Calendar's month (W.175).
    overrides?: { boardId?: string; sprintId?: string; dueDate?: string },
  ) {
    // A saved card open in the drawer is left first, its edits saved.
    if (form?.id) afterLeaving(() => startCreate(laneId, template, title, overrides));
    else startCreate(laneId, template, title, overrides);
  }
  function startCreate(laneId: string, template: CardTemplate | undefined, title: string, overrides?: { boardId?: string; sprintId?: string; dueDate?: string }) {
    autosave.reset();
    const overrideBoard = overrides?.boardId ? boardById(overrides.boardId) : undefined;
    const preset = single && sprintFilter !== "all" && sprintFilter !== "backlog" ? sprintFilter : "";
    // One epic chosen is an answer to "which epic is this card in"; several, or
    // "no epic", is not, so the new card starts without one.
    const only = epicFilter.length === 1 ? epicFilter[0] : "";
    const filterEpic = single && only !== "" && only !== "none" ? only : "";
    const epicPreset = template?.epicId ?? filterEpic;
    setBanner(null);
    const blank: Form = {
      id: null,
      boardId: overrideBoard?.id ?? single?.id ?? "",
      clientId: overrideBoard ? overrideBoard.client_company_id ?? INTERNAL : single ? single.client_company_id ?? INTERNAL : "",
      laneId,
      title,
      priority: template?.priority ?? "p3",
      assigneeId: "",
      origAssigneeId: "",
      handoverNote: "",
      dueDate: overrides?.dueDate ?? "",
      humanTokens: template?.humanTokens === undefined ? "" : String(template.humanTokens),
      origHumanTokens: "",
      description: template?.description ?? "",
      prUrl: "",
      buildSummary: "",
      sprintId: overrides?.sprintId ?? preset,
      origSprintId: "",
      epicId: epicPreset,
      origEpicId: "",
      subjectType: null,
      subjectLabel: null,
      roadmapItemId: "",
      origRoadmapItemId: "",
      internal: false,
      origInternal: false,
    };
    // The blank form is what "unchanged" means for a new card (W.141), so a
    // drawer opened by mistake closes without a question and one with a
    // typed title asks first. A title handed over from the column foot counts
    // as typed: it is somebody's sentence.
    setOpened({ ...blank, title: "" });
    setForm(blank);
  }

  // Close, unless that would lose work and the person says no. `confirm` is
  // the plain, keyboard-reachable question every browser already knows how to
  // ask; a second modal on top of the drawer would need its own focus trap.
  function close() {
    afterLeaving(() => {
      setBanner(null);
      setForm(null);
    });
  }

  // Create card: a new card only. A saved card has no Save; its edits save
  // themselves, and once Create card has made the card, so do its own.
  function save() {
    if (!form || form.id || inFlight.current) return;
    const board = boardById(form.boardId);
    if (!board) return setBanner("Choose the client and board first.");
    inFlight.current = true;
    const slug = board.slug;
    const isClientBoard = board.client_company_id != null;
    setBanner(null);
    // Any failure re-syncs the board from the server, so what the user sees
    // behind the form is the truth. Declared out here because it is also the
    // rejection reporter for the whole chain below.
    // A new card's pending files and links (W.163 U7) are handed over as soon
    // as it exists. Declared out here so a step that fails after that still
    // says which link the card could not take, not only its own refusal.
    let handover: Promise<string | null> | null = null;
    // Once the card exists, a later step's refusal is autosave's to retry
    // (TH.3.2): the drawer says so where Save used to be.
    let created = false;
    // The drawer session this create belongs to: one closed or replaced by a
    // new card meanwhile must not take this card's baseline or status.
    const session = autosave.current();
    const ours = () => autosave.current() === session;
    const fail = (message: string) => {
      if (created && ours()) autosave.markFailed();
      setBanner(message);
      router.refresh();
      void handover?.then((missed) => {
        if (missed) setBanner(`${message} ${missed}`);
      });
    };
    // Wrapped so a write that never completes reaches the banner: the chain
    // below reports every REFUSAL through `fail`, but a rejected action would
    // have thrown straight out of the transition and left the drawer looking
    // like nothing had happened.
    startSaving(() =>
      withRejectionReported(async () => {
      // Up to four server actions run in sequence with no transaction across
      // them. Two rules keep a retry safe: (1) every persisted step is folded
      // into the form immediately, so a retry after a mid-way failure only
      // repeats the steps that did not land (and a created card becomes an
      // edit, saved by persistEdits, never a second card); (2) any failure
      // re-syncs the board from the server so what the user sees behind the
      // form is the truth.
      let cardId: string | null = null;
      // A step the server took with a follow-up that did not land ("Card
      // created, but", A.54) is not a failure: its row is there, so the form
      // keeps it and the chain goes on, and the message is said on the board
      // at the end, where the person is once the drawer closes.
      const warnings: string[] = [];
      // Every step lands only on the card this save is for (W.133). The
      // person may close this drawer and open another card while the chain is
      // still running, and a fold meant for card A must not clear B's handover
      // note, take B's typed estimate as its original, or close B's drawer.
      // A card not yet created is matched by what it was being created as.
      //
      // The id is read when the fold is ASKED for, never when React runs it
      // (W.138). React runs an updater at its next render whenever the
      // component already has an update queued — mid-save it always does — and
      // by then `cardId` has become the new card's id. Read late, the fold
      // that stamps that id on the form compared it with a form still at null,
      // so it and every fold after it were dropped: the drawer stayed a New
      // card and the next click filed a duplicate.
      const isCard = (f: Form, id: string | null) =>
        id ? f.id === id : f.id === null && f.boardId === form.boardId && f.title === form.title;
      const land = (fold: (f: Form) => Form | null) => {
        const id = cardId;
        setForm((f) => (f && isCard(f, id) ? fold(f) : f));
      };
      // A lane is a column name; this board may have renamed or dropped it.
      const columnId = board.laneColumn[form.laneId];
      if (!columnId) return fail(`${board.name} has no "${form.laneId}" column.`);
      const r = await createCard({
        boardId: board.id,
        columnId,
        title: form.title,
        priority: form.priority,
        assigneeId: form.assigneeId || undefined,
        dueDate: form.dueDate || undefined,
        humanTokens: form.humanTokens === "" ? undefined : Number(form.humanTokens),
        description: form.description || undefined,
        internal: isClientBoard ? form.internal : undefined,
        prUrl: form.prUrl || undefined,
      });
      // createCard returns the id even when a follow-up write inside it
      // failed; the row exists either way, so the form must become an edit.
      if (r.id) {
        const id = r.id;
        // What the new card was given before it existed goes to it now
        // (W.163 U7). Taken before the fold below, which unmounts the
        // section that holds them, and before anything that can fail, so a
        // retry never hands them over twice.
        handover = handPendingToNewCard(id);
        created = true;
        land((f) => ({ ...f, id, origAssigneeId: f.assigneeId, origHumanTokens: f.humanTokens, origSprintId: "", origRoadmapItemId: "", origInternal: f.internal }));
        // The drawer's baseline is now the card as created (createdBaseline).
        if (ours()) setOpened((o) => (o && o.id === null && o.boardId === form.boardId ? createdBaseline(form, id) : o));
      }
      if (!r.ok && !r.persisted) return fail(r.error);
      if (!r.ok) warnings.push(r.error);
      cardId = r.id ?? null;
      if (form.sprintId && cardId) {
        const sr = await setCardSprint(cardId, form.sprintId, slug);
        if (!sr.ok && !sr.persisted) return fail(sr.error);
        if (!sr.ok) warnings.push(sr.error);
        land((f) => ({ ...f, origSprintId: f.sprintId }));
      }
      if (form.epicId && cardId) {
        const er = await setCardEpic(cardId, form.epicId, slug);
        if (!er.ok) return fail(er.error);
      }
      // Roadmap link (client boards, non-commitment cards).
      if (isClientBoard && form.subjectType !== SUBJECT_COMMITMENT && cardId && form.roadmapItemId !== form.origRoadmapItemId) {
        const rr = await setCardRoadmapItem(cardId, form.roadmapItemId || null, slug);
        if (!rr.ok) return fail(rr.error);
        land((f) => ({ ...f, origRoadmapItemId: f.roadmapItemId }));
      }
      // A link the new card could not take is said on the board, which is
      // where the person is once the drawer closes.
      const missed = await handover;
      const said = [...warnings, ...(missed ? [missed] : [])].join(" ");
      if (said) setBanner(said);
      // No refresh: each board write above revalidated, so each came back with
      // the board re-rendered (W.196). A failure still refreshes, in `fail`.
      land(() => null);
      }, fail).finally(() => {
        inFlight.current = false;
      }),
    );
  }

  function archive() {
    if (!form?.id) return;
    const slug = boardById(form.boardId)?.slug ?? "";
    const id = form.id;
    // archiveCard revalidates, so the board it comes back with already has the
    // card gone (W.196); the runner shows a refusal on the banner.
    run(() => archiveCard(id, slug), () => setForm(null));
  }

  // The drawer's setter is autosave's: the person's edits start a save, the
  // board's own folds (the resync, `land`) above do not.
  return { form, setForm: autosave.edit, openCard, openCreate, save, archive, close, drafts, flush: autosave.flush, autosave: autosave.control };
}
