import type { Metadata } from 'next'
import { PAGE_META } from '@/entities/site/lib/public-routes'

// Title and description from the map the fork overlay replaces: this page used
// to advertise the upstream's own hiring pitch on a fork's domain.
const { title, description } = PAGE_META.careers

export const metadata: Metadata = {
  title,
  ...(description ? { description } : {}),
  openGraph: { title, ...(description ? { description } : {}) },
}

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
