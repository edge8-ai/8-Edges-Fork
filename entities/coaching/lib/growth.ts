// The pure half of "gamification that fits the rules" (K.30). Everything here
// is a function of plain values the page already holds, so nothing new is
// stored and every rule can be read and tested without a database.
//
// The rules that shape it: nothing scores or ranks a person; a miss is never
// counted and nothing decays; every figure is about the member's own cards,
// meetings and goal, compared only with their own earlier self.

// ─── The ring on the strip's commitments cell ────────────────────────────
// Closes when every commitment promised for the current 1-1 is kept. "For the
// current 1-1" means drafted on the last held meeting: those are the cards the
// member is carrying into the next one. With nothing promised there is no ring
// to close, so it stays open rather than closing for free.
export type RingState = { made: number; kept: number; closed: boolean };

export function ringState(
  commitments: { owner: string; status: string; oneOnOneId: string | null }[],
  lastHeldMeetingId: string | null,
): RingState {
  if (!lastHeldMeetingId) return { made: 0, kept: 0, closed: false };
  const promised = commitments.filter(
    (c) => c.owner === "member" && c.oneOnOneId === lastHeldMeetingId && c.status !== "dropped",
  );
  const kept = promised.filter((c) => c.status === "completed").length;
  return { made: promised.length, kept, closed: promised.length > 0 && kept === promised.length };
}

// ─── The plant on the Overview ───────────────────────────────────────────
// One stage per five commitments kept over the whole history, up to the last
// stage. It never wilts: the input is a count of kept cards, which only grows.
export const PLANT_STAGES = 5;
export const KEPT_PER_STAGE = 5;

export function plantStage(totalKept: number): number {
  if (totalKept <= 0) return 0;
  return Math.min(PLANT_STAGES, Math.floor(totalKept / KEPT_PER_STAGE));
}

// The one-sentence title under the plant, about the cards, never the person.
export function plantTitle(totalKept: number): string {
  const stage = plantStage(totalKept);
  if (totalKept === 0) return "A seed. It grows with every commitment you keep.";
  if (stage === 0) return `${totalKept} kept so far. Five grows the first leaf.`;
  if (stage >= PLANT_STAGES) return `${totalKept} commitments kept. It is fully grown, and it stays that way.`;
  const next = (stage + 1) * KEPT_PER_STAGE;
  return `${totalKept} commitments kept. The next leaf comes at ${next}.`;
}

// ─── Unlocks by doing ────────────────────────────────────────────────────
// Parts of the page appear once there is something for them to show: History
// and the heatmap after the first held 1-1, the ladder's next rung after the
// first goal is saved, the brag document at the third held 1-1.
export type Unlocks = { history: boolean; nextRung: boolean; bragDocument: boolean };

export const BRAG_UNLOCK_MEETINGS = 3;

export function unlocks(input: { heldMeetings: number; goalsSaved: number }): Unlocks {
  return {
    history: input.heldMeetings >= 1,
    nextRung: input.goalsSaved >= 1,
    bragDocument: input.heldMeetings >= BRAG_UNLOCK_MEETINGS,
  };
}

// ─── Personal records, only against yourself ─────────────────────────────
export type PersonalRecords = {
  // The meeting where the most of what was promised was kept; null until a
  // meeting has any commitment made on it.
  bestMeeting: { heldOn: string; kept: number; made: number } | null;
  // The quarter whose goal moved furthest from its start; null until a goal
  // has both a start and a current value.
  goalMovedMost: { quarterLabel: string; title: string; moved: number; unit: string | null } | null;
  // How many pre-meeting forms carried at least one answer.
  formsWritten: number;
};

export function personalRecords(input: {
  meetings: { heldOn: string; kept: number; made: number }[];
  goals: {
    quarterLabel: string | null;
    title: string;
    startValue: number | null;
    currentValue: number | null;
    metricUnit: string | null;
  }[];
  forms: { moved: string | null; stuck: string | null; talk: string | null }[];
}): PersonalRecords {
  let bestMeeting: PersonalRecords["bestMeeting"] = null;
  for (const m of input.meetings) {
    if (m.made <= 0) continue;
    const ratio = m.kept / m.made;
    const bestRatio = bestMeeting ? bestMeeting.kept / bestMeeting.made : -1;
    // A higher share wins; the same share with more kept wins; a tie keeps
    // the earlier one found, which is the more recent meeting (newest first).
    if (ratio > bestRatio || (ratio === bestRatio && bestMeeting && m.kept > bestMeeting.kept)) {
      bestMeeting = { heldOn: m.heldOn, kept: m.kept, made: m.made };
    }
  }

  let goalMovedMost: PersonalRecords["goalMovedMost"] = null;
  for (const g of input.goals) {
    if (g.startValue === null || g.currentValue === null || !g.quarterLabel) continue;
    const moved = g.currentValue - g.startValue;
    if (moved <= 0) continue;
    if (!goalMovedMost || moved > goalMovedMost.moved) {
      goalMovedMost = { quarterLabel: g.quarterLabel, title: g.title, moved, unit: g.metricUnit };
    }
  }

  const formsWritten = input.forms.filter((f) => Boolean(f.moved?.trim() || f.stuck?.trim() || f.talk?.trim())).length;
  return { bestMeeting, goalMovedMost, formsWritten };
}

// What the "What I'm on" cell says under its figure. A zero is never the
// headline of a member's own summary: "0 kept since Aug 26" reported three
// weeks of nothing in the one place the page speaks for them (review,
// 2026-09-18). With nothing kept this cycle the line reaches for what is
// true and forward-looking — everything kept so far, or a fresh start — and
// only says "since <date>" when there is something to say about the window.
export function keptNote(input: {
  keptSince: number;
  totalKept: number;
  lastHeldOn: string | null;
  formatDate: (iso: string) => string;
}): string {
  if (input.keptSince > 0) {
    return input.lastHeldOn
      ? `${input.keptSince} kept since ${input.formatDate(input.lastHeldOn)}`
      : `${input.keptSince} kept`;
  }
  if (input.totalKept > 0) return `${input.totalKept} kept in all`;
  return "a fresh cycle";
}
