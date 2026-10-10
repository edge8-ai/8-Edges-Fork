"use client";

import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import { noticeSomething } from "@/entities/coaching/lib/actions";
import { NoticeSomething } from "./NoticeSomething";
import { type ActionResult } from "./shared";

// Noticing something (L.4). On the person tab rather than the agenda, because
// it is not a thing to raise in the 1-1 — it is a sentence that lands on their
// own page whenever you write it.
export function NoticedCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Noticed</div>
      <div className="admin-hint">
        One sentence about a specific piece of work, tied to a value. Only {detail.member.name} sees it, and it is
        never counted, listed across people or compared with anybody.
      </div>
      <NoticeSomething
        values={detail.noticeableValues}
        busy={busy}
        onWrite={(input, onOk) => run("Noticed", () => noticeSomething(detail.profileId, input), onOk)}
      />
      {detail.noticed.length > 0 && (
        <div className="admin-coach-ocean-list">
          {detail.noticed.map((n) => (
            <div key={n.id} className="admin-coach-block">
              <span className="admin-eyebrow">
                {n.noticedOn}
                {n.valueTitle ? ` · ${n.valueTitle}` : ""}
              </span>
              <p>{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
