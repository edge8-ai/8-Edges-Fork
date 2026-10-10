// Certification progress for the team home.
//
// This file is an overlay stub for 8-Edges-Fork, and only works while it sits at
// the SAME repo-relative path as the real module — today
// entities/team/lib/certifications.ts.
//
// Fork note: upstream reads progress on two tracks from a partner learning
// platform, matching learners by its own email domain — so on any fork the real
// module returns nothing at all, quietly. The sync that populates it is excluded;
// this returns an empty list explicitly, and the home page renders no band.
export type CertStatus = "not_started" | "in_progress" | "certified";

export type CertTrack = {
  slug: string;
  title: string;
  status: CertStatus;
  completedLessons: number;
  totalLessons: number;
};

export function readCertifications(_metadata: unknown): CertTrack[] {
  return [];
}
