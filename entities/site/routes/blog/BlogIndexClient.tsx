'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { UnifiedPostMeta } from '@/entities/campaigns'
import PostCard from './PostCard'
import { PAGE_META } from '@/entities/site/lib/public-routes'

const INITIAL_COUNT = 12
const LOAD_MORE = 6

type Tab = { slug: string; label: string }

// Client shell for the blog index: category filtering + infinite scroll +
// reveal animation. Data (static + DB posts, pre-sorted newest-first) is passed
// in from the server page so the list revalidates on publish.
export default function BlogIndexClient({ posts, tabs }: { posts: UnifiedPostMeta[]; tabs: Tab[] }) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const allTabs = [{ slug: 'all', label: 'All Posts' }, ...tabs]

  // Featured = the newest post (posts arrive newest-first).
  const featured = posts[0]

  const filteredPosts =
    activeCategory === 'all' ? posts : posts.filter((p) => p.categorySlug === activeCategory)

  const visiblePosts = filteredPosts.slice(0, visibleCount)
  const hasMore = visibleCount < filteredPosts.length

  useEffect(() => {
    setVisibleCount(INITIAL_COUNT)
  }, [activeCategory])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((prev) => prev + LOAD_MORE)
        }
      },
      { rootMargin: '0px 0px 300px 0px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [activeCategory, hasMore])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target) }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.reveal:not(.visible)').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [visibleCount, activeCategory])

  return (
    <main>
      {/* ═══ HERO ═══════════════════════════════════════════════ */}
      <section className="blog-hero">
        <div className="container">
          <div className="blog-hero-inner">
            <h1 className="section-title site-on-dark">AI Insights &amp; Business Intelligence</h1>
            {PAGE_META.blog.description ? <p className="blog-hero-sub">{PAGE_META.blog.description}</p> : null}

            {featured && (
              <Link href={`/post/${featured.slug}`} className="hero-featured-card">
                <Image
                  src={featured.image}
                  alt={featured.title}
                  width={600}
                  height={338}
                  className="hero-featured-img"
                />
                <div className="hero-featured-body">
                  <span className="hero-featured-cat">{featured.category}</span>
                  <p className="hero-featured-date">
                    {new Date(featured.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  <h2 className="hero-featured-title">{featured.title}</h2>
                  <p className="hero-featured-excerpt">{featured.excerpt}</p>
                  <span className="hero-featured-more">Read Article →</span>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ═══ POSTS SECTION ══════════════════════════════════════ */}
      <section className="section">
        <div className="container">
          {/* Category filter tabs */}
          <div className="blog-filter-tabs">
            {allTabs.map((cat) => (
              <button
                key={cat.slug}
                className={`blog-filter-tab${activeCategory === cat.slug ? ' active' : ''}`}
                onClick={() => setActiveCategory(cat.slug)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Card grid */}
          {filteredPosts.length > 0 ? (
            <>
              <div className="blog-cards-grid">
                {visiblePosts.map((post) => (
                  <PostCard key={post.slug} post={post} className="reveal" />
                ))}
              </div>
              {/* Sentinel for infinite scroll */}
              {hasMore && <div ref={sentinelRef} className="site-hairline" aria-hidden="true" />}
            </>
          ) : (
            <div className="blog-empty">
              <p>No posts in this category yet. Check back soon.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
