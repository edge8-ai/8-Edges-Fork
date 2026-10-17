"use client";

// Compact 1–5 stars for the header. Clicking the current rating clears it.
export function HeaderStars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <span className="u-row u-gap-1" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-pressed={value != null && n <= value}
          onClick={() => onChange(value === n ? null : n)}
          className={`admin-star-btn admin-star-btn--sm${value != null && n <= value ? " is-on" : ""}`}
        >
          {value != null && n <= value ? "★" : "☆"}
        </button>
      ))}
    </span>
  );
}
