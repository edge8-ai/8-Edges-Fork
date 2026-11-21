import * as React from 'react'
import { Body, Button, Column, Container, Head, Hr, Html, Img, Link, Preview, Row, Section, Text } from 'react-email'
import { PALETTE } from '@/kernel/config/palette'
import type { RenderedBlocks, RenderedPost } from './marketing-email-blocks'

// The one broadcast template: a personal letter first, then the featured posts
// in one of three layouts, then one call to action, then the footer the law
// and the inbox need. React Email compiles this to the table-and-inline-CSS
// markup that Outlook and Gmail render the same way, and gives the plain-text
// part from the same tree. The letter arrives already rendered from markdown
// (escaped by renderMarkdown); everything else here is data from the
// broadcast's blocks.
//
// Widths follow the previous hand-written template: a 600px column with 32px
// of padding, so cards and the hero image are 536px wide. Styles are named
// constants rather than literals because an email has to carry them inline.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

const body = { margin: 0, padding: 0, backgroundColor: PALETTE.canvas, fontFamily: FONT }
const container = { maxWidth: '600px', backgroundColor: PALETTE.white, borderRadius: '12px', padding: '32px', color: PALETTE.dark, fontSize: '15px' }
const masthead = { fontWeight: 700, fontSize: '18px', letterSpacing: '-0.01em', margin: '0 0 24px', textAlign: 'center' as const }
const eyebrow = { fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: PALETTE.greyMid, margin: '12px 0 6px' }
const cardTitle = { fontSize: '18px', fontWeight: 600, lineHeight: '1.3', color: PALETTE.dark, textDecoration: 'none', display: 'block', margin: '0 0 6px' }
const leadTitle = { ...cardTitle, fontSize: '22px', lineHeight: '1.25' }
const cardExcerpt = { fontSize: '14px', lineHeight: '1.55', color: PALETTE.inkBody, margin: '0 0 8px' }
const leadExcerpt = { ...cardExcerpt, fontSize: '15px', lineHeight: '1.6' }
const readLink = { fontSize: '14px', fontWeight: 600, color: PALETTE.blueHover, textDecoration: 'none' }
const card = { marginTop: '28px' }
const hero = { width: '100%', height: 'auto', borderRadius: '8px', display: 'block' }
const listRow = { borderTop: `1px solid ${PALETTE.line}`, padding: '18px 0 4px' }
const listNumber = { fontSize: '28px', fontWeight: 600, lineHeight: '1', color: PALETTE.line, margin: 0, width: '36px' }
const listNumberCell = { width: '36px', verticalAlign: 'top' as const }
const listTitle = { ...cardTitle, fontSize: '17px' }
const briefRow = { borderTop: `1px solid ${PALETTE.line}`, padding: '14px 0' }
const thumb = { width: '72px', height: '72px', borderRadius: '6px', display: 'block', objectFit: 'cover' as const }
const thumbCell = { width: '86px', verticalAlign: 'top' as const }
const briefTitle = { ...cardTitle, fontSize: '15px', margin: '0 0 4px' }
const briefMeta = { fontSize: '13px', color: PALETTE.greyMid, margin: 0 }
const ctaBox = { border: `2px solid ${PALETTE.dark}`, borderRadius: '8px', padding: '28px', marginTop: '36px' }
const ctaTagline = { fontSize: '20px', fontWeight: 600, lineHeight: '1.3', margin: '0 0 10px', color: PALETTE.dark }
const ctaLine = { fontSize: '14px', lineHeight: '1.55', color: PALETTE.inkBody, margin: '0 0 18px' }
const ctaButton = { backgroundColor: PALETTE.dark, color: PALETTE.white, fontSize: '14px', fontWeight: 600, borderRadius: '6px', padding: '12px 20px', textDecoration: 'none' }
const rule = { borderColor: PALETTE.line, margin: '32px 0 16px' }
const footer = { fontSize: '12px', lineHeight: '1.6', color: PALETTE.greyMid, margin: 0 }
const footerLink = { color: PALETTE.greyMid }

