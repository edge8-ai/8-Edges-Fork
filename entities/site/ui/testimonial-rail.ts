// Everything the testimonial carousel does to the DOM directly.
//
// The component around this owns the markup and the active dot; this owns the
// scroll position, the track padding and the snap property, none of which
// React renders. Keeping them apart is also what keeps the component under the
// file-size cap, but the real reason is that this half is a state machine with
// three writers of `scrollSnapType` — the edge-copy jump, a dot or arrow
// click, and a resize — and they have to agree about who holds it.

import { centredScrollLeft, edgePadding } from '../lib/carousel-geometry'

// The scroll handler finds its cards by this class. It is a marker only — no
// stylesheet defines it, and `testimonial-card` beside it carries the styling.
export const CARD_MARKER = 't-card-real'

// How long the resize has to be quiet before the track is re-padded. Long
// enough to sit out a drag-resize or a phone's address bar collapsing, short
// enough that a rotation looks like it corrected itself rather than lagged.
const RESIZE_DEBOUNCE_MS = 120

// How long after the reader stops in an outer copy before they are jumped back
// to the middle one.
const EDGE_JUMP_DELAY_MS = 50

// `scrollend` never fires when the scroll turns out to be a no-op, and Safari
// only learned it in 17.4, so a timer backs it up: without one, snapping would
// stay off for good.
const SCROLLEND_BACKSTOP_MS = 1200

type SnapRestore = { fn: () => void; timer: ReturnType<typeof setTimeout> }

export type TestimonialRail = {
  /** Smooth-scroll to a card of the middle copy, by its index in the real list. */
  scrollToIndex: (realIdx: number) => void
  destroy: () => void
}

/**
 * Take over a testimonial viewport: centre the rail, follow the reader's
 * scrolling, and keep the two invisible corrections — the jump back from an
 * edge copy and the re-padding after a resize — out of each other's way.
 *
 * `onActiveChange` is called with an index into the tripled card list every
 * time the centred card changes, which is what the dots render from.
 */
