// Who was in a group coaching session (L.8).
//
// There is no attendance table. Group sessions are Zoom meetings and the only
// record of who was there is `metadata.speakers` — the names Zoom captured.
// That is a real limitation and this module owns it rather than hiding it:
//
// - it is a SPEAKER list, so somebody who attended and never unmuted is not in
//   it. The timeline therefore says "you spoke at" nothing of the sort; it
//   simply shows the sessions it can prove, and silence about a session is not
//   a claim that the person was absent.
// - names come from whatever people typed into Zoom, so matching is loose on
//   purpose: case, surrounding whitespace and a trailing parenthetical are all
//   ignored, and a person is matched on any of the names we hold for them.
//
// Nothing here counts attendance, and nothing compares it between people: this
// answers "was this session part of my growth history", one person at a time.

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
