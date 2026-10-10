"use client";

// The global search palette (S.1): a "Search" row for the sidebar, and a dialog
// that Cmd-K or Ctrl-K opens from anywhere on the surface.
//
// It names no entity and runs no query of its own. The layout hands it its
// surface's server action from the generated app/search.ts. The action guards,
// asks every installed entity's searcher, and answers with groups. The palette
// shows them, walks them with the keyboard, and opens a hit's href.
//
// The dialog is portalled to <body>. Both sidebars are <nav>, and globals.css
// gives every bare <nav> a backdrop-filter for the public site's header. That
// makes the sidebar the containing block of any fixed-position descendant, so
// an in-place dialog would open inside the sidebar instead of over the page.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/kernel/shell/search";
import { flattenHits, isPaletteShortcut, moveActive, shortcutLabel } from "./search-palette-model";
import { optionId, SearchResultsList } from "./SearchResultsList";
import { useSearchQuery } from "./useSearchQuery";

export function SearchPalette({ search }: { search: (query: string) => Promise<SearchResult> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { query, setQuery, result, status, active, setActive, reset } = useSearchQuery(search, open);
  // Rendered as "Ctrl K" on the server and corrected after mount, so the first
  // client render matches the server's HTML.
  const [shortcut, setShortcut] = useState("Ctrl K");
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const ids = useId();

  const groups = useMemo(() => result?.groups ?? [], [result]);
  const flat = useMemo(() => flattenHits(groups), [groups]);

  useEffect(() => setShortcut(shortcutLabel(navigator.platform)), []);

  const show = useCallback(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
    openerRef.current?.focus();
  }, [reset]);

  const go = (href: string) => {
    setOpen(false);
    reset();
    router.push(href);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e)) return;
      e.preventDefault();
      if (open) close();
      else show();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, show, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(ids, active))?.scrollIntoView({ block: "nearest" });
  }, [active, ids]);

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => moveActive(i, e.key === "ArrowDown" ? 1 : -1, flat.length));
    } else if (e.key === "Enter") {
      const target = flat[active];
      if (target) {
        e.preventDefault();
        go(target.hit.href);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // The input is the dialog's only stop; the hits are reached with the arrows.
      e.preventDefault();
    }
  };

  return (
    <>
      <button type="button" className="admin-search-trigger" onClick={show} aria-haspopup="dialog">
        <span className="admin-search-trigger-label">Search</span>
        <kbd className="admin-search-trigger-kbd">{shortcut}</kbd>
      </button>

      {open &&
        createPortal(
          <div className="admin-search-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
            <div className="admin-search-dialog" role="dialog" aria-modal="true" aria-label="Search">
              <input
                ref={inputRef}
                className="admin-search-input"
                type="text"
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls={`${ids}-list`}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? optionId(ids, active) : undefined}
                placeholder="Search"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
              />
              <SearchResultsList ids={ids} groups={groups} active={active} onHover={setActive} onOpen={go} />
              <div className="admin-search-status" role="status" aria-live="polite">
                {status === "idle" && "Type at least two characters."}
                {status === "loading" && "Searching…"}
                {status === "error" && "Search failed. Try again."}
                {status === "done" && groups.length === 0 && <>Nothing matches &ldquo;{query.trim()}&rdquo;.</>}
                {status === "done" && groups.length > 0 && "↑ ↓ to move · Enter to open · Esc to close"}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
