import Link from 'next/link'
import Image from 'next/image'
import type { UnifiedPostMeta } from '@/entities/campaigns'

// The one blog card, shared by the index grid and the pillar hub so the two
// never drift. The label is the pillar (the promise) when the post has one,
// otherwise the category. No hooks, so it renders on the server and inside the
// client index alike; the index passes `reveal` for its scroll animation.
export default function PostCard({ post, className = '' }: { post: UnifiedPostMeta; className?: string }) {
  return (
    <Link href={`/post/${post.slug}`} className={`blog-card${className ? ` ${className}` : ''}`}>
      <div className="blog-card-img-wrap">
        <Image
          src={post.image}
          alt={post.title}
          fill
          className="site-img-cover-only"
        />
      </div>
      <div className="blog-card-body">
        <span className="blog-card-cat">{post.pillar ?? post.category}</span>
        <span className="blog-card-date">
          {new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </span>
        <div className="blog-card-title">{post.title}</div>
        <p className="blog-card-excerpt">{post.excerpt}</p>
        <span className="blog-card-more">Read Article →</span>
      </div>
    </Link>
  )
}
