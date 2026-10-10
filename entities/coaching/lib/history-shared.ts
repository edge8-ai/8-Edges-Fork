// The pure half of the member's History tab (K.17, spec 2.5) and of the
// first-visit rule (K.16, spec 2.7). Everything here is a function of plain
// values, so the heatmap shade, the timeline's one-line summary, the brag
// document and the "nothing has started yet" decision are all testable without
// a database or a browser — and the client components may import this file
// without dragging the server-only data layer into their bundle.

export type BragMeeting = {
  heldOn: string;
  // The published shared recap, or null for a meeting whose recap was never
  // shared. The brag document keeps the meeting either way: it happened.
  sharedSummaryMarkdown: string | null;
  // What the member wrote before the meeting (K.15). Absent until that card
  // lands, which is why every one is nullable.
  movedMd: string | null;
  stuckMd: string | null;
  talkMd: string | null;
  // Titles of the commitments kept on this meeting, in board order.
  keptTitles: string[];
};

// How dark a meeting's square is: 0 (the track colour, nothing kept) through 3
// (everything kept). Thirds, so a meeting is never punished for having made
// more commitments than another — it is a ratio, and a miss fades rather than
// resetting anything (spec §9, the GitHub contribution graph).
//
// A meeting with no commitments made is level 0: there is nothing to shade,
// and inventing a full square for an empty meeting would read as a claim.
export function heatLevel(kept: number, made: number): 0 | 1 | 2 | 3 {
  if (made <= 0 || kept <= 0) return 0;
  const ratio = Math.min(1, kept / made);
  if (ratio <= 1 / 3) return 1;
  if (ratio <= 2 / 3) return 2;
  return 3;
}

// The first sentence of a markdown body, as the collapsed timeline row shows
// it. Markdown is stripped rather than rendered because this line sits inside a
// <summary>; a heading or a bullet marker leaking through would read as noise.
export function firstSentence(markdown: string | null, maxLength = 180): string {
  if (!markdown) return "";
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  const end = plain.search(/[.!?](\s|$)/);
  const sentence = end === -1 ? plain : plain.slice(0, end + 1);
  return sentence.length > maxLength ? `${sentence.slice(0, maxLength - 1).trimEnd()}…` : sentence;
}

// The member's brag document (spec §9, Julia Evans): their meetings, their own
// words and the commitments they kept, in one markdown file they own. Written
// from rows the loader already has, so the builder itself touches nothing.
// The notes the member wrote between meetings (K.19) come first, newest first:
// they are the things noticed in the moment, and the point of the document is
// that those are not lost by the time the meetings are read back.
export function buildBragDocument(input: {
  memberName: string;
  generatedOn: string;
  meetings: BragMeeting[];
  notes?: { on: string; body: string }[];
  // What somebody noticed about their work (L.4) and the group coaching they
  // attended (L.8). Both belong in a brag document for the same reason the 1-1s
  // do: they are things that happened, and the point of this document is that
  // the member does not have to remember them.
  noticed?: { on: string; body: string; writtenBy: string; valueTitle: string | null }[];
  sessions?: { on: string; title: string }[];
}): string {
  const lines: string[] = [`# ${input.memberName}: what I have been doing`, ""];
  lines.push(`Written from my 1-1s on ${input.generatedOn}.`, "");
  const notes = input.notes ?? [];
  if (notes.length > 0) {
    lines.push("## Worth remembering", "");
    for (const n of notes) lines.push(`- ${n.on}: ${n.body}`);
    lines.push("");
  }
  const noticed = input.noticed ?? [];
  if (noticed.length > 0) {
    lines.push("## What people noticed", "");
    for (const n of noticed) {
      lines.push(`- ${n.on}${n.valueTitle ? ` (${n.valueTitle})` : ""}: "${n.body}" — ${n.writtenBy}`);
    }
    lines.push("");
  }
  const sessions = input.sessions ?? [];
  if (sessions.length > 0) {
    lines.push("## Group coaching I was in", "");
    for (const g of sessions) lines.push(`- ${g.on}: ${g.title}`);
    lines.push("");
  }
  if (input.meetings.length === 0) {
    lines.push("No 1-1s yet. This document fills itself in as they happen.", "");
    return lines.join("\n");
  }
  for (const m of input.meetings) {
    lines.push(`## ${m.heldOn}`, "");
    const answers: [string, string | null][] = [
      ["What moved", m.movedMd],
      ["What was stuck", m.stuckMd],
      ["What I wanted to talk about", m.talkMd],
    ];
    for (const [label, body] of answers) {
      if (body?.trim()) lines.push(`**${label}**`, "", body.trim(), "");
    }
    if (m.keptTitles.length > 0) {
      lines.push("**Kept**", "");
      for (const t of m.keptTitles) lines.push(`- ${t}`);
      lines.push("");
    }
    if (m.sharedSummaryMarkdown?.trim()) {
      lines.push("**Recap**", "", m.sharedSummaryMarkdown.trim(), "");
    }
  }
  return lines.join("\n");
}

// Each answer row belongs to the first meeting held on or after it was written:
// the member fills the form in the days before a 1-1, so the nearest meeting
// ahead of it is the one it was written for. Meetings arrive newest-first.
export function assignAnswersToMeetings(
  meetings: { id: string; heldOn: string }[],
  answers: { sentAt: string; movedMd: string | null; stuckMd: string | null; talkMd: string | null }[],
): Map<string, { movedMd: string | null; stuckMd: string | null; talkMd: string | null }> {
  const byMeeting = new Map<string, { movedMd: string | null; stuckMd: string | null; talkMd: string | null }>();
  const oldestFirst = [...meetings].sort((a, b) => a.heldOn.localeCompare(b.heldOn));
  for (const a of answers) {
    const day = a.sentAt.slice(0, 10);
    const target = oldestFirst.find((m) => m.heldOn >= day);
    if (!target || byMeeting.has(target.id)) continue;
    byMeeting.set(target.id, { movedMd: a.movedMd, stuckMd: a.stuckMd, talkMd: a.talkMd });
  }
  return byMeeting;
}

// The first-visit state (spec 2.7): a member with no active goal and no 1-1
// behind them sees one block and nothing else. Both halves matter — a member
// who has met their coach has a page worth reading even with no goal yet, and
// a goal is worth showing before the first meeting.
export function isFirstVisit(input: { activeGoals: number; heldMeetings: number }): boolean {
  return input.activeGoals === 0 && input.heldMeetings === 0;
}

// "Moved from Sep 16, 2026: Michael was travelling" — the one line a moved 1-1
// carries (K.33). The coach's log and the member's History both show it, and
// they show the same words because the sentence is built here once.
export function moveLine(movedFrom: string | null, moveReason: string | null, formatDate: (iso: string) => string): string | null {
  if (!movedFrom) return null;
  const why = moveReason?.trim();
  return `Moved from ${formatDate(movedFrom)}${why ? `: ${why}` : ""}`;
}
