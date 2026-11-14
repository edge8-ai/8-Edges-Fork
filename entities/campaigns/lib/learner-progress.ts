// Learner progress for the personal sections of a broadcast.
//
// This file is an overlay stub for 8-Edges-Fork, and only works while it sits at
// the SAME repo-relative path as the real module — today
// entities/campaigns/lib/learner-progress.ts.
//
// Fork note: upstream reads progress from a partner learning platform. A fork
// has none, so there is no progress to read: personal sections fall back to
// their general wording and the weekly template leaves the coaching date blank.
export type LearnerTrack = { title: string; completed: number; total: number; complete: boolean; coachingAttended: number; coachingRequired: number };
export type Learner = { tracks: LearnerTrack[]; passedCourseIds: Set<string> };
export type MicroSession = { id: string; title: string; url: string };
export type LearnerData = { byEmail: Map<string, Learner>; microSessions: MicroSession[]; startUrl: string };

export async function loadLearners(_emails: string[]): Promise<LearnerData | null> {
  return null;
}

export async function nextCoaching(_after: Date): Promise<{ at: string; signupUrl: string } | null> {
  return null;
}
