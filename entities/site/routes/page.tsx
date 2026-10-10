import Link from 'next/link'
import RevealObserver from '@/entities/site/ui/RevealObserver'
import { getAllPublishedPosts } from '@/entities/campaigns'
import { ORG_DESCRIPTION, ORG_NAME } from '@/kernel/config/organisation'

// The public landing page.
//
// This file is an overlay for 8-Edges-Fork. It only replaces upstream while it
// sits at the SAME repo-relative path as the real page — today
// entities/site/routes/page.tsx, mounted at app/page.tsx.
//
// Upstream's home page is the upstream's marketing site: fourteen sections of its
// positioning, its mental models, its service tiers and its own numbers. A
// fork inherited all of it, on the fork's own domain. Gating the sections that
// named clients was not enough — what was left still read as somebody else's
// company.
//
// So this is a different page, not a stripped copy of that one. Everything on
// it is either the operator's own name (NEXT_PUBLIC_ORG_NAME) or the
// operator's own content (posts they have published). Nothing here makes a
// claim on their behalf, and there is no placeholder anyone has to remember to
// replace before going live.
//
// It is meant to be edited. Add sections below the hero the way upstream does:
// <section className="section"> wrapping <div className="container">, with
// .section-label / .section-title / .section-sub for the type, .reveal on
// anything that should fade in, and .btn.btn-primary for a call to action. The
// classes are all in app/globals.css, which every page already loads.
//
// A server component: the post list is real data, and RevealObserver is the
// one client bit. getAllPublishedPosts returns [] on any database error, so an
// unconfigured fork renders the hero and the contact band and nothing breaks.

export const revalidate = 3600

export default async function HomePage() {
  const posts = (await getAllPublishedPosts()).slice(0, 4)

  return (
    <main>
      <RevealObserver />

      {/* ═══ HERO ═══════════════════════════════════════════ */}
      <section className="hero" id="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="container">
          <div className="hero-content">
            <h1 className="hero-headline">{ORG_NAME}</h1>
            {/* The one line of prose on the page, and it is the operator's own:
                NEXT_PUBLIC_ORG_DESCRIPTION is already read for the schema.org
                block in app/layout.tsx, so setting it once fills both. */}
            {ORG_DESCRIPTION ? <p className="hero-sub">{ORG_DESCRIPTION}</p> : null}
            <p className="hero-sub">
              <Link href="/contact" className="accent">Get in touch</Link> to talk about working
              together.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ LATEST POSTS ═══════════════════════════════════ */}
      {/* Hidden entirely until something is published: an empty "Insights"
          heading over nothing is worse than no section at all. */}
      {posts.length > 0 && (
        <section className="blog section" id="blog">
          <div className="container">
            <div className="site-blog-header reveal">
              <div>
                <span className="section-label">Insights</span>
                <h2 className="section-title">Latest writing</h2>
              </div>
              <Link href="/blog" className="text-link">View all posts →</Link>
            </div>
            <div className="site-blog-stack">
              {posts.map((post) => (
                <Link key={post.slug} href={`/post/${post.slug}`} className="site-blog-item reveal">
                  <div className="site-blog-item-body">
                    <h4 className="site-blog-item-title">{post.title}</h4>
                    {post.excerpt ? (
                      <p className="site-blog-item-excerpt">{post.excerpt}</p>
                    ) : null}
                  </div>
                  <span className="site-blog-item-arrow">→</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ CONTACT ════════════════════════════════════════ */}
      <section className="site-contact-blue section" id="contact">
        <div className="container">
          <div className="site-contact-blue-inner">
            <div className="reveal">
              <h2 className="section-title">Start a conversation</h2>
              <p className="section-sub">Tell us what you are working on and we will come back to you.</p>
            </div>
            <div className="site-contact-blue-cta reveal">
              <Link href="/contact" className="btn btn-contact">
                Contact us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
