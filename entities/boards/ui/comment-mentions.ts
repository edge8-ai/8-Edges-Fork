import type { BoardPerson, CommentMention } from "@/entities/boards/lib/data";

// The @mention mechanics of the comment composer (W.143), pure so the rules
// are tested without a browser. What is STORED is a list of person ids, picked
// from the people who can be on the board; the "@Display Name" in the text is
// what the reader sees and what the highlight finds. Nothing parses a name
// out of free text to decide who was tagged.

/** How many people the picker lists at once: enough to choose from, few enough to scan. */
export const PICKER_SIZE = 6;
// A name being typed is short. Past this, the "@" is punctuation in a sentence
// rather than a mention in progress, and the picker should not be open.
const MAX_QUERY = 40;

/**
 * The mention being typed at `caret`, if any: the "@" that starts it and the
 * text after it. The "@" must begin the text or follow whitespace, so an email
 * address never opens the picker, and the query stops at a line break.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > MAX_QUERY || /[\n\r@]/.test(query)) return null;
  return { start: at, query };
}

/** The people whose name contains the query, names that start with it first. */
export function matchPeople(people: BoardPerson[], query: string, limit = PICKER_SIZE): BoardPerson[] {
  const q = query.trim().toLowerCase();
  const scored = people
    .map((p) => ({ p, at: p.name.toLowerCase().indexOf(q) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1) || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, limit).map((s) => s.p);
}

/**
 * Replaces the "@query" from `start` to `caret` with "@Name " and says where
 * the caret goes next, so typing carries straight on after the name.
 */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const token = `@${name} `;
  return { text: text.slice(0, start) + token + text.slice(caret), caret: start + token.length };
}

/**
 * The picked people whose "@Name" is still in the text when it is sent. A
 * person picked and then deleted from the sentence is no longer tagged, and is
 * not messaged; duplicates collapse to one id.
 */
export function mentionsInText(text: string, picked: BoardPerson[]): string[] {
  const ids: string[] = [];
  for (const p of picked) if (text.includes(`@${p.name}`) && !ids.includes(p.id)) ids.push(p.id);
  return ids;
}

export type BodyPart = { text: string; mention: boolean };

/**
 * A comment body cut into plain text and "@Name" runs for the people it
 * tagged, so the rendered comment can highlight them. Longer names are tried
 * first, so "@Ann Lee" is not read as "@Ann" followed by " Lee".
 */
export function splitMentions(body: string, mentions: CommentMention[]): BodyPart[] {
  const tokens = [...new Set(mentions.map((m) => `@${m.name}`))].sort((a, b) => b.length - a.length);
  const parts: BodyPart[] = [];
  let plain = "";
  let i = 0;
  while (i < body.length) {
    const hit = body[i] === "@" ? tokens.find((t) => body.startsWith(t, i)) : undefined;
    if (hit) {
      if (plain) parts.push({ text: plain, mention: false });
      parts.push({ text: hit, mention: true });
      plain = "";
      i += hit.length;
    } else {
      plain += body[i];
      i += 1;
    }
  }
  if (plain) parts.push({ text: plain, mention: false });
  return parts;
}
