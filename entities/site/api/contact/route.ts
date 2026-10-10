import { Resend } from 'resend'
import { campaignIdForUtm } from '@/entities/campaigns'
import { companyOs } from '@/kernel/data/supabase'
import { getOrCreatePerson } from '@/kernel/data/company-os'
import { looksSpammy, openInquiryRun, promotePersonToLead } from '@/entities/crm'
import { notifyOps } from '@/kernel/messaging/lark'
import { NextRequest, NextResponse } from 'next/server'
import { insertInquiries } from '@/entities/crm';
import { OPS_EMAIL } from "@/kernel/config/contacts";
import { SOURCE_SITE } from "@/kernel/config/utils";
import { escapeHtml } from '@/kernel/config/html'

const FROM = process.env.CONTACT_EMAIL_FROM ?? ''

// The silent spam gate (honeypot aside) lives with the inquiry-to-lead chain
// in crm (entities/crm/lib/inquiry-screen.ts), so the route and the chain run
// one copy of it.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, company, teamSize, message, website, utm } = body
    // The campaign the visitor arrived through, when the site remembered one
    // (entities/site/lib/utm.ts). Resolved to a campaign id here, at intake,
    // so the Demand tab's attribution needs no hand.
    const utmCampaign = typeof utm?.campaign === 'string' ? utm.campaign.slice(0, 120) : null

    // Honeypot
    if (website) return NextResponse.json({ ok: true })

    if (!name || !email || !company) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Silent spam gate (see helpers above): mirror the honeypot — feign success,
    // create nothing. Logged so real blocks are auditable in Vercel logs.
    if (looksSpammy(name, email)) {
      console.warn('contact spam blocked:', { name, email, company })
      return NextResponse.json({ ok: true })
    }

    // Recipients — split ADMIN_EMAILS CSV or fall back
    const to = (process.env.ADMIN_EMAILS || OPS_EMAIL)
      .split(',').map((e: string) => e.trim()).filter(Boolean)

    // 1️⃣ Save to company_os (people + inquiries). `company` has no column on
    //    people (relational model) so it rides in inquiries.metadata.
    //
    //    Then the inquiry-to-lead chain (Z.11) decides who files it. Live: the
    //    chain qualifies it, promotes a sales inquiry and posts one line to
    //    Operations, so the route does neither. Shadow or off, or when the
    //    inquiry or its run could not be written: the route promotes and posts
    //    the raw form as it always has, and in shadow the chain only records
    //    what it would have done. A paused chain must never starve the queue.
    let todaysPath = true
    const person = await getOrCreatePerson({ email, name, source: SOURCE_SITE })
    if (person.ok) {
      const campaignId = utmCampaign ? await campaignIdForUtm(utmCampaign) : null
      const { data: inquiry, error: inquiryError } = await insertInquiries({
        person_id:   person.id,
        type:        'consultation',
        subject:     'AI Audit Request',
        message:     message || null,
        source:      SOURCE_SITE,
        source_site: SOURCE_SITE,
        status:      'new_lead',
        campaign_id: campaignId,
        metadata:    { company, team_size: teamSize || null, name, email, utm: utm && typeof utm === 'object' ? utm : null },
      }).select('id').single()
      if (inquiryError) console.error('company_os inquiry error:', inquiryError)
      if (inquiry?.id) todaysPath = (await openInquiryRun(inquiry.id)).todaysPath
      if (todaysPath) {
        // Inbound = speed-to-lead clock starts: promote into the SDR queue.
        const promoted = await promotePersonToLead(person.id, { reason: 'inbound_inquiry' })
        if (!promoted.ok) console.error('lead promotion error:', promoted.error)
      }
    } else {
      console.error('company_os person error:', person.error)
    }

    // Ops channel notice: the raw form, unless the chain posts its one line.
    if (todaysPath) {
      void notifyOps(
        `🔔 New AI Audit / Contact\n${name} <${email}>${company ? ` · ${company}` : ''}${teamSize ? ` · team ${teamSize}` : ''}${message ? `\n${message}` : ''}`,
      )
    }

    // 2️⃣ Send email via Resend. Every field is the visitor's own text on an
    // endpoint that needs no sign-in, so each is escaped before it reaches the
    // staff email's HTML (S.16.25); the message keeps its line breaks.
    const esc = (v: unknown) => escapeHtml(String(v ?? ''))
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM,
      to,
      replyTo: email,
      subject: `New AI Audit Request — ${name} at ${company}`,
      html: `
        <h2>New AI Audit Request</h2>
        <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:15px">
          <tr><td style="padding:8px 16px 8px 0;color:#666;width:140px">Name</td><td style="padding:8px 0"><strong>${esc(name)}</strong></td></tr>
          <tr><td style="padding:8px 16px 8px 0;color:#666">Email</td><td style="padding:8px 0"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
          <tr><td style="padding:8px 16px 8px 0;color:#666">Company</td><td style="padding:8px 0">${esc(company)}</td></tr>
          <tr><td style="padding:8px 16px 8px 0;color:#666">Team size</td><td style="padding:8px 0">${teamSize ? esc(teamSize) : '—'}</td></tr>
          <tr><td style="padding:8px 16px 8px 0;color:#666;vertical-align:top">Message</td><td style="padding:8px 0">${message ? esc(message).replace(/\n/g, '<br>') : '—'}</td></tr>
        </table>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Contact form error:', err)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
