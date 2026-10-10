"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/** One board the switcher can jump to. The caller supplies the href, because
 *  where a board lives is the surface's business and not this control's. */
export type BoardSwitcherOption = { slug: string; name: string; clientName: string | null; href: string };

/** Internal boards have no client, and they group together under one heading
 *  rather than under an empty one. */
const INTERNAL = "Internal";

/**
 * Jump to one board's Workboard (W.92.5).
 *
 * The company Workboard shows every board at once, which is the right default
 * and the wrong thing when you know which board you want: getting to one used
 * to mean the sidebar, Boards, then an index page, then the board — four
 * moves to reach a name you already had in your head. This is the name in
 * your head, typed.
 *
 * SEARCHABLE AND GROUPED, because the list is long enough to need both and
 * they answer different needs. Typing is for the person who knows the name;
 * the client headings are for the person who knows the client and is looking
 * down the boards under it. The search matches the CLIENT as well as the
 * board, so "acme" finds a board called Q4 Launch under Acme.
 *
 * It is a link per board and not a select-and-navigate: a board is a place,
 * so middle-click and open-in-new-tab should work, and they do because these
 * are anchors.
 */
export function BoardSwitcher({ options, currentSlug = null }: { options: BoardSwitcherOption[]; currentSlug?: string | null }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matches = options.filter(
      (o) => term === "" || o.name.toLowerCase().includes(term) || (o.clientName ?? INTERNAL).toLowerCase().includes(term),
    );
    const byClient = new Map<string, BoardSwitcherOption[]>();
    for (const o of matches) {
      const key = o.clientName ?? INTERNAL;
      byClient.set(key, [...(byClient.get(key) ?? []), o]);
    }
    // Clients alphabetically, with Internal last: it is the company's own
    // drawer rather than one more client, and it reads as a footer.
    return [...byClient.entries()].sort(([a], [b]) =>
      a === INTERNAL ? 1 : b === INTERNAL ? -1 : a.localeCompare(b),
    );
  }, [options, q]);

  if (options.length === 0) return null;

  return (
    <div className="admin-record-menu-wrap">
      <button
        type="button"
        className="admin-btn admin-btn--sm wb-boardswitch-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Go to board <span aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <div className="admin-record-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="admin-record-menu wb-boardswitch-menu" role="menu" aria-label="Go to board">
            <input
              className="admin-input wb-boardswitch-search"
              type="search"
              value={q}
              placeholder="Search boards"
              aria-label="Search boards"
              // The reason the menu is open is to type, so it takes the
              // caret without a second click. Safe here because the menu
              // only exists after a deliberate press on the trigger.
              autoFocus
              onChange={(e) => setQ(e.target.value)}
            />
            {groups.length === 0 && <div className="wb-boardswitch-empty">No board matches “{q.trim()}”.</div>}
            {groups.map(([client, boards]) => (
              <div key={client}>
                <div className="wb-boardswitch-group">{client}</div>
                {boards.map((b) => (
                  <Link
                    key={b.slug}
                    href={b.href}
                    role="menuitem"
                    className={`wb-boardswitch-item${b.slug === currentSlug ? " is-current" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {b.name}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
