// The two measurements the testimonial carousel centres itself with.
//
// They live here rather than inline in the component because they are the part
// worth testing: the component around them is a scroll listener, a
// ResizeObserver and a snap-type dance that only a real layout engine can
// exercise, while the arithmetic that decides where a card sits is a pure
// function of three numbers. N.12 was a stale padding, so the padding is now
// something a test can pin.

/**
 * The left and right padding the track needs for the first and last cards to
 * reach the middle of the viewport. Both edges get the same value, so one
 * number answers for both.
 *
 * Clamped at zero: once a card is wider than the viewport — the narrow-phone
 * case — there is no room to centre it and negative padding would pull the
 * rail out of its own scroll range.
 */
export function edgePadding(viewportWidth: number, cardWidth: number): number {
  return Math.max(0, (viewportWidth - cardWidth) / 2)
}

/**
 * The `scrollLeft` that puts a card in the middle of the viewport, which is
 * also where `scroll-snap-align: center` will resolve it to.
 *
 * `cardLeft` is the card's `offsetLeft`, so it must be read after any pending
 * padding write has been applied — the padding moves every card in the track.
 */
export function centredScrollLeft(cardLeft: number, cardWidth: number, viewportWidth: number): number {
  return cardLeft + cardWidth / 2 - viewportWidth / 2
}
