'use client'

import { useState, useTransition } from 'react'
import { PasswordInput } from '@/kernel/ui/PasswordInput'
import { ACCESS_CODE_NEXT_PARAM } from '@/kernel/ui/access-code-next'

// The unlock form, and nothing else.
//
// This replaces the old PrivateGate, which held the access code as a literal in
// the client bundle, compared it in the browser and set `edge8_private_ok=1`
// itself — so anyone could read the code from the bundle, and anyone could skip
// it by setting the cookie. This component now knows no secret at all: it posts
// the typed code to a server action, which does the comparison and mints an
// HMAC-signed cookie. The surrounding server layout decides whether children
// render, so gated content never reaches the browser unverified either.
//
// Every gated area reuses this one component; `variant` only picks between the
// two looks the site already had (the full-width library section, and the
// centred card the /private client documents use). It lives in the kernel so a
// portable entity's gate (the /proposals index) can use it too; the library's
// PrivateUnlockForm wraps it with the library's own `?next=` validation.

export type UnlockAction = (code: string) => Promise<{ ok: true } | { ok: false; error: string }>

export interface AccessCodeFormProps {
  action: UnlockAction
  title: string
  description?: string
  label?: string
  variant?: 'library' | 'card'
  /**
   * Validates the `?next=` path to follow after a successful unlock, returning
   * null to refuse it. Without one the form only reloads, so it can never be an
   * open redirect.
   */
  returnPath?: (candidate: string | null) => string | null
}

export default function AccessCodeForm({
  action,
  title,
  description = 'Enter the access code to view this page.',
  label = 'Internal · Access required',
  variant = 'library',
  returnPath,
}: AccessCodeFormProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const submitted = code
    startTransition(async () => {
      const result = await action(submitted)
      if (result.ok) {
        // The cookie is set by the action. If a document route sent us here
        // with ?next=, go back to the document that was actually asked for;
        // otherwise refresh so the gating layout re-runs on the server and
        // renders the content it was withholding. `next` is followed only when
        // the caller's `returnPath` accepts it, and with no `returnPath` the
        // form only reloads, so this can never become an open redirect.
        setError(null)
        const next = returnPath ? returnPath(new URLSearchParams(window.location.search).get(ACCESS_CODE_NEXT_PARAM)) : null
        if (next) window.location.assign(next)
        else window.location.reload()
      } else {
        setError(result.error)
      }
    })
  }

  if (variant === 'card') {
    return (
      <div
        style={{ /* layout-ok: the gate renders before any page chrome and must not depend on a stylesheet — same reason components/PasswordInput.tsx is inline-only */
          minHeight: '100vh',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '108px 24px 56px',
          fontFamily: "'Manrope', 'Helvetica Neue', Arial, sans-serif",
          background: 'var(--color-bg-primary)',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{ width: "100%", maxWidth: "360px", background: "var(--color-bg-primary)", border: "1px solid var(--color-card-border)", borderRadius: "20px", padding: "28px 26px", boxShadow: "0 4px 24px color-mix(in srgb, var(--color-primary-dark) 6%, transparent)" }} /* layout-ok: private gate renders before page chrome, no stylesheet */
        >
          <h1 /* layout-ok: private gate renders before page chrome, no stylesheet */ style={{ margin: "0 0 4px", fontSize: "20px", color: "var(--color-primary-dark)" }}>{title}</h1>
          <p /* layout-ok: private gate, no stylesheet */ style={{ margin: "0 0 18px", fontSize: "14px", color: "var(--color-text-body)" }}>{description}</p>
          <PasswordInput
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setError(null)
            }}
            placeholder="Access code"
            autoFocus
            wrapperStyle={{ marginBottom: error ? '8px' : '16px' }}
            inputStyle={{
              padding: '11px 12px',
              // 16px: iPhone Safari zooms in on a field under 16px (M3.7).
              fontSize: '16px',
              border: `1px solid ${error ? 'var(--color-err-strong)' : 'var(--color-input-border)'}`,
              borderRadius: '10px',
              outline: 'none',
            }}
          />
          {error && (
            <p /* layout-ok: private gate, no stylesheet */ style={{ margin: "0 0 14px", fontSize: "13px", color: "var(--color-err-strong)" }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            style={{ width: "100%", padding: "11px 12px", fontSize: "15px", fontWeight: 600, color: "var(--color-bg-primary)", background: "var(--color-primary-blue)", border: "none", borderRadius: "40px", cursor: pending ? "progress" : "pointer" }} /* layout-ok: private gate, no stylesheet */
          >
            {pending ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <section className="section" style={{ minHeight: "60vh", display: "flex", alignItems: "center" }}> {/* layout-ok: the gate renders before any page chrome and must not depend on a stylesheet — same reason components/PasswordInput.tsx is inline-only */}
      <div className="container u-max-sm">
        <span className="section-label">{label}</span>
        <h1 className="section-title u-h-28 u-mb-3">
          {title}
        </h1>
        <p className="wf-hero-sub u-mb-5">
          {description}
        </p>
        <form onSubmit={handleSubmit} style={{ /* layout-ok: stylesheet-free gate form, see above */ display: "flex", gap: 8 }}>
          <PasswordInput
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setError(null)
            }}
            placeholder="Access code"
            autoFocus
            wrapperStyle={{ flex: 1 }}
            inputStyle={{
              padding: '10px 14px',
              borderRadius: 6,
              border: error ? '1px solid var(--color-err-strong)' : '1px solid var(--border, var(--color-grey-300))',
              fontSize: 16,
            }}
          />
          <button
            type="submit"
            disabled={pending}
            style={{ flex: "none", padding: "10px 22px", fontSize: "15px", fontWeight: 600, color: "var(--color-bg-primary)", background: "var(--color-primary-blue)", border: "none", borderRadius: "40px", cursor: pending ? "progress" : "pointer" }} /* layout-ok: private gate, no stylesheet; the same button as the card variant */
          >
            {pending ? 'Checking…' : 'Unlock'}
          </button>
        </form>
        {error && <p /* layout-ok: private gate, no stylesheet */ style={{ color: "var(--color-err-strong)", fontSize: 14, marginTop: 8 }}>{error}</p>}
      </div>
    </section>
  )
}
