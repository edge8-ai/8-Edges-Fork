import type { CommitmentStatus } from "./types";

// The coach's view of what was promised (K.80): the employee's promises
// grouped by where they stand, and the coach's own as a short list. The
// member's page keeps its board; the coach's mirrored it and put everything
// the employee promised into one read-only column, so a stuck promise did not
// read as stuck and a kept one looked open. In a 1-1 those three states are
// the conversation — what is stuck is the first thing to ask about — so they
// are what the coach sees first. Khoa's pick, 2026-10-06.

type PromiseRow = {
  id: string;
  owner: "coach" | "member";
  status: CommitmentStatus;
  statusUpdatedAt: string | null;
  createdAt: string;
};

export type PromiseGroups<P extends PromiseRow> = {
  stuck: P[];
  onIt: P[];
  // Kept since the last session, so the list is what there is to recognise
  // today rather than everything ever done.
  kept: P[];
  mine: P[];
};

const OPEN: CommitmentStatus[] = ["open", "on_track", "needs_attention"];

export function promiseGroups<P extends PromiseRow>(promises: P[], lastHeldOn: string | null): PromiseGroups<P> {
  const theirs = promises.filter((p) => p.owner === "member");
  const keptSince = (p: P) =>
    p.status === "completed" && (lastHeldOn === null || (p.statusUpdatedAt ?? p.createdAt).slice(0, 10) >= lastHeldOn);
  return {
    stuck: theirs.filter((p) => p.status === "blocked"),
    onIt: theirs.filter((p) => OPEN.includes(p.status)),
    kept: theirs.filter(keptSince),
    mine: promises.filter((p) => p.owner === "coach" && (OPEN.includes(p.status) || p.status === "blocked")),
  };
}
