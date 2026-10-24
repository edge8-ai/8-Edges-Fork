import { describe, expect, it } from 'vitest'
import { centredScrollLeft, edgePadding } from './carousel-geometry'

// The numbers in here are the ones N.12 measured on your-first-ai-hire: a
// desktop mount left the padding at 326px, and the correct value for the
// mobile viewport that followed was 21px. A single mount computation cannot
// produce both, which is the whole of the bug.
describe('edgePadding', () => {
  it('leaves half the slack on each side, so an edge card reaches the middle', () => {
    expect(edgePadding(1000, 348)).toBe(326)
    expect(edgePadding(390, 348)).toBe(21)
  })

  it('answers the new viewport, not the one the component mounted at', () => {
    const cardWidth = 348
    expect(edgePadding(1000, cardWidth)).not.toBe(edgePadding(390, cardWidth))
  })

  it('clamps at zero when the card is wider than the viewport', () => {
    // Negative padding would pull the rail outside its own scroll range, and
    // on a narrow phone a card can genuinely be wider than what holds it.
    expect(edgePadding(320, 348)).toBe(0)
    expect(edgePadding(0, 348)).toBe(0)
  })
})

describe('centredScrollLeft', () => {
  it('puts the card centre on the viewport centre', () => {
    // First card of the middle copy, with the padding above already applied:
    // its offsetLeft is the padding itself, so the rail sits at zero.
    expect(centredScrollLeft(326, 348, 1000)).toBe(0)
    expect(centredScrollLeft(21, 348, 390)).toBe(0)
  })

  it('agrees with the padding at every viewport width, which is the pairing a resize breaks', () => {
    // The padding decides where the cards are and this decides where the rail
    // must sit to centre one, so the two have to be computed against the same
    // width. Recompute both and the nth card of the track always centres at n
    // whole card-and-gap steps, whatever the viewport is; recompute only one
    // of them — which is what the mount-only padding amounted to — and the
    // answer drifts by the difference between the two widths.
    const cardWidth = 348
    const gap = 24
    for (const viewportWidth of [1440, 1000, 768, 390]) {
      const pad = edgePadding(viewportWidth, cardWidth)
      for (const n of [0, 1, 2, 7]) {
        const cardLeft = pad + n * (cardWidth + gap)
        expect(centredScrollLeft(cardLeft, cardWidth, viewportWidth)).toBe(n * (cardWidth + gap))
      }
    }
  })

  it('is signed, so a card left of centre asks the rail to go backwards', () => {
    expect(centredScrollLeft(0, 348, 1000)).toBe(-326)
  })
})
