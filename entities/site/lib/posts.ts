import { remark } from 'remark'
import { toHast } from 'mdast-util-to-hast'
import { raw } from 'hast-util-raw'
import { sanitize } from 'hast-util-sanitize'
import { toHtml } from 'hast-util-to-html'
import { POST_HTML_SCHEMA } from '@/kernel/config/post-html-schema'
import type { PostMeta } from './postData'

export type { PostMeta }

interface FaqItem {
  question: string
  answer: string
}

export interface Post extends PostMeta {
  contentHtml: string
  faq: FaqItem[]
  // DB-backed posts (lib/blog.ts) carry a purpose-built title tag and meta
  // description from their SEO plan; static posts leave these undefined and
  // generateMetadata falls back to title/excerpt as before.
  titleTag?: string | null
  metaDescription?: string | null
}

// Pull the FAQ out of a post's markdown so the page can emit FAQPage
// structured data. Posts write their FAQ as the established accordion:
//   <details class="faq-item"><summary>Question</summary>
//
//   Answer paragraph(s).
//   </details>
// The answer is reduced to plain text (tags and markdown emphasis stripped);
// Google's FAQPage schema wants the plain answer, and this keeps the JSON-LD
// free of the markup the visible accordion still renders.
export function extractFaq(markdown: string): FaqItem[] {
  const items: FaqItem[] = []
  const block = /<details[^>]*class="faq-item"[^>]*>([\s\S]*?)<\/details>/gi
  let m: RegExpExecArray | null
  while ((m = block.exec(markdown)) !== null) {
    const inner = m[1]
    const sum = inner.match(/<summary>([\s\S]*?)<\/summary>/i)
    if (!sum) continue
    const question = plain(sum[1])
    const answer = plain(inner.replace(/<summary>[\s\S]*?<\/summary>/i, ''))
    if (question && answer) items.push({ question, answer })
  }
  return items
}

function plain(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ') // strip any tags
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links -> text
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\s+/g, ' ')
    .trim()
}

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

