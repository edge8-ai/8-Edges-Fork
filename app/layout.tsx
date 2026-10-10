import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './styles/tokens.css'
import './globals.css'
// Provided by the site entity when it is installed, fallbacks otherwise — see
// the generated app/shell.ts. The root layout names no entity.
import { SiteFrame, SITE_TITLE, SITE_DESCRIPTION, SITE_NAME, LOGO_SRC } from '@/app/shell'
import {
  ORG_NAME,
  ORG_ALTERNATE_NAME,
  ORG_DESCRIPTION,
  ORG_FOUNDER,
  ORG_SAME_AS,
  ORG_SALES_EMAIL,
} from '@/kernel/config/organisation'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')

// The <head> copy, from entities/site/lib/public-routes.ts — the module the
// fork overlay replaces. It used to be six string literals right here, which is
// how the upstream's tagline and service pitch ended up in the <title> and the
// meta description of all 14 static pages of a fork, on the fork's own domain.
// metadataBase directly below had already been moved to configuration; the
// words beside it were left behind, and nothing looked at rendered <head>.
//
// A fork whose overlay empties these falls back to its own NEXT_PUBLIC_ORG_NAME
// and, failing that, publishes no title rather than somebody else's.
const TITLE = SITE_TITLE || ORG_NAME || undefined
const DESCRIPTION = SITE_DESCRIPTION || ORG_DESCRIPTION || undefined
const NAME = SITE_NAME || ORG_NAME || undefined

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
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <SiteFrame>{children}</SiteFrame>
        <Analytics />
      </body>
    </html>
  )
}
