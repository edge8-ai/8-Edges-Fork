'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { rememberUtm } from '@/entities/site/lib/utm'
import Nav from './Nav'
import Footer from './Footer'

// Routes that render standalone, without the site nav/footer (the /admin CRM, the /team portal,
// the client portal, the reserve funnel, surveys). The private library has its own frame.
const BARE_ROUTES = ['/reserve', '/admin', '/team', '/portal', '/surveys']

export default function SiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const bare = BARE_ROUTES.some((route) => pathname?.startsWith(route))
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
