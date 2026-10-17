import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPillars, getPostsByPillar } from '@/entities/campaigns'
import PostCard from '../PostCard'
import { BRAND, pageTitle } from '@/entities/site/lib/brand-name'

// A content pillar's hub: every published post that makes this argument,
// newest first, under the pillar's thesis. One canonical URL per pillar for
// search engines and for the sales pages to point at. Prerendered from the
// cached post list; dynamicParams (default true) renders a pillar that gains
// its first post after the build on demand.
export async function generateStaticParams() {
  return (await getPillars()).map((p) => ({ pillar: p.slug }))
}

export async function generateMetadata(props: { params: Promise<{ pillar: string }> }) {
  const params = await props.params;
  const pillar = (await getPillars()).find((p) => p.slug === params.pillar)
  if (!pillar) return {}
  const title = pageTitle(pillar.name, BRAND && `${BRAND} Blog`, !BRAND && 'Blog')
  const description =
    pillar.thesis ??
    `${pillar.count} posts on ${pillar.name}${BRAND ? ` from the ${BRAND} team` : ''}.`
  const canonical = `/blog/${pillar.slug}/`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'website', images: ['/blog/opengraph-image/'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/blog/opengraph-image/'] },
  }
}

export default async function PillarPage(props: { params: Promise<{ pillar: string }> }) {
  const params = await props.params;
  const pillar = (await getPillars()).find((p) => p.slug === params.pillar)
  if (!pillar) notFound()
  const posts = await getPostsByPillar(pillar.slug)

  return (
    <main>
      <section className="blog-hero">
        <div className="container">
          <div className="blog-hero-inner">
            <span className="site-eyebrow site-on-dark">Content pillar</span>
            <h1 className="section-title site-on-dark">{pillar.name}</h1>
            {pillar.thesis && <p className="blog-hero-sub">{pillar.thesis}</p>}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="blog-cards-grid">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
          <div className="post-all-posts">
            <Link href="/blog" className="btn btn-secondary">← All Posts</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
