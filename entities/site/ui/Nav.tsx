'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { COMPANY_LINKS, HAS_WORKFLOWS, LOGO_SRC, NAV_EXTRA, PRODUCT_LINKS, SERVICES } from '@/entities/site/lib/public-routes'
import { ORG_NAME } from '@/kernel/config/organisation'

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [servicesOpen, setServicesOpen] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  // Any route change closes the menu: the logo, Back, a search result. Each
  // link used to close it by hand, so anything that was not one of those
  // links left it covering the new page (M2.4). Reset while rendering, the
  // way React documents for state that follows a prop.
  const [menuPath, setMenuPath] = useState(pathname)
  if (menuPath !== pathname) {
    setMenuPath(pathname)
    setMenuOpen(false)
  }
  const closeMenu = () => setMenuOpen(false)

  // On the retreat funnel, the persistent nav CTA feeds the checkout instead of
  // competing with it (Book a Conversation → a different destination).
  const onRetreatFunnel = pathname?.startsWith('/saigon-private') ?? false
  const ctaHref = onRetreatFunnel ? '/reserve/saigon-private' : '/contact'
  const ctaLabel = onRetreatFunnel ? 'Reserve a retreat' : 'Book a Conversation'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = () => {
      setServicesOpen(false)
      setResourcesOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const toggleMenu = () => setMenuOpen((v) => !v)

  // While the menu covers the page, the page behind it must not scroll under
  // a swipe, and Escape closes it.
  //
  // Above 960px the stylesheet hides the menu and the hamburger, so a phone
  // turned to landscape with the menu open would keep the page locked with
  // nothing on screen to unlock it. The menu therefore closes as soon as the
  // viewport is that wide, which also releases the lock. The CSS hide stays
  // for the frame before this runs.
  useEffect(() => {
    if (!menuOpen) return
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const wide = window.matchMedia('(min-width: 961px)')
    const onWidth = () => {
      if (wide.matches) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    wide.addEventListener('change', onWidth)
    onWidth()
    return () => {
      document.body.style.overflow = before
      document.removeEventListener('keydown', onKey)
      wide.removeEventListener('change', onWidth)
    }
  }, [menuOpen])

  const hamburgerStyle = (i: number) => {
    if (!menuOpen) return {}
    if (i === 0) return { transform: 'rotate(45deg) translate(5px, 5px)' }
    if (i === 1) return { opacity: 0 }
    return { transform: 'rotate(-45deg) translate(5px, -5px)' }
  }

  return (
    <>
      <nav
        id="navbar"
        className={scrolled ? 'is-scrolled' : undefined}
      >
        <div className="container">
          <div className="nav-inner">
            {/* On the home page the path does not change, so the route reset
                above never fires; the logo closes the menu itself. */}
            <Link href="/" className="nav-logo" onClick={closeMenu}>
              {LOGO_SRC ? (
                <Image src={LOGO_SRC} alt={ORG_NAME ?? ''} width={120} height={36} className="site-logo-36" priority />
              ) : (
                <span className="site-wordmark brand-label">{ORG_NAME}</span>
              )}
            </Link>

            <ul className="nav-links">
              {/* The whole item, not just its links: an empty dropdown still
                  renders a Services button that opens onto nothing, which is
                  what the fork shipped when only the contents were gated. */}
              {SERVICES.length > 0 && (
              <li
                className={servicesOpen ? 'open' : ''}
                onMouseEnter={() => setServicesOpen(true)}
                onMouseLeave={() => setServicesOpen(false)}
              >
                <button
                  aria-haspopup="true"
                  onClick={(e) => {
                    e.stopPropagation()
                    setServicesOpen((v) => !v)
                  }}
                >
                  Services <span className="dropdown-icon">▾</span>
                </button>
                <div className="dropdown">
                  {SERVICES.map((s) => (
                    <Link key={s.path} href={s.path}>{s.name}</Link>
                  ))}
                </div>
              </li>
              )}

              {NAV_EXTRA.map((l) => (
                <li key={l.path}><Link href={l.path}>{l.name}</Link></li>
              ))}
              <li
                className={resourcesOpen ? 'open' : ''}
                onMouseEnter={() => setResourcesOpen(true)}
                onMouseLeave={() => setResourcesOpen(false)}
              >
                <button
                  aria-haspopup="true"
                  onClick={(e) => {
                    e.stopPropagation()
                    setResourcesOpen((v) => !v)
                  }}
                >
                  Resources <span className="dropdown-icon">▾</span>
                </button>
                <div className="dropdown">
                  {PRODUCT_LINKS.map((l) => (
                    <Link key={l.path} href={l.path}>{l.name}</Link>
                  ))}
                  <Link href="/blog">Blog</Link>
                  {HAS_WORKFLOWS && <Link href="/workflows">Workflows</Link>}
                </div>
              </li>
              {COMPANY_LINKS.map((l) => (
                <li key={l.path}><Link href={l.path}>{l.name}</Link></li>
              ))}
              <li><Link href="/careers">Careers</Link></li>
            </ul>

            <Link href={ctaHref} className="btn btn-primary nav-cta">
              {ctaLabel}
            </Link>

            <button
              className="nav-hamburger"
              id="hamburger"
              aria-label="Menu"
              aria-expanded={menuOpen}
              aria-controls="mobileMenu"
              onClick={toggleMenu}
            >
              <span style={hamburgerStyle(0)} />
              <span style={hamburgerStyle(1)} />
              <span style={hamburgerStyle(2)} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div className={`mobile-menu${menuOpen ? ' open' : ''}`} id="mobileMenu">
        {SERVICES.length > 0 && (
          <MobileAccordion label="Services" id="mobileServicesAccordion">
            {SERVICES.map((l) => (
              <Link key={l.path} href={l.path} onClick={closeMenu}>{l.name}</Link>
            ))}
          </MobileAccordion>
        )}

        {NAV_EXTRA.map((l) => (
          <Link key={l.path} href={l.path} onClick={closeMenu}>{l.name}</Link>
        ))}
        <MobileAccordion label="Resources" id="mobileResourcesAccordion">
          {PRODUCT_LINKS.map((l) => (
            <Link key={l.path} href={l.path} onClick={closeMenu}>{l.name}</Link>
          ))}
          <Link href="/blog" onClick={closeMenu}>Blog</Link>
          {HAS_WORKFLOWS && <Link href="/workflows" onClick={closeMenu}>Workflows</Link>}
        </MobileAccordion>
        {COMPANY_LINKS.map((l) => (
          <Link key={l.path} href={l.path} onClick={closeMenu}>{l.name}</Link>
        ))}
        <Link href="/careers" onClick={closeMenu}>Careers</Link>
        <Link href={ctaHref} className="btn btn-primary" onClick={closeMenu}>
          {ctaLabel}
        </Link>
      </div>
    </>
  )
}

function MobileAccordion({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`mobile-accordion${open ? ' open' : ''}`} id={id}>
      <button
        className="mobile-accordion-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {label} <span className="mobile-accordion-icon">▾</span>
      </button>
      <div className="mobile-accordion-panel">{children}</div>
    </div>
  )
}
