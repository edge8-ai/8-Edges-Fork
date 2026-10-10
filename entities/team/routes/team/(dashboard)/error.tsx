"use client";

import { useEffect } from "react";

// Route-level error boundary for /team. Rendered inside the (dashboard)
// layout, so the sidebar shell stays put and only the page body is replaced.
// Must be a client component (Next passes { error, reset } to it).
export default function TeamDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No error reporter yet; the digest is what Vercel's logs key on.
    console.error("[team] route error", error.digest ?? error.message, error);
  }, [error]);

  return (
    <div className="admin-content">
      <div className="admin-page-head">
        <div>
          <div className="admin-eyebrow">Team</div>
          <h1 className="admin-page-title">Something went wrong</h1>
          <p className="admin-page-sub">This page hit an error while loading. Trying again usually fixes it.</p>
        </div>
      </div>
      <div className="admin-card admin-error-card">
        <div className="admin-alert admin-alert--err" role="alert">
          {error.digest ? `Reference: ${error.digest}` : error.message || "Unexpected error"}
        </div>
        <div>
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
