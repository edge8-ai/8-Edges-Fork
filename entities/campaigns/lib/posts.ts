import { remark } from 'remark'
import { toHast } from 'mdast-util-to-hast'
import { raw } from 'hast-util-raw'
import { sanitize } from 'hast-util-sanitize'
import { toHtml } from 'hast-util-to-html'
import { POST_HTML_SCHEMA } from '@/kernel/config/post-html-schema'

// The single markdown → HTML pipeline every post body goes through. First-party
// markdown uses raw HTML: <figure>/<figcaption> exhibit framing and the
// <details class="faq-item"> FAQ accordion, which is why this used to run with
// sanitize:false. It now sanitizes against POST_HTML_SCHEMA, an allow-list that
// admits exactly that markup and nothing else: post bodies come from the AI
// marketing pipeline and land in dangerouslySetInnerHTML, so an unsanitized
// <script> or onerror= would be stored XSS on the public site. Shared so
// DB-backed posts (lib/blog.ts) render byte-identically to the file-backed ones.
//
// This is remark-html's compiler spelled out, with one extra step. Handing
// remark-html a schema does not sanitize raw HTML, it discards it: without
// allowDangerousHtml, mdast-util-to-hast drops every `html` node before the
// sanitizer runs, which would delete every figure and FAQ. So the raw HTML is
// kept through toHast, parsed into real elements by hast-util-raw, and only then
// sanitized, so the allow-list gets to judge each tag and attribute.
export async function renderPostMarkdown(markdown: string): Promise<string> {
  const mdast = remark().parse(markdown)
  const hast = sanitize(raw(toHast(mdast, { allowDangerousHtml: true })), POST_HTML_SCHEMA)
  const html = toHtml(hast)
  // remark-html appends a final newline; kept so existing output is unchanged.
  return html && /[^\r\n]$/.test(html) ? html + '\n' : html
}

