'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { rememberUtm } from '@/entities/site/lib/utm'
import { isBareRoute } from '@/entities/site/lib/bare-routes'
import Nav from './Nav'
import Footer from './Footer'

export default function SiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  // Which routes render without the site nav and footer, and why, is in lib/bare-routes.
  const bare = isBareRoute(pathname)
  // A campaign link lands on one page and the form is on another: keep the
  // utm_* values for the session so the inquiry can name its campaign.
  // Read off the window rather than useSearchParams, which would force a
  // Suspense boundary on every statically rendered public page.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) rememberUtm(window.location.search)
  }, [pathname])

  return (
    <>
      {!bare && <Nav />}
      {children}
      {!bare && <Footer />}
    </>
  )
}
