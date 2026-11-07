import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import { defaultSchema } from "hast-util-sanitize";

// Shared renderer for manager-authored plan documents (onboarding plans, and
// anything else uploaded as markdown). Two things the bare remark pipeline
// doesn't do, both of which a real plan uses heavily:
//
//   remark-gfm  — without it, GFM tables render as literal "| col | col |"
//                 paragraphs and "- [ ] task" renders as the literal text
//                 "[ ] task". An onboarding plan is mostly tables and
//                 checklists, so it read as a wall of pipes.
//   input       — the default sanitize schema strips <input>, which would
//                 delete every checkbox remark-gfm just produced. Allowed here
//                 with a fixed attribute list; remark-gfm only ever emits a
//                 disabled checkbox, and sanitize still drops event handlers.
//
// Content is manager-authored and admin-uploaded, never public input, but it
// stays sanitized on the same principle as the ideas plans.
const PLAN_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "input"],
  attributes: {
    ...defaultSchema.attributes,
    input: ["type", "checked", "disabled"],
  },
};

export async function renderPlanMarkdown(markdown: string): Promise<string> {
  const file = await remark().use(remarkGfm).use(remarkHtml, { sanitize: PLAN_SCHEMA }).process(markdown);
  return String(file);
}
