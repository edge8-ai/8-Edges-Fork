// Structured data for a page's <script type="application/ld+json">: the
// escaped payload React's dangerouslySetInnerHTML takes, and a schema.org
// FAQPage built from question-and-answer pairs. Used by the marketing site and
// the retreats pages, so it lives in the kernel; it moved here from the site's
// lib/seo.ts with A.79.6 (ADR 0034, step 2). campaigns' lib/seo.ts is a
// different thing: it parses a blog asset's SEO notes at publish time.

export function jsonLd(data: object) {
  return {
    __html: JSON.stringify(data).replace(/</g, "\\u003c"),
  };
}

export function faqPageSchema(faqs: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };
}
