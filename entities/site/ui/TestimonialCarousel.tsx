'use client'

// The testimonial carousel every marketing page shares.
//
// It existed three times before this — on the home page, global-staffing and
// your-first-ai-hire — copy-pasted and renamed rather than shared
// (activeExtIdx / activeExtIdxGS, viewportRef / viewportRefGS / viewportRefT,
// T_COUNT / T_COUNT_GS / T_COUNT_T). The three copies were compared line by
// line before they were merged: the logic was identical, and the only real
// differences were the marker class the scroll handler looks for and the
// per-page testimonial list. Nothing here changes what any page does.
//
// The list is rendered three times over so scrolling past either end lands on
// a copy rather than a wall. What that costs — the silent jump back to the
// middle copy, the track padding that lets an edge card reach the centre, and
// the re-padding after a resize — lives in `testimonial-rail`, because none of
// it is anything React renders. This file is the markup and the active dot.
//
// This is a client island by necessity: it listens to scroll, measures the DOM
// and takes clicks. Its host pages stay Server Components.

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { attachTestimonialRail, CARD_MARKER, type TestimonialRail } from './testimonial-rail'

export type CarouselTestimonial = { text: string; name: string; role: string; avatar: string }

export default function TestimonialCarousel({ testimonials }: { testimonials: CarouselTestimonial[] }) {
  const count = testimonials.length
  // The middle copy is where the reader always ends up, so it is also where
  // they start: index `count` is the first card of that copy.
  const offset = count
  const [activeExtIdx, setActiveExtIdx] = useState(offset)
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<TestimonialRail | null>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return
    const rail = attachTestimonialRail({ viewport, track, count, onActiveChange: setActiveExtIdx })
    railRef.current = rail
    return () => {
      rail?.destroy()
      railRef.current = null
    }
  }, [count])

  const scrollToTestimonial = useCallback((realIdx: number) => {
    railRef.current?.scrollToIndex(realIdx)
  }, [])

  // The fork overlay empties the home page's endorsements, so an empty list is
  // a real case rather than a defensive one.
  if (count === 0) return null

  const extTestimonials = [...testimonials, ...testimonials, ...testimonials]
  const currentTestimonial = ((activeExtIdx - offset) % count + count) % count

  // No layout container here: the page owns where the carousel sits, and on the
  // home page that same container also holds the video rail beneath it.
  return (
    <>
      <div className="testimonials-viewport" ref={viewportRef}>
        <div className="testimonials-track" ref={trackRef}>
          {extTestimonials.map((t, i) => (
            <div key={i} className={`testimonial-card ${CARD_MARKER}${i === activeExtIdx ? ' active' : ''}`}>
              <span className="testimonial-quote">&ldquo;</span>
              <p className="testimonial-text">{t.text}</p>
              <div className="testimonial-person">
                <Image src={t.avatar} alt={t.name} width={52} height={52} className="testimonial-avatar" />
                <div>
                  <div className="testimonial-name">{t.name}</div>
                  <div className="testimonial-role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="testimonials-nav">
        <div className="testimonials-dots">
          {testimonials.map((_, i) => (
            <button
              key={i}
              className={`testimonials-dot${i === currentTestimonial ? ' active' : ''}`}
              onClick={() => scrollToTestimonial(i)}
              aria-label={`Go to testimonial ${i + 1}`}
            />
          ))}
        </div>
        <div className="testimonials-arrows">
          <button
            className="testimonials-arrow"
            aria-label="Previous"
            onClick={() => scrollToTestimonial((currentTestimonial - 1 + count) % count)}
          >
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button
            className="testimonials-arrow"
            aria-label="Next"
            onClick={() => scrollToTestimonial((currentTestimonial + 1) % count)}
          >
            <svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18" /></svg>
          </button>
        </div>
      </div>
    </>
  )
}
