import { Outfit } from "next/font/google";

// The display face for the Core Values page (direction B, approved 2026-10-08):
// Outfit for the hero and the value titles, Manrope stays for body text. Loaded
// through next/font so it is self-hosted and adds no layout shift; it exposes
// --font-hero on whatever element carries `heroFont.variable`. Outfit has no
// Vietnamese subset, so marked letters fall back to Manrope glyph by glyph.
//
// Import this only from route files. next/font runs only under Next's compiler,
// so a door or barrel that reached it would break every test importing that
// door ("Outfit is not a function" under Vitest).
export const heroFont = Outfit({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
  variable: "--font-hero",
  display: "swap",
});
