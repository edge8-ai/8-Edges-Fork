import { z } from 'zod'

// The structured parts of a broadcast beside its markdown letter: the posts to
// feature and the call to action. Stored on email_campaigns.blocks as ids and
// strings; resolved into titles, excerpts and hero URLs from the live posts at
// send time (company-os owns that read), so an email never carries a stale
// copy of a post. Client-safe: no fs, no supabase.

export const broadcastCtaSchema = z.object({
  tagline: z.string().trim().min(1, 'The call to action needs a tagline.'),
  line: z.string().trim().default(''),
  label: z.string().trim().min(1, 'The button needs a label.'),
  url: z.string().trim().url('The button needs a full URL.'),
})

// How the featured posts are laid out: every post as a card with its hero
// (cards), a numbered text list with no images (list), or the first post as a
// card and the rest as compact rows (feature).
export const broadcastLayouts = ['cards', 'list', 'feature'] as const
export type BroadcastLayout = (typeof broadcastLayouts)[number]

export const broadcastBlocksSchema = z.object({
  posts: z.array(z.string().uuid()).max(6).default([]),
  cta: broadcastCtaSchema.nullable().default(null),
  layout: z.enum(broadcastLayouts).default('cards'),
})

export type BroadcastCta = z.infer<typeof broadcastCtaSchema>
export type BroadcastBlocks = z.infer<typeof broadcastBlocksSchema>

// A stored value read back from the database: anything malformed renders as a
// plain letter rather than failing the send.
export function parseBroadcastBlocks(value: unknown): BroadcastBlocks {
  const parsed = broadcastBlocksSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : { posts: [], cta: null, layout: 'cards' }
}

export type RenderedPost = {
  title: string
  excerpt: string
  imageUrl: string | null
  url: string
  pillar: string | null
}

export type RenderedBlocks = {
  posts: RenderedPost[]
  cta: BroadcastCta | null
  layout: BroadcastLayout
}
