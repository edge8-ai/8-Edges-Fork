// Who was in a taught session, from its transcript (English Program PR 6, ADR
// 0016 amended): the speaker names on "Name: text" lines, on Lark's
// "Name HH:MM:SS.mmm" turn headers (the words on the lines below) and on a
// participants header, matched to the roster by any name a person goes by, diacritics
// folded. A roster member the transcript heard is attended; one it did not is
// absent; a learner or the organiser may correct either (lib/attendance-word).
// Pure, so the manual upload and the Lark pickup agree.
import { foldDiacritics } from "@/kernel/config/people-name";

const NAME_LABEL = /^[\p{Lu}][\p{L}.'-]*(?:\s+[\p{Lu}][\p{L}.'-]*){0,4}$/u;

// Lark Minutes writes a turn as its speaker and a timestamp on one line
// ("Hoan Ngo 00:01:23.456", sometimes "Hoan Ngo 01:23") and the words on the
// lines below it.
const LARK_TURN = /^(.{1,60}?)\s+(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?$/;

/** One speaker's turn: who spoke and what they said. */
export type Turn = { speaker: string; text: string };

/**
 * Every spoken turn, in order: a "Name: text" line, or a Lark turn header and
 * the lines under it up to the next header. A participants header is not a
 * turn, and neither is a line whose label does not look like a name.
 */
export function turnsIn(transcript: string): Turn[] {
  const turns: Turn[] = [];
  let open: Turn | null = null;
  for (const raw of transcript.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(participants|attendees)\s*:/i.test(line)) {
      open = null;
      continue;
    }
    const lark = line.match(LARK_TURN);
    if (lark && NAME_LABEL.test(lark[1]!.trim())) {
      open = { speaker: lark[1]!.trim(), text: "" };
      turns.push(open);
      continue;
    }
    const m = line.match(/^([^:]{1,60}):\s+(\S.*)$/);
    if (m && NAME_LABEL.test(m[1]!.trim())) {
      open = null;
      turns.push({ speaker: m[1]!.trim(), text: m[2]!.trim() });
      continue;
    }
    if (open) open.text = open.text ? `${open.text} ${line}` : line;
  }
  return turns.filter((t) => t.text !== "");
}

/** Distinct speaker names: a participants header, then everyone with a turn, in the order they first spoke. */
export function speakersIn(transcript: string): string[] {
  const names = new Set<string>();
  for (const raw of transcript.split("\n")) {
    const header = raw.trim().match(/^(participants|attendees)\s*:\s*(.+)$/i);
    if (header) for (const n of header[2]!.split(/[,;]/)) if (n.trim()) names.add(n.trim());
  }
  for (const t of turnsIn(transcript)) names.add(t.speaker);
  return [...names];
}

export type RosterPerson = { id: string; names: (string | null | undefined)[] };

/** The names a person may be called by in a transcript: each full name, and each word of a preferred or display name longer than one letter. */
export function namesFor(p: RosterPerson): string[] {
  const out = new Set<string>();
  for (const n of p.names) {
    const v = (n ?? "").trim();
    if (!v) continue;
    out.add(v);
    for (const w of v.split(/\s+/)) if (w.length > 1) out.add(w);
  }
  return [...out];
}

const fold = (s: string) => foldDiacritics(s.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim());

/**
 * One status per roster member: attended when any of their names is a speaker
 * (whole name, or a whole word of a speaker's name), absent otherwise. A word
 * that would match two people is ignored for both, so nobody is marked by
 * another's name.
 */
export function matchRoster(speakers: readonly string[], roster: readonly RosterPerson[]): Map<string, "attended" | "absent"> {
  const said = speakers.map(fold);
  const words = new Set(said.flatMap((s) => s.split(" ")));
  const claims = new Map<string, Set<string>>();
  for (const p of roster) {
    for (const n of namesFor(p)) {
      const f = fold(n);
      if (f.length < 2) continue;
      const hit = said.some((s) => s === f) || (!f.includes(" ") && words.has(f));
      if (!hit) continue;
      if (!claims.has(f)) claims.set(f, new Set());
      claims.get(f)!.add(p.id);
    }
  }
  const out = new Map<string, "attended" | "absent">();
  for (const p of roster) {
    const mine = [...claims.entries()].filter(([, ids]) => ids.has(p.id) && ids.size === 1);
    out.set(p.id, mine.length > 0 ? "attended" : "absent");
  }
  return out;
}
