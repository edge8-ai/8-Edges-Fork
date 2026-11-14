import type { Metadata } from 'next'
import { PageHeader, Block } from '@/entities/retreats'
import { verifyUnsubscribeToken } from '@/entities/campaigns/lib/marketing-email'
import { UnsubscribeForm } from './UnsubscribeForm'
import { ORG_NAME, SUPPORT_EMAIL } from "@/kernel/config/organisation";
import { pageTitle } from "@/kernel/shell/public-frame/presence";
import { publicPresence } from "@/entities/org";

// The name the page calls the sender: the organisation's public name, then its
// configured one (A.79.7; until then the site's BRAND, which read the same two).
const BRAND = publicPresence.name || ORG_NAME || "";

export const metadata: Metadata = {
  title: pageTitle(BRAND, 'Unsubscribe'),
  description: `Stop receiving marketing email${BRAND ? ` from ${BRAND}` : ''}.`,
  robots: { index: false, follow: false },
}

export default async function UnsubscribePage(
  props: {
    searchParams: Promise<{ token?: string | string[] }>
  }
) {
  const searchParams = await props.searchParams;
  const raw = searchParams.token
  const token = Array.isArray(raw) ? raw[0] : raw
  const personId = token ? verifyUnsubscribeToken(token) : null

  return (
    <div className="xp-page">
      <article className="xp-article">
        <a href="/" className="xp-backlink">
          ← {BRAND || 'Home'}
        </a>

        <PageHeader
          eyebrow="Email preferences"
          title="Unsubscribe"
          lead={`Manage the marketing email you receive${BRAND ? ` from ${BRAND}` : ''}.`}
        />

        <div className="xp-blocks">
          <Block heading={personId ? 'Confirm' : 'This link did not work'}>
            {personId && token ? (
              <UnsubscribeForm token={token} brand={BRAND} />
            ) : (
              <p>
                This unsubscribe link is missing or is no longer valid. Email{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will remove you from the
                list by hand.
              </p>
            )}
          </Block>
        </div>
      </article>
    </div>
  )
}
