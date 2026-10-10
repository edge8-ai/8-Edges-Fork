import type { Metadata } from 'next'
import { PAGE_META } from '@/entities/site/lib/public-routes'

const { title, description } = PAGE_META.blog

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/blog/' },
  openGraph: { title, description, url: '/blog/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
