'use client'

// The YouTube testimonial rail on the home page.
//
// It lives beside the route rather than in entities/site/ui because only the
// home page uses it, and it is a separate file because owning one piece of
// state was otherwise enough to make the whole 450-line page a client bundle.
//
// The shuffle is deliberate and order-sensitive: the clips render in source
// order on the server and on first paint, so the markup the client hydrates
// matches what the server sent, and only then are they reordered. Shuffling
// during render instead would produce a different order on each side and throw
// a hydration mismatch. Keep the useState initial value as the source order.

import { useEffect, useRef, useState } from 'react'

export type VideoTestimonial = { id: string; name: string; caption: string }

// One card's width plus its gap, which is how far a click of the arrows moves
// the rail. It matches .yt-card in app/globals.css.
const SCROLL_STEP = 440

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function VideoTestimonials({ videos }: { videos: VideoTestimonial[] }) {
  const [order, setOrder] = useState(videos)
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOrder(shuffle(videos))
  }, [videos])

  // A ref, not document.querySelector('.yt-viewport'): the arrows belong to
  // this rail and should not reach across the page by selector to find it.
  const scrollBy = (delta: number) =>
    viewportRef.current?.scrollBy({ left: delta, behavior: 'smooth' })

  return (
    <div className="yt-slider-wrap">
      <div className="yt-viewport" ref={viewportRef}>
        <div className="yt-track">
          {order.map((v) => (
            <div key={v.id} className="yt-card">
              <iframe
                src={`https://www.youtube.com/embed/${v.id}`}
                title={`${v.name} — ${v.caption}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
                className="yt-iframe"
              />
              <div className="yt-caption">
                <span className="yt-name">{v.name}</span>
                <span className="yt-role">{v.caption}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="yt-nav">
        <button className="testimonials-arrow" aria-label="Previous" onClick={() => scrollBy(-SCROLL_STEP)}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <button className="testimonials-arrow" aria-label="Next" onClick={() => scrollBy(SCROLL_STEP)}>
          <svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18" /></svg>
        </button>
      </div>
    </div>
  )
}
