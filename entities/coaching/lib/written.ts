// The written cycle (K.35): the pure half. A 1-1 that will not happen in the
// room can be held in writing when the member's ninety-second answers exist
// and the coach has replied; the recap is the exchange itself. Nothing here
// touches a database, so the refusal rule and the recap text read and test
// on their own, and the client components can import the sentence.

import type { OneOnOneStatus } from "./types";

export type WrittenAnswers = { moved: string | null; stuck: string | null; talk: string | null };

export const WRITTEN_MEMBER_PROMPT =
  "Answer the three questions above; your coach replies, and that counts as the 1-1.";

// Why a 1-1 cannot be held in writing yet, or ok when it can.
export function writtenOutcome(input: {
  status: OneOnOneStatus;
  answers: WrittenAnswers | null;
  reply: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (input.status === "held") return { ok: false, error: "That 1-1 has already been held." };
  if (input.status === "skipped") return { ok: false, error: "A skipped 1-1 cannot be held in writing." };
  const a = input.answers;
  if (!a || !(a.moved?.trim() || a.stuck?.trim() || a.talk?.trim()))
    return { ok: false, error: "There is nothing written yet: the member's answers come first." };
  if (!input.reply?.trim()) return { ok: false, error: "Write your reply first; it is your half of the 1-1." };
  return { ok: true };
}

// The shared recap of a written 1-1: the member's words under the three
// headings, then the coach's reply. Published as it is; nothing summarises it.
export function buildWrittenRecap(answers: WrittenAnswers, reply: string, coachName: string | null): string {
  const lines: string[] = ["_Held in writing._", ""];
  const rows: [string, string | null][] = [
    ["What moved", answers.moved],
    ["What was stuck", answers.stuck],
    ["What I wanted to talk about", answers.talk],
  ];
  for (const [heading, body] of rows) {
    if (body?.trim()) lines.push(`## ${heading}`, "", body.trim(), "");
  }
  lines.push(`## ${coachName ? `${coachName} replied` : "The reply"}`, "", reply.trim(), "");
  return lines.join("\n");
}
