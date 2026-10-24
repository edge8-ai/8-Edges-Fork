// Shared style catalogues for marketing content. One source of truth for the
// brand "preferred styles" config, the entry pickers, and the AI writer.

export type StyleOption = { value: string; label: string; desc: string };

/** A brand's preferred styles, as the calendar page reads them off its profile. */
export type BrandStylePrefs = { brandId: string; blog: string[]; image: string[]; social: string[] };

export const BLOG_TYPES: StyleOption[] = [
  { value: "thesis", label: "Thesis", desc: "Make a bold claim and defend it" },
  { value: "manifesto", label: "Manifesto", desc: "A declaration of belief and how things should be" },
  { value: "listicle", label: "Listicle", desc: "Numbered takeaways" },
  { value: "framework", label: "Framework", desc: "A named model or system" },
  { value: "contrarian", label: "Contrarian", desc: "Challenge the consensus" },
  { value: "case-study", label: "Case study", desc: "Real example, what happened, what we learned" },
  { value: "how-to", label: "How-to", desc: "Step-by-step practical guide" },
  { value: "story", label: "Story / personal essay", desc: "Narrative that lands a lesson" },
  { value: "myth-buster", label: "Myth-buster", desc: "Everyone says X, here is why that is wrong" },
  { value: "warning", label: "Warning", desc: "What most people are getting wrong" },
  { value: "trend", label: "Trend / prediction", desc: "Where this is heading and why" },
  { value: "open-letter", label: "Open letter", desc: "Written directly to one reader" },
  { value: "research-dive", label: "Research dive", desc: "Data-driven, cites sources" },
  { value: "quick-win", label: "Quick win", desc: "Short, one thing to do today" },
];

export const IMAGE_STYLES: StyleOption[] = [
  { value: "pop-art", label: "Pop art", desc: "Bold, high-contrast, comic-inspired" },
  { value: "editorial-illustration", label: "Editorial illustration", desc: "Magazine-style conceptual art" },
  { value: "typographic-splash", label: "Typographic splash", desc: "Big type on a brand color" },
  { value: "minimalist", label: "Minimalist / flat", desc: "Clean shapes, lots of white space" },
  { value: "data-diagram", label: "Data / diagram", desc: "Frameworks, charts, explanatory graphics" },
  { value: "photorealistic", label: "Photorealistic", desc: "Real-looking scenes" },
  { value: "cinematic-photo", label: "Cinematic photo", desc: "Moody, dramatic lighting" },
  { value: "isometric-3d", label: "Isometric / 3D", desc: "Dimensional objects and scenes" },
  { value: "abstract", label: "Abstract / conceptual", desc: "Gradients and shapes for ideas" },
  { value: "line-art", label: "Line art", desc: "Single-weight illustration" },
  { value: "collage", label: "Collage / mixed media", desc: "Layered cutouts" },
  { value: "napkin-sketch", label: "Napkin sketch", desc: "One black marker on a paper napkin on a wood table: a few labels, a stick figure, a signature, a coffee ring" },
  { value: "whiteboard-session", label: "Whiteboard session", desc: "A whiteboard after a working session: one big marker headline, arrows, a few blank or one-word stickies, smudges" },
  { value: "retro", label: "Retro / vintage", desc: "Mid-century or 80s aesthetic" },
];

export const SOCIAL_STYLES: StyleOption[] = [
  { value: "hook-story", label: "Hook + story", desc: "Scroll-stopping opener, short story, a point" },
  { value: "hot-take", label: "Hot take", desc: "A contrarian one-liner, briefly defended" },
  { value: "listicle", label: "Listicle", desc: "Numbered quick points" },
  { value: "lesson-learned", label: "Lesson learned", desc: "What I got wrong and what I would do now" },
  { value: "framework-drop", label: "Framework drop", desc: "A named model in a few lines" },
  { value: "data-point", label: "Data point", desc: "A stat and what it means" },
  { value: "behind-scenes", label: "Behind the scenes", desc: "How something actually works" },
  { value: "question", label: "Question / prompt", desc: "Provoke a reply" },
  { value: "announcement", label: "Announcement", desc: "Launch or news" },
  { value: "quote", label: "Quote / one-liner", desc: "A single sharp line" },
  { value: "story-time", label: "Story time", desc: "A longer personal narrative" },
  { value: "myth-reality", label: "Myth vs reality", desc: "You think X, actually Y" },
];

// Visual treatment families for the full blog preview. Each blog type maps to
// one of four presentation families so the rendered preview reflects the
// chosen style, not just the words.
export type BlogPreviewFamily = "statement" | "structured" | "analytical" | "narrative";

const BLOG_PREVIEW_FAMILY: Record<string, BlogPreviewFamily> = {
  thesis: "statement",
  manifesto: "statement",
  contrarian: "statement",
  warning: "statement",
  listicle: "structured",
  framework: "structured",
  "how-to": "structured",
  "quick-win": "structured",
  "case-study": "analytical",
  "research-dive": "analytical",
  trend: "analytical",
  "myth-buster": "analytical",
  story: "narrative",
  "open-letter": "narrative",
};

export const blogPreviewFamily = (v: string | null): BlogPreviewFamily | null =>
  v ? BLOG_PREVIEW_FAMILY[v] ?? null : null;

const label = (opts: StyleOption[], value: string | null): string | null =>
  value ? opts.find((o) => o.value === value)?.label ?? value : null;

export const blogTypeLabel = (v: string | null) => label(BLOG_TYPES, v);
export const imageStyleLabel = (v: string | null) => label(IMAGE_STYLES, v);
export const socialStyleLabel = (v: string | null) => label(SOCIAL_STYLES, v);
