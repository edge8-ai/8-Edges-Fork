"use client";

import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import { groupForCoach, type CommitmentRow } from "@/entities/coaching/lib/commitment-groups";
import type { MayProp } from "@/kernel/identity/may-prop";
import { CommitmentRowList } from "../CommitmentRowList";
import { ClosedCommitments, CommitmentSection } from "../MyCommitmentList";

// The coach's Commitments tab on one person's page (L.18.4): the same list and
// the same three outcomes the coachee has on theirs, Done, Not doing with a
// reason, Add to Workboard, over both sides of the pair. Every write goes
// through the coach's writers, which check this coach coaches this profile.
// The Session tab's board stays; this is the same promises as a list.
export function CoachCommitmentsCard({ detail, may }: { detail: CoachProfileDetail; may: MayProp }) {
  const heldOn = new Map(detail.meetings.map((m) => [m.id, m.heldOn]));
  const name = detail.member.name;
  const rows: CommitmentRow[] = detail.commitments.map((c) => ({
    id: c.id,
    profileId: detail.profileId,
    side: c.owner === "member" ? "coachee" : "coach",
    owner: c.owner,
    title: c.title,
    status: c.status,
    statusNote: c.statusNote,
    dueOn: c.dueOn,
    createdAt: c.createdAt,
    statusUpdatedAt: c.statusUpdatedAt,
    planMd: c.planMd,
    askNowSentAt: c.askNowSentAt,
    heldOn: c.oneOnOneId ? (heldOn.get(c.oneOnOneId) ?? null) : null,
    personName: c.owner === "member" ? name : null,
    card: detail.commitmentCards[c.id] ?? null,
  }));
  const groups = groupForCoach(rows);
  const boards = detail.boards.map((b) => ({ id: b.id, name: b.name }));

  return (
    <div className="admin-commit-tab">
      <CommitmentSection id="coach-commit-theirs" title={`What ${name} promised`} count={groups.theirs.length}>
        <CommitmentRowList rows={groups.theirs} boards={boards} may={may} empty="Nothing open." />
      </CommitmentSection>
      <CommitmentSection id="coach-commit-mine" title={`What I promised ${name}`} count={groups.mine.length}>
        <CommitmentRowList rows={groups.mine} boards={boards} may={may} empty="Nothing open." />
      </CommitmentSection>
      <ClosedCommitments title="Closed" rows={groups.closed} may={may} />
    </div>
  );
}
