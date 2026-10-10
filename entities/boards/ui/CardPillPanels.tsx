"use client";

import { useState } from "react";
import type { Result } from "@/kernel/data/result";
import type { BoardDetail } from "@/entities/boards/lib/data";
import { epicColorIndex, type EpicRow } from "@/entities/boards/lib/types";
import { PillOption } from "./CardPillPicker";
import { EPIC_SEARCH_FROM, filterEpics, shortDate } from "./card-pills";
import { EpicCombobox, EpicRowText } from "./EpicCombobox";

/**
 * Choosing the card's domain (W.42), with each domain's whole description.
 *
 * A native `<option>` renders one line of text, so the select this replaces
 * cut every description to sixty characters, and the description is what
 * settles the choice among 23 domains. Here each row shows the colour dot,
 * the name and the description in full. The search matches descriptions as
 * well, so "invoice" finds Commerce & Billing. "No epic" sits at the foot,
 * because clearing is the rare move.
 *
 * Given `onCreate` (W.153) the panel is a WAI-ARIA combobox (review P1): focus
 * stays in the search field, every choice — the epics, "Create epic", "No
 * epic" — is an option of the one listbox the field controls, the arrow keys
 * move the highlight rather than focus, and Enter takes the highlighted one.
 * What is highlighted after typing is defaultActive's answer (review P2).
 * Escape closes without creating, so a typo never becomes an epic.
 */
export function EpicPanel({
  epicId,
  activeEpics,
  current,
  onChoose,
  onCreate,
}: {
  epicId: string;
  activeEpics: readonly EpicRow[];
  /** The card's own epic when it is archived, so it stays visible as the current value. */
  current: EpicRow | undefined;
  onChoose: (epicId: string) => void;
  /**
   * Creates an epic with the typed name and files the card in it (W.153); it
   * closes the picker itself on success, so the panel only shows a refusal.
   * Absent where creating is not possible.
   */
  onCreate?: (name: string) => Promise<Result>;
}) {
  const listed = current && !activeEpics.some((e) => e.id === current.id) ? [...activeEpics, current] : activeEpics;
  if (onCreate) return <EpicCombobox epicId={epicId} listed={listed} onChoose={onChoose} onCreate={onCreate} />;
  return <EpicList epicId={epicId} listed={listed} onChoose={onChoose} />;
}

/** The read-only list of epics, searchable once there are enough of them. */
function EpicList({ epicId, listed, onChoose }: { epicId: string; listed: readonly EpicRow[]; onChoose: (epicId: string) => void }) {
  const [q, setQ] = useState("");
  const shown = filterEpics(listed, q);
  return (
    <>
      {listed.length >= EPIC_SEARCH_FROM && (
        <input
          className="admin-input wb-pill-search"
          type="search"
          data-pill-autofocus=""
          value={q}
          placeholder="Search epics"
          aria-label="Search epics"
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <div className="wb-pill-options">
        {shown.length === 0 && <div className="wb-pill-empty">No epic matches “{q.trim()}”.</div>}
        {shown.map((e) => (
          <PillOption key={e.id} current={e.id === epicId} onChoose={() => onChoose(e.id)}>
            <EpicRowText epic={e} />
          </PillOption>
        ))}
      </div>
      {epicId && (
        <div className="wb-pill-foot">
          <PillOption current={false} onChoose={() => onChoose("")}>
            <span className="wb-pill-option-name">No epic</span>
          </PillOption>
        </div>
      )}
    </>
  );
}

/**
 * Choosing the card's sprint: the board's active sprints with the week they
 * start, then the backlog. A card carried out of a closed sprint lists that
 * sprint as its current value, so the card never reads as "no sprint" while
 * it is in one (W.142), and can be moved out of it.
 */
export function SprintPanel({
  sprintId,
  activeSprints,
  closed,
  onChoose,
}: {
  sprintId: string;
  activeSprints: BoardDetail["sprints"];
  /** The card's sprint when it is no longer active. */
  closed: { id: string; name: string } | null;
  onChoose: (sprintId: string) => void;
}) {
  return (
    <div className="wb-pill-options">
      {closed && (
        <PillOption current onChoose={() => onChoose(closed.id)}>
          <span className="wb-pill-option-text">
            <span className="wb-pill-option-name">{closed.name}</span>
            <span className="wb-pill-option-desc">Closed</span>
          </span>
        </PillOption>
      )}
      {activeSprints.map((s) => (
        <PillOption key={s.id} current={s.id === sprintId} onChoose={() => onChoose(s.id)}>
          <span className="wb-pill-option-text">
            <span className="wb-pill-option-name">{s.name}</span>
            {s.starts_on && (
              <span className="wb-pill-option-desc">
                {shortDate(s.starts_on)}
                {s.ends_on ? ` – ${shortDate(s.ends_on)}` : ""}
              </span>
            )}
          </span>
        </PillOption>
      ))}
      <PillOption current={!sprintId} onChoose={() => onChoose("")}>
        <span className="wb-pill-option-text">
          <span className="wb-pill-option-name">Backlog</span>
          <span className="wb-pill-option-desc">In no sprint yet</span>
        </span>
      </PillOption>
    </div>
  );
}

/**
 * The card's pull request link. Apply and Remove change the form; Save writes
 * it, as it always did. The field holds whatever was pasted: the server keeps
 * the value as text, and the pill only ever links out through externalHref.
 */
export function PrPanel({ prUrl, onChoose }: { prUrl: string; onChoose: (prUrl: string) => void }) {
  const [value, setValue] = useState(prUrl);
  return (
    <form
      className="wb-pill-pr"
      onSubmit={(e) => {
        e.preventDefault();
        onChoose(value.trim());
      }}
    >
      <input
        className="admin-input"
        type="url"
        inputMode="url"
        data-pill-autofocus=""
        aria-label="Pull request URL"
        placeholder="https://github.com/…/pull/123"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="wb-pill-pr-actions">
        {prUrl && (
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => onChoose("")}>
            Remove
          </button>
        )}
        <button type="submit" className="admin-btn admin-btn--sm admin-btn--primary">
          {prUrl ? "Update" : "Add"}
        </button>
      </div>
    </form>
  );
}
