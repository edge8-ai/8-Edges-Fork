// Who was in a taught session, from its transcript (English Program PR 6, ADR
// 0016 amended): the speaker names on "Name: text" lines and on a participants
// header, matched to the roster by any name a person goes by, diacritics
// folded. A roster member the transcript heard is attended; one it did not is
// absent; a learner or the organiser may correct either (lib/attendance-word).
// Pure, so the manual upload and the Lark pickup agree.
import { foldDiacritics } from "@/kernel/config/people-name";

const NAME_LABEL = /^[\p{Lu}][\p{L}.'-]*(?:\s+[\p{Lu}][\p{L}.'-]*){0,4}$/u;

/** Distinct speaker names: labels that look like names and open at least one line, plus a participants header. */
export function speakersIn(transcript: string): string[] {
  const names = new Set<string>();
  for (const raw of transcript.split("\n")) {
    const line = raw.trim();
    const header = line.match(/^(participants|attendees)\s*:\s*(.+)$/i);
    if (header) {
      for (const n of header[2]!.split(/[,;]/)) if (n.trim()) names.add(n.trim());
      continue;
    }
    const m = line.match(/^([^:]{1,60}):\s+\S/);
    if (!m) continue;
    const label = m[1]!.trim();
    if (NAME_LABEL.test(label)) names.add(label);
  }
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
