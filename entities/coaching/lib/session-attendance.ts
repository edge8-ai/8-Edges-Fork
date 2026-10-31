import { foldDiacritics, personName } from "@/kernel/config/people-name";

// Who was in a group coaching session (L.8).
//
// There is no attendance table. Group sessions are Zoom meetings, and the
// record of who was there is `metadata.attendees` (Zoom's participant list,
// stored from 15 Oct 2026) or, for older sessions, `metadata.speakers` — the
// names the transcript captured. That is a real limitation and this module owns
// it rather than hiding it:
//
// - for an older session it is a SPEAKER list, so somebody who attended and
//   never unmuted is not in it. The timeline therefore says "you spoke at" nothing of the sort; it
//   simply shows the sessions it can prove, and silence about a session is not
//   a claim that the person was absent.
// - names come from whatever people typed into Zoom, so matching is loose on
//   purpose: case, surrounding whitespace and a trailing parenthetical are all
//   ignored, and a person is matched on any of the names we hold for them.
//
// Nothing here counts attendance, and nothing compares it between people: this
// answers "was this session part of my growth history", one person at a time.

/**
 * The names a session's metadata records as present: Zoom's attendee list when
 * the ingest stored one (sessions from 15 Oct 2026), else the speakers parsed
 * from the transcript, which is all older sessions have.
 */
export function sessionPeople(metadata: { attendees?: unknown; speakers?: unknown } | null | undefined): string[] {
  if (Array.isArray(metadata?.attendees) && metadata.attendees.length > 0) return metadata.attendees as string[];
  return Array.isArray(metadata?.speakers) ? (metadata.speakers as string[]) : [];
}

/** Zoom names normalise to lowercase, trimmed, with any "(...)" suffix dropped. */
function normalise(name: string): string {
  return name
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Whether any of a person's known names appears in a session's speaker list.
 *
 * `names` is every name we hold for them — full name and preferred name — since
 * somebody called "Nguyen Van A" in the directory may well be "Andy" in Zoom.
 * A blank or single-character name is ignored: matching on "A" would put every
 * session in that person's history.
 */
export function attendedBy(speakers: string[], names: (string | null)[]): boolean {
  const mine = names
    .filter((n): n is string => Boolean(n))
    .map(normalise)
    .filter((n) => n.length > 1);
  if (mine.length === 0) return false;
  const said = speakers.map(normalise);
  return said.some((s) => mine.some((m) => s === m || s.includes(m) || m.includes(s)));
}

/** The name columns of a directory person, as far as a Zoom handle can be matched to one. */
export type DirectoryName = { display_name: string | null; preferred_name: string | null; full_name: string | null };

/**
 * Turns the names Zoom recorded into the names we hold for those people.
 *
 * A handle is whatever somebody typed into Zoom, so the session row used to
 * show "viha viha" or "ha" verbatim. A handle is replaced by a person's display
 * name only when exactly one name in the directory answers to it (display,
 * preferred or full name, accents and case ignored, as `attendedBy` does). A
 * handle that matches nobody, or matches two different people, is shown as it
 * is: inventing a person from a guess would put a wrong name on a record. Two
 * handles for one person ("Name A", "Náme A") collapse into one entry.
 */
export function resolveHandles(handles: string[], people: DirectoryName[]): string[] {
  const key = (name: string) => foldDiacritics(normalise(name));
  const byKey = new Map<string, Set<string>>();
  for (const person of people) {
    const shown = personName(person, null);
    if (!shown) continue;
    for (const alias of [person.display_name, person.preferred_name, person.full_name]) {
      const k = alias ? key(alias) : "";
      if (k.length < 2) continue;
      byKey.set(k, (byKey.get(k) ?? new Set()).add(shown));
    }
  }
  const out: string[] = [];
  for (const handle of handles) {
    const matches = byKey.get(key(handle));
    const shown = matches?.size === 1 ? [...matches][0] : handle;
    if (!out.includes(shown)) out.push(shown);
  }
  return out;
}
