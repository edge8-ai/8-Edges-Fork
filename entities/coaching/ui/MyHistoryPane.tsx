"use client";

import { MyHistory, type HistoryMeetingView } from "./MyHistory";
import type { MemberNoteView } from "./WorthRemembering";
import type { PersonalRecords } from "@/entities/coaching/lib/growth";
import type { SinceLine } from "@/entities/coaching/lib/since-line";
import type { TimelineExtra } from "@/entities/coaching/lib/data/my-timeline";

// The History tab, lifted out of MyCoachingView for the same reason
// NextOneOnOnePane was: the view should read as a map of the page rather than
// a list of every pane's props, and this tab now carries the timeline, the
// extras on it, the records, the notes and the review offer.
export function MyHistoryPane({
  meetings,
  extras,
  reviewCycle,
  notes,
  records,
  bragUnlocked,
  since,
  onGoToBoard,
}: {
  meetings: HistoryMeetingView[];
  extras: TimelineExtra[];
  reviewCycle: string | null;
  notes: MemberNoteView[];
  records: PersonalRecords;
  bragUnlocked: boolean;
  since: SinceLine | null;
  onGoToBoard: () => void;
}) {
  return (
    <div id="coach-history" tabIndex={-1} className="coach-anchor">
      <MyHistory
        meetings={meetings}
        extras={extras}
        reviewCycle={reviewCycle}
        notes={notes}
        records={records}
        bragUnlocked={bragUnlocked}
        since={since}
        onGoToBoard={onGoToBoard}
      />
    </div>
  );
}
