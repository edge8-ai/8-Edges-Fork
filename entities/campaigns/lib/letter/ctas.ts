import type { BroadcastCta, BroadcastLayout } from "../marketing-email-blocks";

// The calls to action a letter rotates through, and the layouts. Strict round
// robin in both: the next letter takes the entry after the one the last sent
// letter carried, so every option gets a turn and the results card shows
// which one works. An entry with no URL is skipped until its landing page
// exists; the URLs come from the environment so a page can go live without a
// deploy of this file.

export type CtaEntry = { key: string; cta: BroadcastCta | null };

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}`).replace(/\/$/, "");

export function ctaCatalog(): CtaEntry[] {
  const linkedin = process.env.LETTER_CTA_LINKEDIN_URL?.trim() || null;
  const book = process.env.LETTER_CTA_BOOK_URL?.trim() || null;
  return [
    {
      key: "conversation",
      cta: {
        tagline: "The model is ready. Is your process?",
        line: "One hour, your key workflows and your data map. You leave knowing what to build, where to run it, and who to hire.",
        label: "Book a conversation",
        url: `${site()}/contact/`,
      },
    },
    {
      key: "retreat",
      cta: {
        tagline: "Two days. Your data. A working system by Friday.",
        line: "A private build retreat with the Edge8 team: install the stack on your own data, then customise it with us in the room.",
        label: "Book a private retreat",
        url: `${site()}/my-retreat/`,
      },
    },
    {
      key: "linkedin",
      cta: linkedin
        ? {
            tagline: "The daily version of this letter.",
            line: "Most of what ends up here starts as a post. Follow along between letters.",
            label: "Follow me on LinkedIn",
            url: linkedin,
          }
        : null,
    },
    {
      key: "book",
      cta: book
        ? {
            tagline: "The Other 50%, before it ships.",
            line: "An advance copy of the book, chapter by chapter, for the people on this list.",
            label: "Get the advance copy",
            url: book,
          }
        : null,
    },
  ];
}

export const LAYOUT_ORDER: BroadcastLayout[] = ["list", "feature", "cards"];

// The entry after `lastKey` in a list, wrapping; the first entry when the last
// is unknown. Skips entries without a usable value.
export function nextInRotation<T extends { key: string }>(order: T[], lastKey: string | null, usable: (t: T) => boolean): T | null {
  const live = order.filter(usable);
  if (live.length === 0) return null;
  const at = lastKey ? order.findIndex((o) => o.key === lastKey) : -1;
  for (let step = 1; step <= order.length; step++) {
    const candidate = order[(at + step) % order.length];
    if (usable(candidate)) return candidate;
  }
  return live[0];
}

export function nextLayout(last: BroadcastLayout | null): BroadcastLayout {
  const entries = LAYOUT_ORDER.map((key) => ({ key }));
  return (nextInRotation(entries, last, () => true)?.key ?? "list") as BroadcastLayout;
}

// Which catalog entry a sent letter carried, recovered from its button label.
export function ctaKeyFor(cta: BroadcastCta | null): string | null {
  if (!cta) return null;
  return ctaCatalog().find((e) => e.cta?.label === cta.label)?.key ?? null;
}
