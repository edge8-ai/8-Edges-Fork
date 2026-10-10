import type { Metadata } from 'next'
import { PageHeader, Block } from '@/entities/retreats'
import Link from 'next/link'
import { legalPartyName, SUPPORT_EMAIL } from '@/kernel/config/organisation'
import { BRAND } from '@/entities/site/lib/brand-name'
import { LEGAL_JURISDICTIONS, PAGE_META } from '@/entities/site/lib/public-routes'

export const metadata: Metadata = {
  title: PAGE_META.privacy.title,
  description: `How ${legalPartyName(BRAND)} collects, uses, and protects your information.`,
}

const EFFECTIVE_DATE = 'July 18, 2026'

export default function PrivacyPolicyPage() {
  return (
    <div className="xp-page">
      <article className="xp-article">
        <Link href="/" className="xp-backlink">
          ← {BRAND || 'Home'}
        </Link>

        <PageHeader
          eyebrow={`Effective ${EFFECTIVE_DATE}`}
          title="Privacy Policy"
          lead={`This policy explains what information ${legalPartyName(BRAND)} (“we,” “us”), collects across our website, client portal, and related services, and how we use, share, and protect it.`}
        />

        <div className="xp-blocks">
          <Block heading="Information we collect">
            <p>
              <strong>Information you provide directly.</strong> This includes your name, email
              address, company, and message when you submit a contact form; registration details
              for workshops, training, or events; application materials (such as a résumé) when
              you apply to a job; and account information when you&apos;re granted access to our client
              or team portal.
            </p>
            <p>
              <strong>Payment information.</strong> When you register for a paid workshop, event,
              or program, payment is processed by our payment provider (Stripe). We do not store
              your full card number on our servers.
            </p>
            <p>
              <strong>Information collected automatically.</strong> Like most websites, we collect
              standard usage data (pages visited, referring site, browser type, approximate
              location) through our hosting and analytics providers.
            </p>
          </Block>

          <Block heading="How we use your information">
            <p>
              We use the information we collect to respond to inquiries, deliver the services you
              request, process payments, manage event and workshop registrations, operate client
              and team portal accounts, and improve our site and services. We do not sell your
              personal information.
            </p>
            <p>
              <strong>Marketing email.</strong> If you are a client of ours, or you gave us your
              details as a business contact, we may send you occasional email about our work, such
              as a newsletter. Every marketing email includes a one-click unsubscribe link, and
              opting out takes effect immediately. We do not send marketing email to people who
              applied for a job with us; the address you give us in an application is used only for
              recruiting.
            </p>
          </Block>

          <Block heading="How we share your information">
            <p>
              We share information with service providers who help us run our business, under
              confidentiality and data-protection obligations, including:
            </p>
            <ul>
              <li>Supabase — database hosting and account authentication</li>
              <li>Stripe — payment processing for workshops and events</li>
              <li>Resend — transactional and marketing email delivery</li>
              <li>Intuit QuickBooks — invoicing and billing for client engagements</li>
              <li>Vercel — website hosting and infrastructure</li>
            </ul>
            <p>
              We may also disclose information if required by law, or in connection with a merger,
              acquisition, or sale of assets, in which case we&apos;ll notify you of any change in
              ownership or use of your personal information.
            </p>
          </Block>

          <Block heading="Cookies and tracking technologies">
            <p>
              We use cookies and similar technologies to keep you signed in to the portal, remember
              your preferences, and understand how visitors use our site. You can control cookies
              through your browser settings; disabling them may limit some site functionality.
            </p>
          </Block>

          <Block heading="Data retention">
            <p>
              We retain personal information for as long as needed to provide our services, meet
              legal and accounting obligations, and resolve disputes. Job application materials and
              inactive portal accounts are retained only as long as reasonably necessary for these
              purposes.
            </p>
          </Block>

          <Block heading="Data security">
            <p>
              We use industry-standard technical and organizational measures — including encrypted
              connections and access controls — to protect your information. No method of
              transmission or storage is completely secure, so we can&apos;t guarantee absolute
              security.
            </p>
          </Block>

          <Block heading="Your rights and choices">
            <p>
              You may request access to, correction of, or deletion of your personal information by
              emailing{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Depending on where you live, you
              may have additional rights under local law; we&apos;ll honor requests to the extent
              required.
            </p>
            <p>
              <strong>Email preferences.</strong> You can stop receiving marketing email at any time
              using the unsubscribe link at the bottom of any such message, or by emailing{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Unsubscribing from marketing does
              not stop essential messages about services you use, such as event tickets, invoices,
              or account and security notices.
            </p>
          </Block>

          <Block heading="International data transfers">
            <p>
              {LEGAL_JURISDICTIONS ? `We operate across ${LEGAL_JURISDICTIONS}. ` : ''}By using our
              services, you understand that your information may be transferred to and processed in
              countries other than your own, which may have different data-protection laws.
            </p>
          </Block>

          <Block heading="Children's privacy">
            <p>
              Our services are not directed to children under 13, and we do not knowingly collect
              personal information from them.
            </p>
          </Block>

          <Block heading="Changes to this policy">
            <p>
              We may update this policy from time to time. We&apos;ll post the revised version here with
              an updated effective date.
            </p>
          </Block>

          <Block heading="Contact us">
            <p>
              Questions about this policy or your information? Email us at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </p>
          </Block>
        </div>
      </article>
    </div>
  )
}
