import { remark } from "remark";
import remarkHtml from "remark-html";

// Server-side markdown -> sanitized HTML for coaching docs (preps, summaries,
// recaps, trend reports). sanitize: true, same discipline as the onboarding
// plan viewer — AI/coach-authored content, rendered into .admin-idea-plan blocks.
export async function coachingMarkdownToHtml(markdown: string): Promise<string> {
  return String(await remark().use(remarkHtml, { sanitize: true }).process(markdown));
}
