"use client";

/** Prints the page. It runs no action, so there is nothing for it to hide from anyone. */
export function PrintButton() {
  return <button type="button" className="admin-btn admin-btn--primary" onClick={() => window.print()}>Print</button>;
}
