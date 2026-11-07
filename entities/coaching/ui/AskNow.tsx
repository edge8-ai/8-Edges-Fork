"use client";

// "Ask now" on a Blocked card (K.22). A stuck commitment carries the member's
// note about why; this is how that note reaches the coach today rather than at
// the next 1-1. One click, one plain message, once per card per day.
//
// It lives in its own file because CommitmentCard.tsx is at its size ceiling,
// and because the "already asked today" reading is a small rule of its own.

// The Saigon calendar date of a timestamp, so the card agrees with the server's
// once-per-day rule wherever the browser happens to be.
function saigonDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
}

export function askedToday(sentAt: string | null, now: Date = new Date()): boolean {
  if (!sentAt) return false;
  return saigonDateOf(sentAt) === saigonDateOf(now.toISOString());
}

export function AskNow({
  sentAt,
  busy,
  onAsk,
}: {
  sentAt: string | null;
  busy: boolean;
  onAsk: () => void;
}) {
  if (askedToday(sentAt))
    return <div className="admin-cboard-card-meta">Asked today · your coach has it.</div>;
  return (
    <div className="admin-cboard-card-foot">
      <button type="button" className="admin-btn" disabled={busy} onClick={onAsk}>
        Ask now
      </button>
    </div>
  );
}
