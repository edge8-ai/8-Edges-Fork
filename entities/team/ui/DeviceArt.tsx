// Drawn device art for the My Equipment cards. Nothing in the register carries
// a photo yet (the spreadsheet had none), and an empty grey box looks broken,
// so each card gets a clean line drawing of its type. When an admin does paste
// a product photo into image_url, that wins and this never renders.
//
// Deliberately inline SVG on brand tokens: no image requests, no layout shift,
// and it inherits the page's light/dark treatment for free.
import type { JSX } from "react";

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" as const };

function Laptop() {
  return (
    <>
      <rect x="14" y="16" width="52" height="34" rx="3" {...STROKE} />
      <rect x="20" y="22" width="40" height="22" rx="1.5" {...STROKE} opacity={0.45} />
      <path d="M6 54h68l-4 6H10z" {...STROKE} />
    </>
  );
}

function Monitor() {
  return (
    <>
      <rect x="10" y="12" width="60" height="38" rx="3" {...STROKE} />
      <rect x="16" y="18" width="48" height="26" rx="1.5" {...STROKE} opacity={0.45} />
      <path d="M34 50v10M46 50v10M28 60h24" {...STROKE} />
    </>
  );
}

function Desktop() {
  return (
    <>
      <rect x="24" y="10" width="32" height="52" rx="3" {...STROKE} />
      <circle cx="40" cy="20" r="3" {...STROKE} />
      <path d="M32 32h16M32 40h16M32 48h10" {...STROKE} opacity={0.45} />
    </>
  );
}

function Phone() {
  return (
    <>
      <rect x="28" y="8" width="24" height="56" rx="4" {...STROKE} />
      <path d="M36 14h8" {...STROKE} opacity={0.45} />
      <path d="M34 58h12" {...STROKE} opacity={0.45} />
    </>
  );
}

function Tablet() {
  return (
    <>
      <rect x="20" y="10" width="40" height="52" rx="4" {...STROKE} />
      <rect x="26" y="16" width="28" height="36" rx="1.5" {...STROKE} opacity={0.45} />
      <path d="M36 57h8" {...STROKE} opacity={0.45} />
    </>
  );
}

function Keyboard() {
  return (
    <>
      <rect x="8" y="24" width="64" height="28" rx="3" {...STROKE} />
      <path d="M16 32h6M26 32h6M36 32h6M46 32h6M56 32h8M16 40h6M26 40h6M36 40h6M46 40h18M24 46h32" {...STROKE} opacity={0.5} />
    </>
  );
}

function Mouse() {
  return (
    <>
      <rect x="28" y="14" width="24" height="48" rx="12" {...STROKE} />
      <path d="M40 14v14" {...STROKE} opacity={0.5} />
    </>
  );
}

function Headset() {
  return (
    <>
      <path d="M16 42V34a24 24 0 0148 0v8" {...STROKE} />
      <rect x="10" y="40" width="12" height="20" rx="4" {...STROKE} />
      <rect x="58" y="40" width="12" height="20" rx="4" {...STROKE} />
    </>
  );
}

function Dock() {
  return (
    <>
      <rect x="12" y="30" width="56" height="18" rx="4" {...STROKE} />
      <path d="M22 38h6M34 38h6M46 38h10" {...STROKE} opacity={0.5} />
    </>
  );
}

function Printer() {
  return (
    <>
      <rect x="14" y="28" width="52" height="22" rx="3" {...STROKE} />
      <path d="M24 28V14h32v14" {...STROKE} />
      <path d="M24 50h32v14H24z" {...STROKE} opacity={0.6} />
    </>
  );
}

function Box() {
  return (
    <>
      <path d="M40 8l28 14v30L40 66 12 52V22z" {...STROKE} />
      <path d="M12 22l28 14 28-14M40 36v30" {...STROKE} opacity={0.45} />
    </>
  );
}

const ART: Record<string, () => JSX.Element> = {
  laptop: Laptop,
  monitor: Monitor,
  desktop: Desktop,
  phone: Phone,
  tablet: Tablet,
  keyboard: Keyboard,
  mouse: Mouse,
  headset: Headset,
  dock: Dock,
  printer: Printer,
};

export function DeviceArt({ type }: { type: string }) {
  const Art = ART[type] ?? Box;
  return (
    <svg viewBox="0 0 80 72" role="img" aria-hidden focusable="false" className="admin-team-eq-art">
      <Art />
    </svg>
  );
}
