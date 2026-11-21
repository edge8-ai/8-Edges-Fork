"use client";

// Opens the browser's print dialog (CR.3.4). The page lays itself out for
// paper there (PrintSheet), and the same dialog saves a PDF.
export function PrintButton() {
  return (
    <button type="button" className="admin-btn admin-btn--sm" onClick={() => window.print()}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 6V2.5h7V6M4.5 11.5H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-1.5M4.5 9.5h7v4h-7z" />
      </svg>
      Print
    </button>
  );
}
