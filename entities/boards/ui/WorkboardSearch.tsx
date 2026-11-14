"use client";

/**
 * The board's search box (W.12). It narrows on every keystroke — the board
 * already holds every card, so there is nothing to wait for — and the term is
 * mirrored into ?q= by useWorkboardFilters, debounced, so a search can be sent
 * to someone and survives a refresh.
 *
 * Shaped and styled like kernel/ui/TableSearch, which cannot be reused as-is:
 * that one pushes a URL for a server-rendered list to re-read, and this board
 * filters in the browser. Split out of WorkboardToolbar.tsx when W.26 rebuilt
 * that file; it was the one part of the toolbar the rebuild did not touch.
 */
export function BoardSearch({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="admin-search">
      <svg className="admin-search-icon" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search cards…"
        aria-label="Search cards"
        // Escape clears without reaching for the mouse, and without closing a
        // drawer that is not open.
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
      />
      {value && (
        <button type="button" className="admin-search-clear" aria-label="Clear search" onClick={() => onChange("")}>
          <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
