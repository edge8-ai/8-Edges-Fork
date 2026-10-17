// Certification progress for Home and My Training.
//
// This file is an overlay stub for 8-Edges-Fork, and only works while it sits at
// the SAME repo-relative path as the real module — today
// entities/training/lib/certifications.ts.
//
// Fork note: upstream reads progress on two tracks from a partner learning
// platform, matching learners by its own email domain — so on any fork the real
// module returns nothing at all, quietly. The sync that populates it is excluded;
// this returns an empty list explicitly, and Home and My Training draw no tracks.
// The rest of the real module's API is kept, with the same shapes, because
// lib/my-training.ts ships to the fork and imports it.
export type CertStatus = "not_started" | "in_progress" | "certified";

export type CertTrack = {
  key: "ai_officer" | "ai_engineer";
  label: string;
  status: CertStatus;
  completed: number;
  total: number;
  micro_done: number;
  micro_required: number;
  coaching_done: number;
  coaching_required: number;
};

export function readCertifications(_metadata: unknown): CertTrack[] {
  return [];
}

export function leftToEarn(track: CertTrack): { modules: number; micro: number; coaching: number } {
  return {
    modules: Math.max(0, track.total - track.completed),
    micro: Math.max(0, track.micro_required - track.micro_done),
    coaching: Math.max(0, track.coaching_required - track.coaching_done),
  };
}

export function hasStarted(track: CertTrack): boolean {
  return track.completed + track.micro_done + track.coaching_done > 0;
}

export function leftInWords(_track: CertTrack): string {
  return "";
}

export function trackPill(_track: CertTrack): { text: string; tone: "ok" | "near" | "plain" } {
  return { text: "Not started", tone: "plain" };
}
