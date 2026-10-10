// Tracking codes on every link a broadcast carries. Two systems read them and
// agree by construction: Resend reports each click with the clicked URL, and
// the site's analytics reads the UTM parameters on arrival. utm_content names
// the block the link sat in, so a results card can say which post pulled and
// whether the call to action worked, not just "clicks".

// Was 'edge8-letter', which tagged every link in a fork's own broadcasts
// with the upstream's name — in the recipient's URL bar and in the fork's
// analytics. The medium below is generic and stays a literal.
export const UTM_SOURCE = 'letter'
export const UTM_MEDIUM = 'email'

// Leaves a link alone when it already carries a utm_source (a link the author
// tagged by hand) or is not an http(s) URL (mailto:, tel:).
export function withUtm(url: string, campaign: string, content: string): string {
  if (!/^https?:\/\//i.test(url)) return url
  try {
    const u = new URL(url)
    if (u.searchParams.has('utm_source')) return url
    u.searchParams.set('utm_source', UTM_SOURCE)
    u.searchParams.set('utm_medium', UTM_MEDIUM)
    u.searchParams.set('utm_campaign', campaign)
    u.searchParams.set('utm_content', content)
    return u.toString()
  } catch {
    return url
  }
}

// Tags every href in rendered HTML (the letter body), so a link the author
// wrote in markdown is tracked like a card link. Hrefs are HTML-escaped text;
// `&` inside them is written back escaped.
export function tagHtmlLinks(html: string, campaign: string, content: string): string {
  return html.replace(/href="([^"]+)"/g, (_m, href: string) => {
    const raw = href.replace(/&amp;/g, '&')
    const tagged = withUtm(raw, campaign, content)
    return `href="${tagged.replace(/&/g, '&amp;')}"`
  })
}

// The campaign value: the send date and a slug of the subject, e.g.
// 2026-09-09-the-model-was-fine. Stable for the life of the broadcast.
export function utmCampaignFor(input: { subject: string; date: string }): string {
  const slug = input.subject
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return `${input.date.slice(0, 10)}-${slug || 'letter'}`
}

// utm_content for a call to action: its label as a slug, so reports read
// "cta-book-a-conversation" rather than "cta".
export function ctaContentFor(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `cta-${slug || 'button'}`
}