function PostCard({ post, lead = false }: { post: RenderedPost; lead?: boolean }) {
  return (
    <Section style={card}>
      {post.imageUrl ? (
        <Link href={post.url}>
          <Img src={post.imageUrl} alt={post.title} width={536} style={hero} />
        </Link>
      ) : null}
      {post.pillar ? <Text style={eyebrow}>{post.pillar}</Text> : null}
      <Link href={post.url} style={lead ? leadTitle : cardTitle}>{post.title}</Link>
      {post.excerpt ? <Text style={lead ? leadExcerpt : cardExcerpt}>{post.excerpt}</Text> : null}
      <Link href={post.url} style={readLink}>Read the post →</Link>
    </Section>
  )
}

// Numbered, no images: the shortest email and the one that reads most like a note.
function PostList({ posts }: { posts: RenderedPost[] }) {
  return (
    <Section style={card}>
      {posts.map((post, i) => (
        <Row key={post.url} style={listRow}>
          <Column style={listNumberCell}>
            <Text style={listNumber}>{i + 1}</Text>
          </Column>
          <Column>
            <Link href={post.url} style={listTitle}>{post.title}</Link>
            {post.excerpt ? <Text style={cardExcerpt}>{post.excerpt}</Text> : null}
            <Link href={post.url} style={readLink}>Read the post →</Link>
          </Column>
        </Row>
      ))}
    </Section>
  )
}

// One lead post with its hero, the rest as compact rows with a thumbnail.
function PostFeature({ posts }: { posts: RenderedPost[] }) {
  const [lead, ...rest] = posts
  return (
    <>
      <PostCard post={lead} lead />
      {rest.length ? (
        <Section style={card}>
          {rest.map((post) => (
            <Row key={post.url} style={briefRow}>
              {post.imageUrl ? (
                <Column style={thumbCell}>
                  <Link href={post.url}>
                    <Img src={post.imageUrl} alt={post.title} width={72} height={72} style={thumb} />
                  </Link>
                </Column>
              ) : null}
              <Column>
                <Link href={post.url} style={briefTitle}>{post.title}</Link>
                <Text style={briefMeta}>
                  {post.pillar ? `${post.pillar} · ` : ''}
                  <Link href={post.url} style={readLink}>Read the post →</Link>
                </Text>
              </Column>
            </Row>
          ))}
        </Section>
      ) : null}
    </>
  )
}

export function BroadcastEmail(props: {
  preheader: string | null
  bodyHtml: string
  blocks: RenderedBlocks | null
  unsubscribeLink: string | null
  postalAddress: string
  /** Who the mail is from, for the CAN-SPAM line. Empty in a build that has
   *  not set NEXT_PUBLIC_ORG_NAME: the line then omits the name rather than
   *  naming whoever wrote the template. */
  senderName: string
  // The centred line above the letter: the issue name ("The Edge - 01").
  masthead: string
}) {
  const posts = props.blocks?.posts ?? []
  const cta = props.blocks?.cta ?? null
  const layout = props.blocks?.layout ?? 'cards'
  return (
    <Html>
      <Head />
      {props.preheader ? <Preview>{props.preheader}</Preview> : null}
      <Body style={body}>
        <Container style={container}>
          <Text style={masthead}>{props.masthead}</Text>

          {/* The letter, rendered from markdown by renderMarkdown (already escaped). */}
          <div dangerouslySetInnerHTML={{ __html: props.bodyHtml }} />

          {posts.length > 0 && layout === 'list' ? <PostList posts={posts} /> : null}
          {posts.length > 0 && layout === 'feature' ? <PostFeature posts={posts} /> : null}
          {posts.length > 0 && layout === 'cards' ? posts.map((post) => <PostCard key={post.url} post={post} />) : null}

          {cta ? (
            <Section style={ctaBox}>
              <Text style={ctaTagline}>{cta.tagline}</Text>
              {cta.line ? <Text style={ctaLine}>{cta.line}</Text> : null}
              <Button href={cta.url} style={ctaButton}>{cta.label}</Button>
            </Section>
          ) : null}

          <Hr style={rule} />
          <Text style={footer}>
            {/* The sender's name is a prop, not a literal: this line went out on
                every broadcast a fork sent, telling its recipients they were a
                contact of the upstream. */}
            {props.senderName
              ? `You are receiving this because you are a client or contact of ${props.senderName}.`
              : "You are receiving this because you are a client or contact."}
            <br />
            {props.postalAddress}
            <br />
            {props.unsubscribeLink ? (
              <Link href={props.unsubscribeLink} style={footerLink}>Unsubscribe</Link>
            ) : (
              'Reply to this email to unsubscribe'
            )}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
