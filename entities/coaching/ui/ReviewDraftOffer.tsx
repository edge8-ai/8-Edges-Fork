"use client";

import Link from "next/link";

// "Your review is open — start from what you already wrote" (L.9).
//
// It appears on the History tab only while a cycle is actually being written,
// beside the brag export it points at. The member has been keeping this account
// all along in their notes and recaps; without this they write it twice, once
// as they go and once from scratch in the self-assessment box.
//
// It is an offer and a link, not a transfer: nothing is copied into the review
// on their behalf, because a self-assessment somebody else filled in is not a
// self-assessment. They export, they read it, they decide what to say.
export function ReviewDraftOffer({ cycleLabel }: { cycleLabel: string | null }) {
  return (
    <div className="coach-review-offer">
      <span>
        Your {cycleLabel ? `${cycleLabel} ` : ""}review is open. Everything below is already your account of the
        period — export it and start from that rather than from a blank box.
      </span>
      <Link href="/team/reviews" className="admin-btn admin-btn--sm">
        Open my review
      </Link>
    </div>
  );
}
