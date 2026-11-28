import type { ValueMarkKey } from "@/entities/org/lib/core-values";

// The six Core Values drawings and the two "where you'll meet them"
// illustrations: line art on a 120 (or 64) grid, stroked in currentColor so a
// tile's colour pair paints them. Decorative only; the title beside each says
// what it is.

const line = { fill: "none", stroke: "currentColor", strokeWidth: 4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const DRAWINGS: Record<ValueMarkKey, React.ReactNode> = {
  spark: (
    <>
      <circle cx="60" cy="60" r="11" fill="currentColor" />
      <g {...line}>
        <path d="M60 60L98 60M60 60L79 93M60 60L41 93M60 60L22 60M60 60L41 27M60 60L79 27" />
        <path d="M98 60L79 93L41 93L22 60L41 27L79 27Z" strokeDasharray="2 9" />
      </g>
      <g fill="currentColor">
        <circle cx="98" cy="60" r="6" />
        <circle cx="79" cy="93" r="6" />
        <circle cx="41" cy="93" r="6" />
        <circle cx="22" cy="60" r="6" />
        <circle cx="41" cy="27" r="6" />
        <circle cx="79" cy="27" r="6" />
        <path d="M103 4L106 13L115 16L106 19L103 28L100 19L91 16L100 13Z" />
      </g>
    </>
  ),
  target: (
    <>
      <g {...line}>
        <circle cx="54" cy="66" r="42" />
        <circle cx="54" cy="66" r="27" />
        <circle cx="54" cy="66" r="12" fill="currentColor" fillOpacity=".22" />
        <path d="M57 63L104 16" />
        <path d="M92 14L104 16L106 28" />
        <path d="M96 10L110 6L106 20" strokeWidth="3" />
      </g>
      <circle cx="54" cy="66" r="4.5" fill="currentColor" />
    </>
  ),
  bubbles: (
    <g {...line}>
      <path d="M12 30a14 14 0 0 1 14-14h42a14 14 0 0 1 14 14v18a14 14 0 0 1-14 14H38l-14 12v-12h0A12 12 0 0 1 12 50Z" />
      <path d="M28 34h38M28 46h24" />
      <path d="M50 72a12 12 0 0 1 12-12h34a12 12 0 0 1 12 12v16a12 12 0 0 1-12 12v12l-14-12H62a12 12 0 0 1-12-12Z" fill="currentColor" fillOpacity=".18" />
      <path d="M64 80h30" />
    </g>
  ),
  flag: (
    <>
      <g {...line}>
        <path d="M6 106C30 76 46 70 60 70C78 70 94 82 114 106" />
        <path d="M60 70V14" />
        <path d="M60 16L100 28L60 42Z" fill="currentColor" fillOpacity=".22" />
        <path d="M28 106l8-10M86 106l-6-8" />
      </g>
      <circle cx="22" cy="30" r="6" fill="currentColor" fillOpacity=".35" />
    </>
  ),
  book: (
    <>
      <g {...line}>
        <path d="M60 50C46 42 28 40 12 44V100C28 96 46 98 60 106C74 98 92 96 108 100V44C92 40 74 42 60 50Z" />
        <path d="M60 50V106" />
        <path d="M24 58c9-2 18-1 26 2M24 72c9-2 18-1 26 2M70 60c8-3 17-4 26-2M70 74c8-3 17-4 26-2" />
        <path d="M60 36V12M44 32L34 18M76 32L86 18" />
      </g>
      <circle cx="60" cy="10" r="5" fill="currentColor" />
      <circle cx="32" cy="16" r="4" fill="currentColor" />
      <circle cx="88" cy="16" r="4" fill="currentColor" />
    </>
  ),
  blocks: (
    <>
      <g {...line}>
        <rect x="16" y="72" width="40" height="34" rx="5" fill="currentColor" fillOpacity=".2" />
        <rect x="62" y="72" width="40" height="34" rx="5" />
        <rect x="38" y="36" width="40" height="34" rx="5" transform="rotate(-10 58 53)" fill="currentColor" fillOpacity=".12" />
        <path d="M84 18q6-7 12 0t12 0" />
      </g>
      <g fill="currentColor">
        <circle cx="24" cy="30" r="5" />
        <rect x="96" y="40" width="9" height="9" rx="2" transform="rotate(20 100 44)" />
        <circle cx="14" cy="56" r="3" />
        <path d="M60 6l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
      </g>
    </>
  ),
};

export function ValueMark({ mark }: { mark: ValueMarkKey }) {
  return (
    <span className="admin-cv-mark" aria-hidden="true">
      <svg viewBox="0 0 120 120">{DRAWINGS[mark]}</svg>
    </span>
  );
}

const thin = { ...line, strokeWidth: 2.5 } as const;

// The accent shapes take their colours from CSS (.admin-cv-ill-*), because the
// token rule keeps literal colours out of components.
export function NoticedIllustration() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...thin}>
      <rect x="8" y="10" width="40" height="46" rx="6" />
      <path d="M16 22h24M16 30h24M16 38h14" />
      <rect className="admin-cv-ill-teal" x="34" y="40" width="24" height="12" rx="6" />
      <circle className="admin-cv-ill-teal-dot" cx="41" cy="46" r="2" />
    </svg>
  );
}

export function InterviewIllustration() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...thin}>
      <circle cx="20" cy="20" r="8" />
      <path d="M6 46c2-9 8-13 14-13s12 4 14 13" />
      <rect x="36" y="14" width="22" height="36" rx="4" />
      <path d="M41 24h12M41 32h12M41 40h7" />
      <circle className="admin-cv-ill-blue" cx="56" cy="50" r="7" />
      <path className="admin-cv-ill-blue-tick" d="M53 50l2 2 4-4" />
    </svg>
  );
}
