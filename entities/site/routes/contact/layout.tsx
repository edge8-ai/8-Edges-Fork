import type { Metadata } from 'next'
import { PAGE_META } from '@/entities/site/lib/public-routes'

const { title, description } = PAGE_META.contact

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/contact/' },
  openGraph: { title, description, url: '/contact/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
