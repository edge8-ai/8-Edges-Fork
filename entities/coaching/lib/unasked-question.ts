import { QUESTION_LIBRARY } from "./questions-library";

// "One question you have never asked them" (L.12).
//
// The questions library serves the member, who pulls from it to set an agenda.
// This is the coach's side: one question from the same list that has never come
// up in this pair's recaps, offered at the foot of the agenda.
//
// What it must not become is a coverage metric. There is no count of questions
// asked, no percentage of the library covered, and nothing anywhere records
// whether the coach used the suggestion — it is a prompt addressed to a person,
// not a report about them, and the difference is the whole feature.

/** Every question in the library, flattened, with the group it came from. */
export function allQuestions(): { group: string; question: string }[] {
  return QUESTION_LIBRARY.flatMap((g) => g.questions.map((q) => ({ group: g.title, question: q })));
}

// Words too common to tell two questions apart. Without this, "what" and "you"
// would make every question look asked.
const NOISE = new Set([
  "what", "which", "where", "when", "how", "why", "who", "that", "this", "your", "you", "the", "and",
  "for", "with", "about", "would", "should", "could", "have", "has", "are", "was", "were", "been",
  "most", "more", "one", "they", "them", "their", "there", "here", "into", "from", "than", "then",
  "will", "can", "get", "getting", "going", "just", "like", "really", "now", "right", "think",
]);

function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !NOISE.has(w)),
  );
}

/**
 * Whether a question's subject has already come up in what was said.
 *
 * Deliberately fuzzy and deliberately generous about calling something ASKED: a
 * suggestion that repeats a conversation the pair already had is worse than no
 * suggestion, because it tells the coach the feature is not listening. Requiring
 * half a question's distinctive words to appear is the threshold that earned
 * its place in the tests below.
 */
export function alreadyCovered(question: string, saidBefore: string): boolean {
  const words = [...keywords(question)];
  if (words.length === 0) return false;
  const said = keywords(saidBefore);
  const hits = words.filter((w) => said.has(w)).length;
  return hits / words.length >= 0.5;
}

/**
 * One question this pair has not covered, or null when they have covered them
 * all — which is a real answer and not an error.
 *
 * `nth` rotates through what is left, so "Show another" gives a different one
 * rather than shuffling randomly on every render.
 */
export function unaskedQuestion(saidBefore: string, nth: number): { group: string; question: string } | null {
  const open = allQuestions().filter((q) => !alreadyCovered(q.question, saidBefore));
  if (open.length === 0) return null;
  return open[((nth % open.length) + open.length) % open.length];
}
