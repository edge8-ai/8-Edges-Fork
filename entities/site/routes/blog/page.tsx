import { categories } from '@/entities/site/lib/postData'
import { getAllPublishedPosts } from '@/entities/campaigns'
import BlogIndexClient from './BlogIndexClient'

// Server page: fetch the merged static + DB post list (tag-cached, degrades to
// static-only on a DB blip), hand it to the client shell. Revalidates on publish
// because the DB list goes through the tagged cache in lib/blog.
export default async function BlogPage() {
  const posts = await getAllPublishedPosts()
  return <BlogIndexClient posts={posts} tabs={categories} />
}
