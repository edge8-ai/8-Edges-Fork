import type { Learner, LearnerData, MicroSession } from "./learner-progress";

// Personal sections: placeholders in a broadcast body filled per recipient at
// send time from their learning-platform progress, beside {first_name}. Someone
// the platform does not know gets the general line instead, never a blank that
// reads like a mistake.

const TOKENS = {
  certification: "{certification_progress}",
  coaching: "{coaching_progress}",
  microSession: "{micro_session}",
} as const;

export const PERSONAL_SECTION_TOKENS = Object.values(TOKENS);

export function hasPersonalSections(bodyMd: string): boolean {
  return PERSONAL_SECTION_TOKENS.some((t) => bodyMd.includes(t));
}

// The track a line talks about: the furthest along that is not finished, else a finished one.
function focusTrack(learner: Learner) {
  const open = learner.tracks.filter((t) => !t.complete).sort((a, b) => b.completed / Math.max(b.total, 1) - a.completed / Math.max(a.total, 1));
  return open[0] ?? learner.tracks[0] ?? null;
}

export function personalSections(learner: Learner | undefined, data: Pick<LearnerData, "microSessions" | "startUrl"> | null): Record<string, string> {
  const track = learner ? focusTrack(learner) : null;
  const certification = !track
    ? data?.startUrl
      ? `You haven't started a certification yet. [Pick your track](${data.startUrl}).`
      : ""
    : track.complete
      ? `You've completed your ${track.title} certification. Well done.`
      : track.completed >= track.total
        ? `You've finished all ${track.total} units of your ${track.title} certification, so coaching is what's left.`
        : `You're ${track.completed} of ${track.total} units into your ${track.title} certification.`;

  const coaching = !track || track.coachingRequired === 0
    ? "Coaching sessions count toward your certification."
    : track.coachingAttended >= track.coachingRequired
      ? `You've done all ${track.coachingRequired} coaching sessions your certification needs, so join whenever it helps.`
      : `You've attended ${track.coachingAttended} of the ${track.coachingRequired} coaching sessions your certification needs.`;

  // The session after the last one they passed, in the platform's order, so each
  // learner is pointed forward from where they are rather than all at the first.
  const sessions = data?.microSessions ?? [];
  const lastPassed = sessions.reduce((at, s, i) => (learner?.passedCourseIds.has(s.id) ? i : at), -1);
  const unpassed = (s: MicroSession) => !learner?.passedCourseIds.has(s.id);
  const next: MicroSession | undefined = sessions.slice(lastPassed + 1).find(unpassed) ?? sessions.find(unpassed);
  const microSession = next ? `**[${next.title}](${next.url})**` : "";

  return { [TOKENS.certification]: certification, [TOKENS.coaching]: coaching, [TOKENS.microSession]: microSession };
}

export function fillPersonalSections(bodyMd: string, sections: Record<string, string>): string {
  return Object.entries(sections).reduce((md, [token, text]) => md.split(token).join(text), bodyMd);
}
