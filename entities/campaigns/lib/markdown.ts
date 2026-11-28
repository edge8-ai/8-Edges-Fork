import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

// Server-side markdown -> sanitized HTML for marketing content (post copy shown
// on the asset detail page). Same discipline as the coaching/plan viewers:
// sanitize on, rendered into an .admin-idea-plan prose block.
export async function marketingMarkdownToHtml(markdown: string): Promise<string> {
  return String(
    await remark()
      .use(remarkGfm)
      .use(remarkHtml, { sanitize: true })
      .process(markdown),
  );
}
