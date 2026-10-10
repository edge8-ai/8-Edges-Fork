import { defaultSchema, type Schema } from "hast-util-sanitize";

// Sanitize allow-list for blog post bodies (entities/site/lib/posts.ts
// renderPostMarkdown). It sits in the kernel because the site and the library
// are on the same layer and neither may reach the other's door (Q2).
//
// Post markdown is first-party but not hand-typed: DB-backed posts are written
// by the AI marketing pipeline and published by the blog-publish cron straight
// into dangerouslySetInnerHTML on the public site, so the body has to be treated
// as untrusted. This is hast-util-sanitize's GitHub-style defaultSchema (the
// same base lib/admin/plan-markdown.ts extends) widened only by the raw HTML the
// house post format actually uses:
//
//   figure / figcaption  — exhibit framing around an image
//   details / summary    — the <details class="faq-item"> FAQ accordion
//                          (both already in the default tagNames; listed here
//                          so the dependency is explicit)
//   className            — on details, figure, div and span, which carry the
//                          post CSS hooks: faq-item, post-figure, idea-in-brief
//                          / iib-*, fig-source
//   target / rel on a    — existing posts open external sources in a new tab
//                          with rel="noopener"
//
// Everything else is the default: <script> is stripped, on* handlers are never
// in the attribute lists, and href/src keep the default protocol allow-list
// (http/https/mailto/... — a javascript: URL is dropped, relative paths pass).
const attributes = defaultSchema.attributes ?? {};

export const POST_HTML_SCHEMA: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "figure", "figcaption", "details", "summary"],
  attributes: {
    ...attributes,
    a: [...(attributes.a ?? []), "target", "rel"],
    details: [...(attributes.details ?? []), "className"],
    div: [...(attributes.div ?? []), "className"],
    figure: ["className"],
    span: [...(attributes.span ?? []), "className"],
  },
};
