"use client";

import { useState } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { ExternalLink } from "@/kernel/ui/ExternalLink";
import { formatDate, humanize } from "@/kernel/ui/format";
import { CompanyEditForm, type EditableCompany } from "./CompanyEditForm";

type DetailsCompany = EditableCompany & { created_at: string };

// Compact, read-only company summary that swaps to the shared autosave form
// on demand. Keeping the tall form collapsed by default is what stops the
// left rail from towering over the activity column and leaving a void.
export function CompanyDetailsCard({
  company,
  referredBy,
}: {
  company: DetailsCompany;
  referredBy: string[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="admin-card admin-section-card">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Details</h2>
        {!editing && (
          <button type="button" className="admin-btn" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <CompanyEditForm company={company} showNotes onDone={() => setEditing(false)} />
      ) : (
        <>
          <dl className="admin-kv">
            <dt>Website</dt>
            {/* A stored value that is not a link (two rows on 2026-09-23, written
                before the writers checked) shows as plain text, so it can be seen
                and corrected rather than looking empty. */}
            <dd>
              <ExternalLink href={company.website_url} fallback={company.website_url || "—"}>
                {company.website_url}
              </ExternalLink>
            </dd>
            <dt>Industry</dt>
            <dd>{company.industry_normalized || "—"}</dd>
            <dt>Size</dt>
            <dd>{company.size_band || "—"}</dd>
            <dt>Country</dt>
            <dd>{company.country || "—"}</dd>
            <dt>Priority</dt>
            <dd>{company.priority ? <Badge>{humanize(company.priority)}</Badge> : "—"}</dd>
            <dt>Added</dt>
            <dd>{formatDate(company.created_at)}</dd>
            {referredBy.length > 0 && (
              <>
                <dt>Referred by</dt>
                <dd>{referredBy.join(", ")}</dd>
              </>
            )}
          </dl>
          {company.notes && (
            <div className="admin-divider-top">
              <div className="u-label u-strong u-mb-2">
                Notes
              </div>
              <p
                className="u-m-0 u-sm u-ink-2 u-clamp-4"
              >
                {company.notes}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
