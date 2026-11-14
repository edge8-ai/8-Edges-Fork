// The learning platform as the key-learnings pass sees it.
//
// This file is an overlay stub for 8-Edges-Fork, and only works while it sits at
// the SAME repo-relative path as the real module — today
// entities/coaching/lib/learning-platform.ts.
//
// Fork note: upstream writes each group coaching session's key learnings onto a
// partner learning platform. A fork has none, so the pass is off: it reports
// the reason below and touches nothing. The rest of the real module's API is
// kept, with the same shapes, because lib/key-learnings-sync.ts ships to the
// fork and imports it; none of it is reached while the platform is off.
import type { PlatformCoachingEvent } from "./key-learnings-match";

export type LearningPlatform = { url: string; key: string };

export function learningPlatform(): { ok: true; platform: LearningPlatform } | { ok: false; reason: string } {
  return { ok: false, reason: "no learning platform on this deployment" };
}

export async function listCoachingEvents(
  _p: LearningPlatform,
  _fromISO: string,
  _toISO: string,
): Promise<{ ok: true; events: PlatformCoachingEvent[] } | { ok: false; error: string }> {
  return { ok: false, error: "no learning platform on this deployment" };
}

export async function writeEventLearnings(
  _p: LearningPlatform,
  _liveEventId: string,
  _items: string[],
  _expectedCurrent: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return { ok: false, error: "no learning platform on this deployment" };
}

export function adminSessionUrl(liveEventId: string): string {
  return liveEventId;
}
