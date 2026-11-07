// The programme read's two marks (TR.7): a lock for a slice that is hidden or
// refused, and a star for the average. Inline strokes, coloured by the CSS.

export function LockIcon() {
  return (
    <svg className="tr-pr-ico" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function StarIcon({ className = "tr-pr-star" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  );
}
