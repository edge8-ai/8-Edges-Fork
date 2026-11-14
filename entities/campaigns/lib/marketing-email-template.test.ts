import { describe, it, expect } from 'vitest'
import { personaliseBody, renderBroadcast } from './marketing-email'

const blocks = {
  posts: [
    { title: 'The day my agents grew up', excerpt: 'Where each agent should run.', imageUrl: 'https://cdn.example/hero.png', url: 'https://www.example.com/post/ai-agents-for-business/', pillar: 'Build with AI' },
  ],
  cta: { tagline: 'The model is ready. Is your process?', line: 'One hour, your workflows and your data map.', label: 'Book a conversation', url: 'https://www.example.com/contact/' },
  layout: 'cards' as const,
}

const threePosts = [1, 2, 3].map((n) => ({ title: `Post ${n}`, excerpt: `Excerpt ${n}`, imageUrl: `https://cdn.example/${n}.png`, url: `https://www.example.com/post/p${n}/`, pillar: 'Build with AI' }))

describe('renderBroadcast', () => {
  it('renders the letter, the post card, the call to action and the footer as HTML and plain text', async () => {
    const { html, text } = await renderBroadcast({
      subject: 'The Edge 01: The Hard Truth About AI Systems',
      preheader: 'three posts from a month of handing work to models',
      bodyMd: 'Hi Dave,\n\nI closed my laptop and the **newsletter** still went out.',
      blocks,
      unsubscribeLink: 'https://www.example.com/unsubscribe/?token=abc',
    })
    for (const part of ['Hi Dave,', '<strong>newsletter</strong>', 'The day my agents grew up', 'Build with AI', 'https://cdn.example/hero.png', 'The model is ready. Is your process?', 'Book a conversation', 'https://www.example.com/contact/', 'Unsubscribe', '1 Example Street']) {
      expect(html).toContain(part)
    }
    expect(html).toContain('three posts from a month')
    expect(html).toContain('The Edge - 01')
    expect(html).toContain('text-align:center')
    for (const part of ['Hi Dave,', 'newsletter', 'The day my agents grew up', 'Book a conversation', 'https://www.example.com/post/ai-agents-for-business/']) {
      expect(text).toContain(part)
    }
    expect(text).not.toContain('<')
  })

  it('renders the list layout as numbered rows without images', async () => {
    const { html } = await renderBroadcast({ bodyMd: 'Note.', blocks: { ...blocks, posts: threePosts, layout: 'list' }, unsubscribeLink: null })
    expect(html).not.toContain('cdn.example/1.png')
    expect(html).toContain('Post 3')
    expect((html.match(/Read the post/g) ?? []).length).toBe(3)
  })

  it('renders the feature layout with one lead card and thumbnails for the rest', async () => {
    const { html } = await renderBroadcast({ bodyMd: 'Note.', blocks: { ...blocks, posts: threePosts, layout: 'feature' }, unsubscribeLink: null })
    expect(html).toContain('width="536"')
    expect((html.match(/width="72"/g) ?? []).length).toBe(2)
  })

  it('renders a plain letter when there are no blocks', async () => {
    const { html } = await renderBroadcast({ bodyMd: 'Just a note.', blocks: null, unsubscribeLink: null })
    expect(html).toContain('Just a note.')
    expect(html).toContain('Reply to this email to unsubscribe')
    expect(html).not.toContain('Read the post')
  })
})

describe('personaliseBody', () => {
  it('substitutes the first name, and "there" when none is recorded', () => {
    expect(personaliseBody('Hi {first_name},', 'Dave')).toBe('Hi Dave,')
    expect(personaliseBody('Hi {first_name},', '  ')).toBe('Hi there,')
    expect(personaliseBody('Hi {first_name},', null)).toBe('Hi there,')
  })
})