export function attachTestimonialRail({
  viewport,
  track,
  count,
  onActiveChange,
}: {
  viewport: HTMLElement
  track: HTMLElement
  count: number
  onActiveChange: (extIdx: number) => void
}): TestimonialRail | null {
  const cards = track.querySelectorAll<HTMLElement>(`.${CARD_MARKER}`)
  if (cards.length === 0) return null

  // The middle copy is where the reader always ends up, so it is also where
  // they start: index `count` is its first card.
  const offset = count

  let activeIdx = offset
  let isSnapping = false
  let jumpTimer: ReturnType<typeof setTimeout> | null = null
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let snapRestore: SnapRestore | null = null

  // Drop a pending restore without switching snapping back on — the caller is
  // either about to take the property over itself, or is tearing down.
  const cancelSnapRestore = () => {
    if (!snapRestore) return
    clearTimeout(snapRestore.timer)
    viewport.removeEventListener('scrollend', snapRestore.fn)
    snapRestore = null
  }

  const setActive = (i: number) => {
    activeIdx = i
    onActiveChange(i)
  }

  // Re-pad the track for the viewport as it is now, and put the rail back on
  // the card it was showing. `anchorIdx` is which card that is: the first of
  // the middle copy on mount, and whatever the reader had reached on a resize.
  const recentre = (anchorIdx: number) => {
    const anchor = cards[anchorIdx] ?? cards[offset]
    if (!anchor) return
    const vw = viewport.clientWidth
    const pad = edgePadding(vw, anchor.offsetWidth)
    track.style.paddingLeft = `${pad}px`
    track.style.paddingRight = `${pad}px`
    // `offsetLeft` is read after the padding write on purpose: the padding
    // moves every card in the track, so reading it first would centre against
    // the positions the cards have just left.
    viewport.scrollLeft = centredScrollLeft(anchor.offsetLeft, anchor.offsetWidth, vw)
  }

  const updateActive = () => {
    if (isSnapping) return
    const cx = viewport.scrollLeft + viewport.clientWidth / 2
    let closest = 0, minDist = Infinity
    cards.forEach((card, i) => {
      const dist = Math.abs(cx - (card.offsetLeft + card.offsetWidth / 2))
      if (dist < minDist) { minDist = dist; closest = i }
    })
    setActive(closest)

    // Jump from an edge copy back to the middle one, invisibly.
    if (jumpTimer) clearTimeout(jumpTimer)
    const targetIdx = closest < count ? closest + count
      : closest >= count * 2 ? closest - count : -1
    if (targetIdx < 0) return
    jumpTimer = setTimeout(() => {
      const target = cards[targetIdx]
      if (!target) return
      isSnapping = true
      // Snapping off for a frame so the jump is not visible.
      viewport.style.scrollSnapType = 'none'
      viewport.scrollLeft = centredScrollLeft(target.offsetLeft, target.offsetWidth, viewport.clientWidth)
      setActive(targetIdx)
      requestAnimationFrame(() => {
        viewport.style.scrollSnapType = ''
        requestAnimationFrame(() => { isSnapping = false })
      })
    }, EDGE_JUMP_DELAY_MS)
  }

  // A resize invalidates the padding, and the padding is what lets the first
  // and last cards reach the middle. Without this the rail keeps a desktop's
  // 326px on a phone that needs 21px: PR #1493 made the dot and arrow targets
  // immune to that by measuring live geometry, so what was left was the rail
  // sitting visibly off centre until some other render happened to fix it.
  const runRecentre = () => {
    resizeTimer = null
    // The edge-copy jump owns `scrollSnapType` and `scrollLeft` for the two
    // frames it lasts, and it hands the property back itself. Landing in the
    // middle of one would both make it visible and leave the rail where we put
    // it rather than where the jump was going, so wait it out instead — the
    // resize is over and nothing else is moving.
    if (isSnapping) {
      resizeTimer = setTimeout(runRecentre, RESIZE_DEBOUNCE_MS)
      return
    }
    // An in-flight smooth scroll from a dot or arrow is ended by the write
    // below, so its pending restore is stale: take the property over rather
    // than leave snapping off until that restore's backstop fires.
    cancelSnapRestore()
    viewport.style.scrollSnapType = 'none'
    recentre(activeIdx)
    requestAnimationFrame(() => {
      // Only if no jump started in between; that one restores it itself.
      if (!isSnapping) viewport.style.scrollSnapType = ''
    })
  }

  const scrollToIndex = (realIdx: number) => {
    const card = cards[offset + realIdx]   // always the middle copy
    if (!card) return

    // Where `scroll-snap-align: center` will put this card, measured now. The
    // target used to be the card's `offsetLeft` less the track padding read
    // back off the style, which put it a few pixels off the snap point
    // whenever the layout had moved under that padding — and a mandatory snap
    // container answers an off-snap target by resolving it to the nearest one,
    // which is the card already on screen. Measuring live keeps that true even
    // in the gap between a resize and the debounced re-padding.
    const left = centredScrollLeft(card.offsetLeft, card.offsetWidth, viewport.clientWidth)

    // Snapping stays off for the length of the animation. The container
    // re-resolves against its snap points whenever the layout moves under an
    // in-flight smooth scroll, and the nearest point is again the card we
    // started on, so the scroll is swallowed and the click reads as dead. The
    // jump above turns snapping off for the same reason; this is that trick
    // held open until the animation finishes.
    cancelSnapRestore()
    viewport.style.scrollSnapType = 'none'
    const restoreSnap = () => {
      cancelSnapRestore()
      // That jump owns this property while it runs and hands it back itself,
      // so a restore landing in the middle of one would make it visible.
      if (isSnapping) return
      viewport.style.scrollSnapType = ''
    }
    viewport.addEventListener('scrollend', restoreSnap)
    snapRestore = { fn: restoreSnap, timer: setTimeout(restoreSnap, SCROLLEND_BACKSTOP_MS) }

    viewport.scrollTo({ left, behavior: 'smooth' })
  }

  viewport.addEventListener('scroll', updateActive, { passive: true })
  recentre(offset)

  // The first observation fires as soon as the element is observed and reports
  // the size `recentre(offset)` has just been computed against, so it has
  // nothing to do.
  let seenFirstObservation = false
  const observer = new ResizeObserver(() => {
    if (!seenFirstObservation) { seenFirstObservation = true; return }
    // Debounced: a drag-resize, or a phone's address bar collapsing, delivers a
    // continuous stream, and each recentre forces a synchronous layout.
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(runRecentre, RESIZE_DEBOUNCE_MS)
  })
  observer.observe(viewport)

  return {
    scrollToIndex,
    destroy: () => {
      viewport.removeEventListener('scroll', updateActive)
      observer.disconnect()
      if (resizeTimer) clearTimeout(resizeTimer)
      if (jumpTimer) clearTimeout(jumpTimer)
      cancelSnapRestore()
    },
  }
}
