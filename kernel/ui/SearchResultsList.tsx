"use client";

// The palette's results (S.1): one group per kind, each hit an option the input
// points at through aria-activedescendant, so the input keeps real focus and the
// highlighted option carries the visible indicator. A failed group says so
// instead of showing nothing. A plain click opens the hit in place; a modified
// click is left to the browser, so a hit can still open in a new tab.
import type { SearchGroup } from "@/kernel/shell/search";

export const optionId = (ids: string, index: number) => `${ids}-opt-${index}`;

export function SearchResultsList({
  ids,
  groups,
  active,
  onHover,
  onOpen,
}: {
  ids: string;
  groups: readonly SearchGroup[];
  active: number;
  onHover: (index: number) => void;
  onOpen: (href: string) => void;
}) {
  let n = -1;
  return (
    <div id={`${ids}-list`} className="admin-search-results" role="listbox" aria-label="Results">
      {groups.map((g) => (
        <div key={g.kind} role="group" aria-labelledby={`${ids}-g-${g.kind}`} className="admin-search-group">
          <div id={`${ids}-g-${g.kind}`} className="admin-search-group-label">
            {g.label}
          </div>
          {g.failed ? (
            <div className="admin-search-group-failed">Couldn&rsquo;t search {g.label.toLowerCase()} just now.</div>
          ) : (
            g.hits.map((hit) => {
              n += 1;
              const index = n;
              return (
                <a
                  key={hit.id}
                  id={optionId(ids, index)}
                  role="option"
                  aria-selected={index === active}
                  tabIndex={-1}
                  href={hit.href}
                  className={`admin-search-option${index === active ? " is-active" : ""}`}
                  onMouseMove={() => index !== active && onHover(index)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    onOpen(hit.href);
                  }}
                >
                  <span className="admin-search-option-title">{hit.title}</span>
                  {hit.detail && <span className="admin-search-option-detail">{hit.detail}</span>}
                </a>
              );
            })
          )}
        </div>
      ))}
    </div>
  );
}
