"use client";

// HR's 1–5 stars, shown in the HR assessment card. Clicking the current rating clears it.
export function HeaderStars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <span className="u-row u-gap-1" role="group" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-pressed={value != null && n <= value}
          onClick={() => onChange(value === n ? null : n)}
          className={`admin-star-btn${value != null && n <= value ? " is-on" : ""}`}
        >
          {value != null && n <= value ? "★" : "☆"}
        </button>
      ))}
    </span>
  );
}
