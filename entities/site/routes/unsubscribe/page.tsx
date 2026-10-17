import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader, Block } from '@/entities/retreats'
import { verifyUnsubscribeToken } from '@/entities/campaigns'
import { UnsubscribeForm } from './UnsubscribeForm'
import { SUPPORT_EMAIL } from "@/kernel/config/organisation";
import { BRAND, pageTitle } from '@/entities/site/lib/brand-name'

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
        <Link href="/" className="xp-backlink">
          ← {BRAND || 'Home'}
        </Link>

        <PageHeader
          eyebrow="Email preferences"
          title="Unsubscribe"
          lead={`Manage the marketing email you receive${BRAND ? ` from ${BRAND}` : ''}.`}
        />

        <div className="xp-blocks">
          <Block heading={personId ? 'Confirm' : 'This link did not work'}>
            {personId && token ? (
              <UnsubscribeForm token={token} />
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
