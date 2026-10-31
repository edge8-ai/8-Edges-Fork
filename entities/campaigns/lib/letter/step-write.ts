import { bannedLanguageError, brandNameError, emDashError, wordCount } from "../writer/checks";
import { fillPrompt } from "@/kernel/ai/prompts";
import { brandPreamble, callWriterModel } from "../writer/model";
import { WRITER_LETTER_WRITE_PROMPT } from "./step-write.prompt";
import { recentSentLetters, updateLetter } from "./data";
import type { StepRunner } from "./types";
import { z } from "zod/v4";

// Step 3: the letter. First person, a greeting by first name, two short
// paragraphs about the week from the gathered data points, one line that
// ties the week to the three posts, signed. The subject is the sentence the
// letter is about and is never repeated in the body; the inbox shows it.

const MAX_WORDS = 220;

export const letterWriteOutput = z.object({
  subject: z.string().describe("At most 60 characters. A sentence, not a headline. Not a question every week."),
  preheader: z.string().describe("At most 110 characters. The grey line after the subject in the inbox."),
  body_md: z.string().describe("Markdown. Opens with 'Hi {first_name},' on its own line, then two or three short paragraphs, then a line that says what the three posts below share, then 'Dave' on its own line. Blank lines between paragraphs. About 170 words, never more than 220. No headings, no lists, no links."),
});

export const runWrite: StepRunner = async ({ letter, profile }) => {
  const points = letter.notes.gathered ?? [];
  const picked = letter.notes.picked ?? [];
  if (points.length === 0) return { ok: false, error: "Write: no gathered data points; run gather first." };
  if (picked.length === 0) return { ok: false, error: "Write: no picked posts; run pick first." };
  const previous = await recentSentLetters(4);

  const P = WRITER_LETTER_WRITE_PROMPT;
  const system = fillPrompt(P.system, { preamble: brandPreamble(profile), maxWords: MAX_WORDS });
  const user = fillPrompt(P.user, {
    points: points.map((p) => `- ${p.date}: ${p.fact} (${p.source})`).join("\n"),
    posts: picked.map((p, i) => `${i + 1}. ${p.title}${p.pillar ? ` (${p.pillar})` : ""}`).join("\n"),
    previous: previous.length ? previous.map((l) => `- ${l.subject}`).join("\n") : P.parts.noPrevious,
  });

  const r = await callWriterModel({ step: "letter-write", prompt: P, system, user, schema: letterWriteOutput });
  if (!r.ok) return r;
  const subject = r.data.subject?.trim() ?? "";
  const preheader = r.data.preheader?.trim() ?? "";
  const body = r.data.body_md?.trim() ?? "";

  const failures = [emDashError(`${subject}\n${preheader}\n${body}`), bannedLanguageError(body), brandNameError(`${subject}\n${body}`)].filter((e): e is string => Boolean(e));
  if (!subject) failures.push("No subject.");
  if (subject.length > 60) failures.push(`Subject is ${subject.length} characters; at most 60.`);
  if (preheader.length > 110) failures.push(`Preheader is ${preheader.length} characters; at most 110.`);
  if (!/^Hi \{first_name\},/m.test(body)) failures.push("The body does not open with 'Hi {first_name},'.");
  if (!/^Dave\s*$/m.test(body)) failures.push("The body is not signed 'Dave'.");
  if (wordCount(body) > MAX_WORDS) failures.push(`Body is ${wordCount(body)} words; at most ${MAX_WORDS}.`);
  if (subject && body.toLowerCase().includes(subject.toLowerCase().replace(/\.$/, ""))) failures.push("The body repeats the subject.");
  if (/^#|^- |\[.+\]\(/m.test(body)) failures.push("The body has a heading, a list or a link.");
  if (failures.length) return { ok: false, error: `Write: ${failures.join(" ")}` };

  const saved = await updateLetter(letter.id, { subject, preheader, body_md: body });
  if (!saved.ok) return saved;
  letter.subject = subject;
  letter.preheader = preheader;
  letter.bodyMd = body;
  return { ok: true, summary: `"${subject}", ${wordCount(body)} words.` };
};
