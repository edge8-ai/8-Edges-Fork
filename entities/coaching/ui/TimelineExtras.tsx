"use client";

import Link from "next/link";
import { formatDate } from "@/kernel/ui/format";
import type { TimelineExtra } from "@/entities/coaching/lib/data/my-timeline";

// The two things on the history timeline that are not 1-1s (L.4, L.8).
//
// They sit BETWEEN the meetings, in date order, as further things that
// happened — which is what they are. Neither gets a section of its own, and
// that is the design: a "Recognition" panel would be a wall, and a wall is a
// feed, and a feed is the thing proposal 4 deliberately left behind.
//
// Nothing here is counted. There is no "3 noticed this quarter" anywhere in
// this component or the page that renders it, and adding one would turn a kind
// sentence into a score.

export function TimelineExtraRow({ extra }: { extra: TimelineExtra }) {
  if (extra.kind === "session") {
    return (
      <div className="coach-tl-row">
        <div className="coach-tl-date">{formatDate(extra.on)}</div>
        <div>
          <div className="coach-tl-kind">Group coaching</div>
          <div className="coach-tl-title">
            <Link href={`/team/coaching-sessions/${extra.sessionId}`}>{extra.title}</Link>
          </div>
        </div>
      </div>
    );
  }

  const { noticed } = extra;
  return (
    <div className="coach-tl-row">
      <div className="coach-tl-date">{formatDate(extra.on)}</div>
      <div>
        <div className="coach-tl-kind coach-tl-kind--noticed">
          Noticed{noticed.valueTitle ? ` · ${noticed.valueTitle}` : ""}
        </div>
        <p className="coach-tl-body">&ldquo;{noticed.body}&rdquo;</p>
        <div className="admin-cell-muted">
          {noticed.writtenBy}
          {noticed.subject ? ` · on ${noticed.subject}` : ""}
        </div>
      </div>
    </div>
  );
}
