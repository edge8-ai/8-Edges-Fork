'use client'

import { useState } from 'react'
import { BRAND } from '@/entities/site/lib/brand-name'

type Props = {
  jobId: string
  jobTitle: string
  jobSlug: string
  questions: string[] // up to 3, configured per role on the job requisition
}

const MAX_RESUME_MB = 10

export default function ApplyForm({ jobId, jobTitle, jobSlug, questions }: Props) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    linkedin: '',
    cover_letter: '',
    website: '', // honeypot
  })
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ''))
  const [resume, setResume] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (file && file.size > MAX_RESUME_MB * 1024 * 1024) {
      setError(`Resume must be under ${MAX_RESUME_MB} MB`)
      setResume(null)
      return
    }
    setError(null)
    setResume(file)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!resume) {
      setError('Please attach your resume')
      return
    }
    if (answers.some((a) => !a.trim())) {
      setError('Please answer all the questions for this role')
      return
    }
    setStatus('sending')
    setError(null)
    try {
      const fd = new FormData()
      fd.append('job_id', jobId)
      fd.append('job_title', jobTitle)
      fd.append('job_slug', jobSlug)
      fd.append('full_name', form.full_name)
      fd.append('email', form.email)
      fd.append('phone', form.phone)
      fd.append('linkedin', form.linkedin)
      fd.append('cover_letter', form.cover_letter)
      answers.forEach((a, i) => fd.append(`answer_${i}`, a))
      fd.append('website', form.website)
      fd.append('resume', resume)

      const res = await fetch('/api/careers/apply', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to submit')
      setStatus('sent')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="site-apply-success">
        <h2>Application received</h2>
        <p>
          Thanks for applying for <strong>{jobTitle}</strong>. We&apos;ll review your
          submission and follow up by email if there&apos;s a fit.
        </p>
      </div>
    )
  }

  return (
    <form className="site-contact-form" onSubmit={handleSubmit} noValidate>
      <div className="site-contact-field-row">
        <div className="site-contact-field">
          <label htmlFor="full_name">Full name *</label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            autoComplete="name"
            value={form.full_name}
            onChange={handleChange}
          />
        </div>
        <div className="site-contact-field">
          <label htmlFor="email">Email *</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="site-contact-field-row">
        <div className="site-contact-field">
          <label htmlFor="phone">Phone</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={handleChange}
          />
        </div>
        <div className="site-contact-field">
          <label htmlFor="linkedin">LinkedIn URL</label>
          <input
            id="linkedin"
            name="linkedin"
            type="url"
            placeholder="https://linkedin.com/in/…"
            value={form.linkedin}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="site-contact-field">
        <label htmlFor="cover_letter">Cover letter</label>
        <textarea
          id="cover_letter"
          name="cover_letter"
          rows={6}
          placeholder={`Tell us why${BRAND ? ` ${BRAND}` : " us"}, and why this role. Paste it in — no attachment needed.`}
          value={form.cover_letter}
          onChange={handleChange}
        />
      </div>

      {questions.map((q, i) => (
        <div className="site-contact-field" key={i}>
          <label htmlFor={`answer_${i}`}>{q} *</label>
          <textarea
            id={`answer_${i}`}
            name={`answer_${i}`}
            rows={3}
            required
            value={answers[i]}
            onChange={(e) =>
              setAnswers((cur) => cur.map((a, j) => (j === i ? e.target.value : a)))
            }
          />
        </div>
      ))}

      <div className="site-contact-field">
        <label htmlFor="resume">Resume * (PDF or Word, max {MAX_RESUME_MB} MB)</label>
        <input
          id="resume"
          name="resume"
          type="file"
          required
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFile}
        />
        {resume && (
          <p className="apply-file-name">
            Selected: {resume.name} ({Math.round(resume.size / 1024)} KB)
          </p>
        )}
      </div>

      {/* honeypot */}
      <input
        type="text"
        name="website"
        value={form.website}
        onChange={handleChange}
        tabIndex={-1}
        aria-hidden
        className="u-hidden" /* layout-ok: hidden honeypot field */
      />

      {error && <p className="site-apply-error">{error}</p>}

      <button
        type="submit"
        className="btn btn-primary site-contact-submit"
        disabled={status === 'sending'}
      >
        {status === 'sending' ? 'Submitting…' : 'Submit application'}
      </button>

      <p className="site-contact-form-note">We&apos;ll only use your details to evaluate this application.</p>
    </form>
  )
}
