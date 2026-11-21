import type { ReactNode } from "react";
import { approvalsInbox } from "@/kernel/approvals/inbox";
import type { InboxDecisionsSlot } from "../slots";
import { timeAgo } from "@/kernel/ui/format";
import { decideLeaveRequest } from "../lib/leave-decision-actions";
import { InboxDecisionsList, type DecisionEntry } from "./InboxDecisionsList";

// The team Inbox's Decisions (TH.11, approved on the design canvas on 19 Oct
// 2026): everything that waits on the person's decision, as the approvals
// reader lists it (kernel/approvals/inbox): approvals named on them, on a
// role they hold, and the admins' pool they can reach. It used to be the
// /team/approvals page; it now sits in the Inbox, where work communication
// lands, and that page leads here.
//
// Time-off provides it, through the inboxDecisions slot (app/shell.ts),
// because the one decision written in place is leave, and the entity that
// owns a table owns the screen that writes it. Every other row links to
// where it is decided, built by the kernel's approvals presentation, so no
// other entity is reached from here.

/** How far a decision reaches, in plain words rather than "Tier 1" and "Tier 2". */
const REACH: Record<0 | 1 | 2, { label: string; warn: boolean }> = {
  0: { label: "Internal", warn: false },
  1: { label: "Goes to one outside person", warn: false },
  2: { label: "Public or a commitment", warn: true },
};

export const inboxDecisions: NonNullable<InboxDecisionsSlot> = async ({ personId, viewer }): Promise<{ count: number; node: ReactNode }> => {
  const rows = await approvalsInbox(personId, viewer, { surface: "team" });
  const entries: DecisionEntry[] = rows.map((r) => {
    // Leave named on this person is decided in the row by decideLeaveAsManager,
    // which refuses anyone its resolver does not name; leave waiting on the
    // admins is decided on the admin board, which the row links to instead.
    const inline = r.subjectType === "time_off" && r.namedOnMe;
    return {
      id: r.id,
      subjectId: r.subjectId,
      subject: r.subject,
      reach: REACH[r.tier].label,
      reachWarn: REACH[r.tier].warn,
      title: r.title,
      askedBy: r.askedBy,
      asked: timeAgo(r.createdAt),
      whose: r.whose,
      inline,
      href: inline ? null : r.href,
      cta: r.cta,
      facts: r.facts,
    };
  });
  return { count: entries.length, node: <InboxDecisionsList key="decisions" entries={entries} decide={decideLeaveRequest} /> };
};
