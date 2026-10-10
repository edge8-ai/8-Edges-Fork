'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { track } from '@vercel/analytics'

const SOURCE_KEY = 'edge8:source'

// Where this visit came from, as a page on this site named it with
// ?utm_source=... Kept for the browser session, so a visitor who arrives on
// /8-edges-app from The Stack and then reads the install guide is still
// credited to The Stack when they click through to GitHub.
function readSource(): string {
  try {
    return window.sessionStorage.getItem(SOURCE_KEY) ?? 'direct'
  } catch {
    return 'direct'
  }
}

/** Remembers the utm_source of the landing URL for the rest of the session. */
export function RememberSource() {
  useEffect(() => {
    const source = new URLSearchParams(window.location.search).get('utm_source')
    if (!source) return
    try {
      window.sessionStorage.setItem(SOURCE_KEY, source)
    } catch {
      // Blocked storage: the click is still counted, just credited to direct.
    }
  }, [])
  return null
}

type Props = {
  href: string
  event: string
  placement: string
  className?: string
  external?: boolean
  children: React.ReactNode
}

/** A link that records a Vercel Analytics custom event, with where on the page
 *  it sits and which source brought the visitor, before it navigates. */
export default function TrackedLink({ href, event, placement, className, external, children }: Props) {
  const onClick = () => track(event, { placement, source: readSource() })
  if (external) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer" onClick={onClick}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  )
}
