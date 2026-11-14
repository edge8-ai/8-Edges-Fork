import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './styles/tokens.css'
import './globals.css'
// The frame around every public page is the kernel's. What it and the <head>
// say about the organisation is provided by org when it is installed and is
// empty otherwise — see the generated app/shell.ts. The root layout names no
// entity (A.79.7, ADR 0034 step 3: until then both came from the site).
import PublicFrame from '@/kernel/shell/public-frame/PublicFrame'
import { publicPresence } from '@/app/shell'
import {
  ORG_NAME,
  ORG_ALTERNATE_NAME,
  ORG_DESCRIPTION,
  ORG_FOUNDER,
  ORG_SAME_AS,
  ORG_SALES_EMAIL,
} from '@/kernel/config/organisation'

// Every page this app renders lives on the App's host once it has one
// (APP_ORIGIN, ADR 0022's Hybrid shape), so that is the origin its canonical
// and Open Graph URLs resolve against. NEXT_PUBLIC_SITE_URL stays the public
// site's address, which is what this was before the App had a host of its own.
const SITE_URL = (process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '')

// The <head> copy, from org's public presence (entities/org/lib/public-presence.ts,
// until A.79.7 the site's public-routes.ts) — a module the fork overlay replaces. It used to be six string literals right here, which is
// how the upstream's tagline and service pitch ended up in the <title> and the
// meta description of all 14 static pages of a fork, on the fork's own domain.
// metadataBase directly below had already been moved to configuration; the
// words beside it were left behind, and nothing looked at rendered <head>.
//
// A fork whose overlay empties these falls back to its own NEXT_PUBLIC_ORG_NAME
// and, failing that, publishes no title rather than somebody else's.
const TITLE = publicPresence.title || ORG_NAME || undefined
const DESCRIPTION = publicPresence.description || ORG_DESCRIPTION || undefined
const NAME = publicPresence.name || ORG_NAME || undefined
const LOGO_SRC = publicPresence.logoSrc

export const metadata: Metadata = {
  // Canonical origin for every page's metadata. From configuration, because a
  // hardcoded value makes a fork declare its own pages canonical on the
  // upstream's domain — which is worse than no canonical at all.
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  ...(TITLE ? { title: TITLE } : {}),
  ...(DESCRIPTION ? { description: DESCRIPTION } : {}),
  openGraph: {
    ...(TITLE ? { title: TITLE } : {}),
    ...(DESCRIPTION ? { description: DESCRIPTION } : {}),
    ...(SITE_URL ? { url: SITE_URL } : {}),
    ...(NAME ? { siteName: NAME } : {}),
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    ...(TITLE ? { title: TITLE } : {}),
    ...(DESCRIPTION ? { description: DESCRIPTION } : {}),
  },
}

// The page covers the whole screen, under the notch and the home indicator,
// instead of Safari letterboxing it. Without viewport-fit=cover every
// env(safe-area-inset-*) in the stylesheets is zero, so the bottom bars that
// pad themselves for the home indicator sat under it in a home-screen app
// (mobile plan M8.2). The stylesheets keep every fixed bar, the shell and the
// site's columns inside the insets. Width and scale repeat Next's defaults so
// the tag reads whole here; zoom stays allowed.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

// Organisation schema.org markup. Every value is configuration (see
// kernel/config/organisation.ts): a field left unset is omitted rather than
// defaulted, so a fork that has not filled these in publishes less structured
// data instead of publishing the previous owner's.
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  ...(ORG_NAME ? { name: ORG_NAME } : {}),
  ...(ORG_ALTERNATE_NAME ? { alternateName: ORG_ALTERNATE_NAME } : {}),
  url: SITE_URL,
  ...(LOGO_SRC ? { logo: `${SITE_URL}${LOGO_SRC}` } : {}),
  ...(ORG_DESCRIPTION ? { description: ORG_DESCRIPTION } : {}),
  ...(ORG_FOUNDER ? { founder: { '@type': 'Person', name: ORG_FOUNDER } } : {}),
  ...(ORG_SAME_AS.length ? { sameAs: ORG_SAME_AS } : {}),
  ...(ORG_SALES_EMAIL
    ? {
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'sales',
            email: ORG_SALES_EMAIL,
            availableLanguage: ['English'],
          },
        ],
      }
    : {}),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // globals.css scrolls the page smoothly for in-page links. Since Next 16
    // the router keeps that during a page change too, unless this attribute
    // asks it to jump: without it every page opened from far down glided
    // back up to its top, which on a phone read as the page jumping.
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <PublicFrame presence={publicPresence}>{children}</PublicFrame>
        <Analytics />
      </body>
    </html>
  )
}
