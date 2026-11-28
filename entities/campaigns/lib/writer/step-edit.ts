import { bannedLanguageError, boldDataPoints, brandNameError, emDashError, figuresIn, readerText, wordCount, wordRangeError } from "./checks";
import { appendBlogNotes, loadBlogAsset, updateBlogAsset } from "./data";
import { fillPrompt } from "@/kernel/ai/prompts";
import { brandPreamble, callCheckedWriterModel } from "./model";
import { WRITER_EDIT_PROMPT } from "./step-edit.prompt";
import { wordRangeFrom } from "./profile-rules";
import type { StepRunner } from "./types";
import { z } from "zod/v4";

// Step 2: one editing pass over the blog with the brand's editing lens. The
// model returns the edited body and a change log; the step passes when the body
// holds the house rules and the word range and the log says what changed.

export const editOutput = z.object({
  body_md: z.string().describe("The full edited post in Markdown: paragraphs, ## and ### headings, bold, lists, links. No HTML, no FAQ section, no title heading."),
  // Not `.min(1)`: the derived schema is also the validator, so a bound here
  // would reject an empty log with a Zod message and leave the step's own
  // "returned no change log" check below unreachable. The instruction lives in
  // the description, where the model reads it, and the check below enforces it.
  change_log: z.array(z.string()).describe("One line per change made: what was cut, moved, sharpened or added, and why. Never empty; if nothing needed changing, say what was checked and why it held."),
});

// The bold floor is checked here, where the model that writes the bold runs
// is called, and not only at Validate six steps later: Validate runs no model,
// so a retry there re-reads the same body and fails the same way (the Day 5
// run of 2026-10-16 stopped on exactly that). A failure here is one the
// retry can fix. When the post and the idea together state fewer than two
// figures, no edit can satisfy the rule without inventing a number, so the
// message says where the data has to come from.
export function boldDataPointsError(body: string, idea: string | null): string | null {
  const bolded = boldDataPoints(body).length;
  if (bolded >= 2) return null;
  const stated = figuresStated(body, idea);
  if (stated < 2) {
    return `The post and the idea together state ${stated} figure(s); the process asks for at least two bolded data points, so add the data to the idea and retry.`;
  }
  return `Only ${bolded} bolded data point(s); bold at least two figures (a percentage, a count, a year, a duration) the post or the idea states.`;
}

/** The distinct figures the post and the idea state between them. */
function figuresStated(body: string, idea: string | null): number {
  return new Set([...figuresIn(readerText(body)), ...figuresIn(idea ?? "")]).size;
}

export const runEdit: StepRunner = async ({ campaign, profile }) => {
  const range = wordRangeFrom(profile);
  if (!range) return { ok: false, error: "The brand profile states no blog word range. Add it under Marketing > Brands." };
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.copyMd?.trim()) return { ok: false, error: "The blog asset has no body to edit." };

  const P = WRITER_EDIT_PROMPT;
  const system = fillPrompt(P.system, {
    preamble: brandPreamble(profile, campaign.idea),
    editingLens: profile.editingLensMd ?? P.parts.noEditingLens,
    channels: profile.channelsMd ?? P.parts.notSet,
    min: range.min,
    max: range.max,
  });

  const user = fillPrompt(P.user, { title: blog.title, body: blog.copyMd, idea: campaign.idea ?? P.parts.noIdea });

  // A failed check gets one retry inside the step, named (Y.96).
  const draft = blog.copyMd;
  const r = await callCheckedWriterModel({
    step: "edit",
    prompt: P,
    system,
    user,
    schema: editOutput,
    label: "Edit",
    check: (out) => {
      const body = out.body_md?.trim() ?? "";
      const log = (out.change_log ?? []).map((l) => l.trim()).filter(Boolean);
      const failures = [emDashError(body), bannedLanguageError(body, campaign.idea), brandNameError(body), wordRangeError(body, range)].filter(
        (e): e is string => Boolean(e),
      );
      if (!body) failures.push("The edit pass returned an empty body.");
      if (!log.length) failures.push("The edit pass returned no change log.");
      const bold = boldDataPointsError(body, campaign.idea);
      if (bold) failures.push(bold);
      if (!failures.length) return { ok: true, value: { body, log } };
      // Fewer than two figures in the draft and the idea together is a gap in
      // the data, which no second answer can close without inventing a number.
      // It is judged on the step's inputs, which a retry does not change, not
      // on this answer, which may simply have cut the draft's figures.
      return { ok: false, failures, retry: !(bold && figuresStated(draft, campaign.idea) < 2) };
    },
  });
  if (!r.ok) return r;
  const { body, log } = r.data;

  const saved = await updateBlogAsset(blog.id, { copy_md: body });
  if (!saved.ok) return saved;
  const noted = await appendBlogNotes(blog, "Edit pass", log);
  if (!noted.ok) return noted;
  return { ok: true, summary: `Edited to ${wordCount(body)} words; ${log.length} change(s) logged.` };
};
