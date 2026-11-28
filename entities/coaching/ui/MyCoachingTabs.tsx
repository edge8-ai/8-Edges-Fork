"use client";

// The tab bar of the My Coach page, split out of MyCoachingView for the
// client-component size cap. It renders whatever tabs the view offers, since
// History only appears once the first 1-1 is held (K.30).

export function MyCoachingTabs<T extends string>({
  tabs,
  active,
  counts,
  onSelect,
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  counts: Partial<Record<T, number>>;
  onSelect: (id: T) => void;
}) {
  return (
    <nav className="admin-tabs coach-tabs" role="tablist" aria-label="My coaching sections">
      {tabs.map((t) => {
        const isActive = active === t.id;
        const count = counts[t.id];
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`admin-tab${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
            {typeof count === "number" && count > 0 && <span className="admin-coach-tab-count">{count}</span>}
          </button>
        );
      })}
    </nav>
  );
}
