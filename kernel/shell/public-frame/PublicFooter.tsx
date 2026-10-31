import Link from 'next/link'
import Image from 'next/image'
import { ORG_NAME, SUPPORT_EMAIL } from "@/kernel/config/organisation";
import type { PublicPresence } from './presence'

// The public footer (A.79.7: the marketing site's Footer, moved to the kernel
// with its links passed in rather than imported from the site's copy).
//
// The marketing pages are served by a separate Next.js app that this one
// falls back to (multi-zones, next.config.mjs). A <Link> into another zone is
// a soft navigation this app cannot resolve and renders as a 404, so every link
// that may land on a marketing page is a plain <a>. Only /workflows, which this
// app serves, keeps <Link>.
export default function PublicFooter({ presence }: { presence: PublicPresence }) {
  const {
    companyLinks: COMPANY_LINKS,
    copyrightName: COPYRIGHT_NAME,
    footerTagline: FOOTER_TAGLINE,
    hasWorkflows: HAS_WORKFLOWS,
    logoDarkSrc: LOGO_DARK_SRC,
    navExtra: NAV_EXTRA,
    phones: PHONES,
    services: SERVICES,
    socialLinks: SOCIAL_LINKS,
  } = presence
  return (
    <footer>
      <div className="container">
        <div className="footer-top">
          <div>
            <div className="footer-logo">
              {LOGO_DARK_SRC ? (
                <Image src={LOGO_DARK_SRC} alt={ORG_NAME ?? ""} width={100} height={32} className="site-logo-32" />
              ) : (
                <span className="site-wordmark brand-label">{ORG_NAME}</span>
              )}
            </div>
            {FOOTER_TAGLINE && <p className="footer-desc">{FOOTER_TAGLINE}</p>}
            <div className="footer-social">
              {SOCIAL_LINKS.map((l) => (
              <a key={l.path} href={l.path} target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                {l.name}
              </a>
              ))}
            </div>
          </div>

          {SERVICES.length > 0 && (
            <div>
              <div className="footer-col-title">Services</div>
              <div className="footer-links">
                {SERVICES.map((s) => (
                  <a key={s.path} href={s.path}>{s.name}</a>
                ))}
              </div>
            </div>
          )}

          <div>
            {NAV_EXTRA.length > 0 && (
              <>
                <div className="footer-col-title">Case Studies</div>
                <div className="footer-links">
                  {NAV_EXTRA.map((l) => (
                    <a key={l.path} href={l.path}>{l.name}</a>
                  ))}
                </div>
              </>
            )}
            <div className={NAV_EXTRA.length > 0 ? "footer-col-title footer-col-title--gap" : "footer-col-title"}>Company</div>
            <div className="footer-links">
              {COMPANY_LINKS.map((l) => (
                <a key={l.path} href={l.path}>{l.name}</a>
              ))}
              <a href="/blog">Blog</a>
              {HAS_WORKFLOWS && <Link href="/workflows">Workflows</Link>}
            </div>
          </div>

          {/* An unset support address leaves its line out (organisation.ts
              promises callers render no mailto at all): the footer used to
              print an empty link to mailto:null on every public page. With no
              phone either, the Contact column itself has nothing to say. */}
          {(SUPPORT_EMAIL || PHONES.length > 0) && (
          <div>
            <div className="footer-col-title">Contact</div>
            <div className="footer-contact">
              {SUPPORT_EMAIL && (
                <div className="footer-contact-item">
                  <div className="footer-contact-icon">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                </div>
              )}
              {PHONES.length > 0 && (
                <div className="footer-contact-item">
                  <div className="footer-contact-icon">
                    <svg viewBox="0 0 24 24">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.16a16 16 0 006.93 6.93l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                    </svg>
                  </div>
                  <div>
                    {PHONES.map((n) => (
                      <div key={n}>{n}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        <div className="footer-bottom">
          {/* One expression, not three lines: JSX collapses the newline before
              the full stop into a space, which put a space before it. */}
          <div className="footer-copy">
            {`© ${new Date().getFullYear()}${COPYRIGHT_NAME ? ` by ${COPYRIGHT_NAME}` : ""}. All rights reserved.`}
          </div>
          <div className="footer-bottom-links">
            <a href="/legal/privacy">Privacy Policy</a>
            <a href="/legal/eula">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
