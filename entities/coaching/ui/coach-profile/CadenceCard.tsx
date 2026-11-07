"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import type { RecapLanguage, RetentionRoot } from "@/entities/coaching/lib/types";
import { RECAP_LANGUAGE_LABELS, RETENTION_ROOT_LABELS } from "@/entities/coaching/lib/types";
import { setCadence, setOneOnOnesPaused, setRecapLanguage, setRetentionRoot } from "@/entities/coaching/lib/actions";
import { type ActionResult } from "./shared";

export function CadenceCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const [cadence, setCadenceDays] = useState(String(detail.cadenceDays));

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Cadence &amp; retention read</div>
      {/* What the member said suits them (K.34). Theirs to set on My Coach;
          shown here so the coach can book around it. The day is booked in the
          1-1s card; the cadence only sets how far the suggestion reaches. */}
      <div className="admin-hint">
        {detail.preferredTime
          ? `Their 1-1 time: ${detail.preferredTime} (set on their My Coach page). Book the day from the Next 1-1 tab.`
          : "No 1-1 time yet; they set one on their My Coach page. Book the day from the Next 1-1 tab."}
      </div>
      <div className="admin-coach-field-row">
        <div className="admin-field">
          <label className="admin-label" htmlFor="cadence-days">
            Cadence (days)
          </label>
          <input
            id="cadence-days"
            className="admin-input"
            type="number"
            min={7}
            max={90}
            value={cadence}
            onChange={(e) => setCadenceDays(e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="retention-root">
            Loose engagement root (only you see this)
          </label>
          <select
            id="retention-root"
            className="admin-input"
            value={detail.retentionRoot ?? ""}
            disabled={busy}
            onChange={(e) =>
              run("Retention", () =>
                setRetentionRoot(detail.profileId, (e.target.value || null) as RetentionRoot | null),
              )
            }
          >
            <option value="">-</option>
            {Object.entries(RETENTION_ROOT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="recap-language">
            Recap language (the shared recap only)
          </label>
          <select
            id="recap-language"
            className="admin-input"
            value={detail.recapLanguage ?? ""}
            disabled={busy}
            onChange={(e) =>
              run("Recap language", () =>
                setRecapLanguage(detail.profileId, (e.target.value || null) as RecapLanguage | null),
              )
            }
          >
            <option value="">Follow the transcript</option>
            {Object.entries(RECAP_LANGUAGE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="admin-form-actions">
        <button
          className="admin-btn admin-btn--primary"
          disabled={busy}
          onClick={() => run("Cadence", () => setCadence(detail.profileId, Number(cadence)))}
        >
          Save cadence
        </button>
        <button
          className="admin-btn"
          disabled={busy}
          onClick={() =>
            run(detail.oneOnOnesPausedAt ? "Resume 1-1s" : "Pause 1-1s", () =>
              setOneOnOnesPaused(detail.profileId, !detail.oneOnOnesPausedAt),
            )
          }
        >
          {detail.oneOnOnesPausedAt ? "Resume 1-1s" : "Pause 1-1s"}
        </button>
        <span className="admin-hint u-m-0">
          {detail.oneOnOnesPausedAt
            ? "Paused: no day is suggested and no prep is written until you resume."
            : "The suggested day follows the last 1-1 by the cadence; nothing is booked until you book it."}
        </span>
      </div>
    </section>
  );
}
