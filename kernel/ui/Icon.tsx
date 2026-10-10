import type { CSSProperties, JSX } from "react";

/**
 * The admin's small monochrome icons (W.103.3).
 *
 * WHY THIS EXISTS. The Workboard card carried seven of its icons as text
 * glyphs — ⚡ for Human Tokens, ☑ for subtasks, ⚠ for blockers, ⛓ for what a
 * card blocks, 💬 for comments, ◷ for age, ✓ for completed — plus 🔗 on the PR
 * chip and ⠿ on the board's drag grip. Two of those (💬 and 🔗) are emoji proper, so
 * the browser renders them from the platform's emoji font in ITS colours,
 * which puts uncontrolled colour on a card whose entire colour discipline is
 * one categorical carrier. The other six come from a symbol font with its own
 * weight, baseline and advance width, so a row of them never sits on the type
 * grid and looks different on macOS, Windows and Android.
 *
 * WHAT AN ICON HERE IS. One inline SVG, sized in `em` so it tracks whatever
 * type size it sits in, stroked in `currentColor` so it takes the colour of
 * its line and nothing else, and `aria-hidden` because every one of them sits
 * beside a number or a word that already says what it means. An icon is never
 * the only carrier of anything.
 *
 * WHAT IS NOT DONE YET. One surface still draws its own ⠿ grip in its own
 * markup: the CRM's lead queue. The portal's roadmap backlog and the deals
 * list were converted in W.103.9; the lead queue was left out of that card
 * because entities/crm/routes/admin/(dashboard)/revenue/leads/LeadQueue.tsx
 * sits at 418 lines against a 417-line allowlist entry, so the single import
 * line this needs is enough to make the file-size ratchet refuse the tree.
 * That is the ratchet doing its job — the file has to be split before the
 * glyph can move — so the conversion waits for the split rather than buying
 * itself headroom out of an unrelated budget.
 *
 * WHY NOT A LIBRARY. A dependency for nine glyphs would be nine glyphs and
 * three hundred more, and the three hundred are how a design system stops
 * being a decision and starts being a menu.
 */

export type IconName =
  /** Human Tokens — effort by shape, never time. */
  | "bolt"
  /** Subtasks done over total. */
  | "checklist"
  /** This card is blocked. */
  | "alert"
  /** Other cards are waiting on this one. */
  | "link"
  /** Comments on the card. */
  | "comment"
  /** How long the card has sat in its column. */
  | "clock"
  /** Finished. */
  | "check"
  /** The drag handle. */
  | "grip"
  /** A card parked until a date. */
  | "moon"
  /** Board settings and tools. */
  | "gear"
  /** The toolbar's view options. */
  | "sliders"
  /** More actions on one item (a card's menu). */
  | "more"
  /** A due date (the card drawer's pinned line, W.159). */
  | "calendar"
  /** A sprint: work that comes round in cycles (W.159). */
  | "cycle"
  /** A pull request (W.159). */
  | "branch"
  /** A control that opens a list (W.159). */
  | "caret"
  /** Change a value in place (W.159). */
  | "pencil"
  /** A card's deliverables (W.159, W.160). */
  | "paperclip"
  | "close"
  | "play"
  /** The Workboard's Board and List views, in its view switcher (W.174). */
  | "columns"
  | "rows"
  /** An idea on /team/ideas: one shared spark (ID.2). */
  | "spark"
  /** "I learned" — a learning, as opposed to something to build (ID.2). */
  | "bulb"
  /** "We should build" — something to make (ID.2). */
  | "wrench"
  /** Seen only by you (ID.2). */
  | "lock"
  /** Back to the list a page came from (ID.2). */
  | "back";

/**
 * The paths, on a 24-box, stroked. `stroke-linecap: round` is set once on the
 * <svg> rather than per path, so a new icon only has to supply geometry.
 */
const PATHS: Record<IconName, JSX.Element> = {
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  checklist: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 20h20L12 3z" />
      <path d="M12 10v4" />
      <path d="M12 17.5v.01" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" />
    </>
  ),
  comment: <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="1.8" />
      <circle cx="10" cy="12" r="1.8" />
      <circle cx="16" cy="18" r="1.8" />
    </>
  ),
  // Three dots on the centre line, where the "…" text glyph sat on the
  // baseline and read as an underscore at 13px (W.115).
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  cycle: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </>
  ),
  branch: (
    <>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7M6 9v12" />
    </>
  ),
  caret: <path d="M6 9l6 6 6-6" />,
  pencil: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  paperclip: <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  play: <path d="M7 4.5v15l12.5-7.5z" />,
  columns: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </>
  ),
  rows: <path d="M4 6h16M4 12h16M4 18h16" />,
  spark: <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" />,
  bulb: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
    </>
  ),
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />,
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  back: <path d="M19 12H5M12 19l-7-7 7-7" />,
  grip: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
};

export function Icon({ name, style }: { name: IconName; style?: CSSProperties }) {
  return (
    <svg
      className="admin-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {PATHS[name]}
    </svg>
  );
}
