"use client";

import { useId, useState } from "react";
import type { Result } from "@/kernel/data/result";
import { epicColorIndex, type EpicRow } from "@/entities/boards/lib/types";
import { canCreateEpic, defaultActive, epicComboOptions, filterEpics, type EpicOption } from "./card-pills";

// The card's epic picker when it can also create (W.153), split from
// CardPillPanels for the client-component size cap. EpicPanel decides which
// of the two pickers a card gets; this file is the one that creates.

/** The dot, the name and the whole description of one epic. */
export function EpicRowText({ epic }: { epic: EpicRow }) {
  return (
    <>
      <span className="admin-board-epic-dot" data-epic-color={epicColorIndex(epic.color)} />
      <span className="wb-pill-option-text">
        <span className="wb-pill-option-name">
          {epic.name}
          {epic.status !== "active" && " (archived)"}
        </span>
        {epic.description?.trim() && <span className="wb-pill-option-desc">{epic.description}</span>}
      </span>
    </>
  );
}

/** The picker as a combobox that can also create (W.153). */
export function EpicCombobox({
  epicId,
  listed,
  onChoose,
  onCreate,
}: {
  epicId: string;
  listed: readonly EpicRow[];
  onChoose: (epicId: string) => void;
  onCreate: (name: string) => Promise<Result>;
}) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const byId = new Map(listed.map((e) => [e.id, e]));
  const optionsFor = (query: string) => epicComboOptions(filterEpics(listed, query), canCreateEpic(listed, query), !!epicId);
  const options = optionsFor(q);
  const at = options.length ? Math.min(active, options.length - 1) : -1;
  // One divider between the epics and the actions after them, not one per action.
  const firstAction = options.findIndex((o) => o.kind !== "epic");

  async function choose(o: EpicOption) {
    if (o.kind === "epic") return onChoose(o.id);
    if (o.kind === "clear") return onChoose("");
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    const res = await onCreate(q.trim());
    setCreating(false);
    if (!res.ok) setCreateError(res.error);
  }

  return (
    <>
      <input
        className="admin-input wb-pill-search"
        type="search"
        data-pill-autofocus=""
        value={q}
        placeholder="Find or create an epic…"
        aria-label="Find or create an epic"
        role="combobox"
        aria-controls={listId}
        aria-expanded="true"
        aria-autocomplete="list"
        aria-activedescendant={at >= 0 ? `${listId}-${at}` : undefined}
        // readOnly, not disabled: a disabled field drops focus to the page,
        // and the drawer would then take the next Escape for itself.
        readOnly={creating}
        aria-busy={creating}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          setActive(defaultActive(optionsFor(next), next));
          setCreateError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            // The highlight moves; focus stays here. Stopped so the picker
            // does not also walk focus onto the options.
            e.preventDefault();
            e.stopPropagation();
            if (!options.length) return;
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((at + step + options.length) % options.length);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (at >= 0) void choose(options[at]);
          }
        }}
      />
      <ul id={listId} className="wb-pill-options wb-epic-listbox" role="listbox" aria-label="Epics on this board">
        {options.map((o, i) => (
          <li
            key={o.kind === "epic" ? o.id : o.kind}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === at}
            className={`wb-pill-option${i === at ? " is-active" : ""}${o.kind === "epic" && o.id === epicId ? " is-current" : ""}${i === firstAction ? " wb-pill-foot" : ""}`}
            // mousedown, not click: the click would land after the field's
            // blur, and the picker closes on blur.
            onMouseDown={(e) => {
              e.preventDefault();
              void choose(o);
            }}
          >
            {o.kind === "epic" && byId.get(o.id) && <EpicRowText epic={byId.get(o.id) as EpicRow} />}
            {o.kind === "create" && (
              <span className="wb-pill-option-name wb-pill-create">{creating ? `Creating “${q.trim()}”…` : `+ Create epic “${q.trim()}”`}</span>
            )}
            {o.kind === "clear" && <span className="wb-pill-option-name">No epic</span>}
          </li>
        ))}
      </ul>
      {options.length === 0 && <div className="wb-pill-empty">No epic matches “{q.trim()}”.</div>}
      {createError && (
        <div className="wb-pill-empty" role="alert">
          {createError}
        </div>
      )}
    </>
  );
}
