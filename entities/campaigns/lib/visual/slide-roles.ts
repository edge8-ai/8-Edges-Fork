import type { ArtComposition } from "./signature-art";
import type { ImageCount } from "./channel-sizes";

// What each image in a channel's set is for, so Regenerate can make fewer of
// them without guessing (Mk.2, 18 Nov 2026). The writer marks the roles when it
// writes the card words: the hook opens, the key point is the one idea the post
// turns on, support slides carry the rest, and the close lands it.
//
// Number of images: 4 makes every image again, 2 the hook and the key point,
// 1 the hook alone.

export type SlideRole = "hook" | "key" | "support" | "close";

// Which code-drawn composition a role takes. Steps and comparisons fill the
// frame with words, so key and support slides get only the corner wedge.
export const ART_FOR_ROLE: Record<SlideRole, ArtComposition> = {
  hook: "hook",
  key: "corner",
  support: "corner",
  close: "close",
};

// The slides to make for an image count, in their original order. A set with
// no marked hook uses its first slide; with no marked key point, the first
// slide that is not the hook, which comes before it when the hook is not first.
// Never more than the set has.
export function pickSlides<T extends { role: SlideRole }>(slides: T[], count: ImageCount): T[] {
  if (count >= 4 || slides.length <= count) return slides.slice(0, Math.min(count, 4));
  const hookAt = Math.max(0, slides.findIndex((s) => s.role === "hook"));
  if (count === 1) return [slides[hookAt]];
  let keyAt = slides.findIndex((s, i) => i !== hookAt && s.role === "key");
  if (keyAt < 0) keyAt = slides.findIndex((_, i) => i !== hookAt);
  return [hookAt, keyAt].sort((a, b) => a - b).map((i) => slides[i]);
}
