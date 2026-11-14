import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// The footer's contact column (W.145). The organisation module reads the
// support address from the environment with no fallback, and production had
// none set, so every public page printed an empty link to mailto:null. An
// unset address leaves its line out; with no phone either, the column goes.

async function renderFooter({ email, phones }: { email: string | null; phones: string[] }) {
  vi.resetModules()
  vi.doMock('@/kernel/config/organisation', async (importActual) => ({
    ...(await importActual<typeof import('@/kernel/config/organisation')>()),
    SUPPORT_EMAIL: email,
  }))
  const { default: PublicFooter } = await import('./PublicFooter')
  const { EMPTY_PUBLIC_PRESENCE } = await import('./presence')
  return renderToStaticMarkup(<PublicFooter presence={{ ...EMPTY_PUBLIC_PRESENCE, phones }} />)
}

afterEach(() => {
  vi.doUnmock('@/kernel/config/organisation')
})

describe('Footer contact column', () => {
  it('links the support address when one is set', async () => {
    const html = await renderFooter({ email: 'help@example.com', phones: [] })

    expect(html).toContain('href="mailto:help@example.com"')
    expect(html).toContain('>Contact<')
  })

  it('leaves the email line out when the address is unset, and keeps the phones', async () => {
    const html = await renderFooter({ email: null, phones: ['+1 555 0100'] })

    expect(html).not.toContain('mailto:')
    expect(html).toContain('+1 555 0100')
    expect(html).toContain('>Contact<')
  })

  it('drops the whole column when there is neither an address nor a phone', async () => {
    const html = await renderFooter({ email: null, phones: [] })

    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('>Contact<')
  })
})
