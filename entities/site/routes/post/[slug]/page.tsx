import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getAllPublishedPosts, getAllPublishedSlugs, getUnifiedPostBySlug, type UnifiedPostMeta } from '@/entities/campaigns'
import { BRAND, pageTitle } from '@/entities/site/lib/brand-name'

// The blog is DB-driven: every published post is prerendered from the DB at
// build. dynamicParams (default true) renders any newly published slug on
// demand and then caches it.
export async function generateStaticParams() {
  return (await getAllPublishedSlugs()).map((slug) => ({ slug }))
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const post = await getUnifiedPostBySlug(params.slug)
  if (!post) return {}
  // DB posts carry a purpose-built title tag; static posts keep the
  // "| <brand> Blog" convention, with the brand from configuration.
  const title =
    post.titleTag && post.titleTag.length > 0
      ? post.titleTag
      : pageTitle(post.title, BRAND ? `${BRAND} Blog` : 'Blog')
  // Prefer a real meta description / excerpt; fall back so Google never sees "8 min read · Innovation"
  const description = (post.metaDescription && post.metaDescription.length > 30)
    ? post.metaDescription.slice(0, 160)
    : (post.excerpt && post.excerpt.length > 30)
      ? post.excerpt.slice(0, 160)
      : `${post.title}. ${post.readTime} on AI and business${BRAND ? ` by ${BRAND}` : ''}.`
  const canonical = `/post/${post.slug}/`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'article',
      // The branded 1200x630 card (opengraph-image.tsx in this segment), not
      // the on-page hero: heroes are square-ish and crop badly in link previews.
      images: [{ url: `/post/${post.slug}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`/post/${post.slug}/opengraph-image`],
    },
  }
}

export default async function PostPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const post = await getUnifiedPostBySlug(params.slug)
  if (!post) notFound()

  // FAQPage structured data, so the post's Q&As are eligible for Google rich
  // results and can be lifted directly by AI answer engines. Rendered only when
  // the post actually carries an FAQ.
  const faqJsonLd = post.faq.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: post.faq.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      }
    : null

  // Sidebar: the rest of this post's series, meaning the same content pillar
  // (the argument), falling back to the same category for a post without one.
  const inSeries = (p: UnifiedPostMeta) =>
    post.pillarSlug ? p.pillarSlug === post.pillarSlug : p.categorySlug === post.categorySlug
  const relatedPosts = (await getAllPublishedPosts())
    .filter((p) => inSeries(p) && p.slug !== post.slug)
    .slice(0, 5)

  return (
    <main>
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      {/* ═══ POST HERO — dark section, cover image only ══════════ */}
      <section className="post-hero">
        <div className="post-cover-wrap">
          <Image
            src={post.image}
            alt={post.title}
            width={1600}
            height={520}
            className="post-cover"
            priority
          />
        </div>
      </section>

      {/* ═══ POST CONTENT ════════════════════════════════════════ */}
      <section className="post-section">
        <div className="container">
          <div className="post-layout">
            {/* Main article */}
            <article>
              <div className="post-meta">
                {post.pillar && post.pillarSlug && (
                  <Link href={`/blog/${post.pillarSlug}/`} className="site-eyebrow">
                    {post.pillar}
                  </Link>
                )}
                <Link href={`/blog#${post.categorySlug}`} className="post-category-tag">
                  {post.category}
                </Link>
                <span className="post-date">
                  {new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="post-read-time">{post.readTime}</span>
              </div>
              <h1 className="post-title">{post.title}</h1>
              <div
                className="post-body"
                dangerouslySetInnerHTML={{ __html: post.contentHtml }}
              />
              <div className="post-all-posts">
                <Link href="/blog" className="btn btn-secondary">← All Posts</Link>
              </div>
            </article>

            {/* Sidebar */}
            <aside className="post-sidebar">
              <div className="sidebar-title">{post.pillar ? 'More in this series' : `More in ${post.category}`}</div>
              {relatedPosts.map((p) => (
                <Link key={p.slug} href={`/post/${p.slug}`} className="sidebar-post">
                  <Image
                    src={p.image}
                    alt={p.title}
                    width={64}
                    height={64}
                    className="sidebar-post-img"
                  />
                  <div className="sidebar-post-text">
                    <div className="sidebar-post-title">{p.title}</div>
                    <div className="sidebar-post-date">
                      {new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </Link>
              ))}
              {post.pillar && post.pillarSlug && (
                <Link href={`/blog/${post.pillarSlug}/`} className="sidebar-all">
                  All posts in {post.pillar} →
                </Link>
              )}
            </aside>
          </div>
        </div>
      </section>
    </main>
  )
}
