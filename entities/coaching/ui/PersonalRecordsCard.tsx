"use client";

import type { PersonalRecords } from "@/entities/coaching/lib/growth";
import { formatDate } from "@/kernel/ui/format";

// Personal records, only against yourself (K.30): the meeting where the most
// of what was promised was kept, the quarter the goal moved furthest, and how
// many pre-meeting forms carried an answer. Nothing here compares with anyone
// else, and a record that does not exist yet is simply not shown.

export function PersonalRecordsCard({ records }: { records: PersonalRecords }) {
  const rows: { label: string; value: string; note: string }[] = [];
  if (records.bestMeeting) {
    rows.push({
      label: "Most kept in one meeting",
      value: `${records.bestMeeting.kept} of ${records.bestMeeting.made} kept`,
      note: formatDate(records.bestMeeting.heldOn),
    });
  }
  if (records.goalMovedMost) {
    const unit = records.goalMovedMost.unit ? ` ${records.goalMovedMost.unit}` : "";
    rows.push({
      label: "The quarter the goal moved most",
      value: `+${records.goalMovedMost.moved}${unit}`,
      note: `${records.goalMovedMost.quarterLabel} · ${records.goalMovedMost.title}`,
    });
  }
  if (records.formsWritten > 0) {
    rows.push({
      label: "Pre-meeting forms written",
      value: String(records.formsWritten),
      note: records.formsWritten === 1 ? "the first one" : "ninety seconds each time",
    });
  }
  if (rows.length === 0) return null;
  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Your own marks</div>
      <div className="admin-hint">Yours alone, from your own history. Nobody else&apos;s numbers are on this page.</div>
      <dl className="coach-records">
        {rows.map((r) => (
          <div key={r.label} className="coach-record">
            <dt className="admin-glance-label">{r.label}</dt>
            <dd>
              <span className="coach-record-value">{r.value}</span>
              <span className="admin-cell-muted"> {r.note}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
