'use client'

import { useState } from 'react'
import { SUPPORT_EMAIL } from "@/kernel/config/organisation";
import { BRAND } from '@/entities/site/lib/brand-name'

// A confirm step rather than an unsubscribe-on-load. Mail scanners and link
// previewers fetch every URL in an email, so a GET that unsubscribes would opt
// people out who never clicked anything. The one-click header path is a
// separate POST from the mail client itself, which is safe because it only
// fires on a real button press.

export function UnsubscribeForm({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleUnsubscribe() {
    setStatus('sending')
    try {
      const res = await fetch(`/api/unsubscribe/?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (res.ok && data.ok) {
        setStatus('done')
      } else {
        setStatus('error')
        setMessage(data.error ?? 'Something went wrong.')
      }
    } catch {
      setStatus('error')
      setMessage('Could not reach the server.')
    }
  }

  if (status === 'done') {
    return (
      <p>
        <strong>You&rsquo;re unsubscribed.</strong> You will not receive any more marketing email
        {BRAND ? ` from ${BRAND}` : ''}. You may still get essential messages about services you use, such as event
        tickets or account notices.
      </p>
    )
  }

  return (
    <>
      <p>
        Click below to stop receiving marketing email{BRAND ? ` from ${BRAND}` : ''}. This does not affect essential
        messages about services you already use.
      </p>
      <p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleUnsubscribe}
          disabled={status === 'sending'}
        >
          {status === 'sending' ? 'Unsubscribing…' : 'Unsubscribe me'}
        </button>
      </p>
      {status === 'error' && (
        <p>
          {message} You can also email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will remove you by hand.
        </p>
      )}
    </>
  )
}
