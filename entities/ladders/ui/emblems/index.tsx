// The plain emblem set (LD.3; ADR 0021 "Emblem art is private"). The upstream
// module at this path holds Edge8's own emblem art, which stays with Edge8, so
// the fork draws these instead: a ringed circle per Learn & Share tier, a ring
// round the face for its border (frames.css beside this file), and a plain
// shield per Builder tier, each in the tier's colour (--color-ladder-* in
// app/styles/tokens.css) and nothing else. Same exports as the upstream module,
// drawn to the boxes in entities/ladders/ui/emblem-contract.ts, so every page
// that draws an emblem works unchanged. Swap in your own art by replacing this
// file and frames.css: keep the exports, the boxes and the frame classes.
import { LEARN_SHARE_TIERS, type BuilderTier, type LearnShareTier } from "@/entities/ladders/lib/points";
import { HELM_BOX, MEDAL_BOX, type BorderArtProps, type BorderGeometry, type HelmArtProps, type MedalArtProps, type StarsArtProps } from "@/entities/ladders/ui/emblem-contract";

const tone = (tier: LearnShareTier | BuilderTier): string => `var(--color-ladder-${tier})`;

// The plain border is a ring just outside the hole, in a square of 2 × OUTER
// round the hole's centre, in the art's own units (the hole's radius is 100).
const HOLE = 100;
const OUTER = 118;
const PLAIN_BORDER: BorderGeometry = { width: 2 * OUTER, height: 2 * OUTER, cx: OUTER, cy: OUTER, r: HOLE };

/** Each border's art round its hole: here one ring, the same for every tier. */
export const BORDER_GEOMETRY = Object.fromEntries(LEARN_SHARE_TIERS.map((t) => [t, PLAIN_BORDER])) as Record<LearnShareTier, BorderGeometry>;

export function HelmArt({ tier, width, height }: HelmArtProps) {
  const cx = HELM_BOX.width / 2;
  const cy = HELM_BOX.height / 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${HELM_BOX.width} ${HELM_BOX.height}`} aria-hidden focusable="false">
      <circle cx={cx} cy={cy} r={124} fill={tone(tier)} />
      <circle cx={cx} cy={cy} r={100} fill="none" stroke="var(--color-bg-primary)" strokeWidth={8} opacity={0.7} />
    </svg>
  );
}

// The shield, its bands and its stars, in the medal's box (MEDAL_BOX).
const SHIELD = "M128 22 L214 54 V126 C214 178 178 216 128 236 C78 216 42 178 42 126 V54 Z";

export function MedalArt({ tier, band, size }: MedalArtProps) {
  const bands = tier === "immortal" ? (band ?? 1) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${MEDAL_BOX.width} ${MEDAL_BOX.height}`} aria-hidden focusable="false">
      <path d={SHIELD} fill={tone(tier)} />
      {Array.from({ length: bands }, (_, i) => (
        <rect key={i} x={86} y={92 + i * 26} width={84} height={12} rx={6} fill="var(--color-bg-primary)" opacity={0.75} />
      ))}
    </svg>
  );
}

export function StarsArt({ stars, size }: StarsArtProps) {
  // The stars on an arc under the shield's point, centred.
  return (
    <svg width={size} height={size} viewBox={`0 0 ${MEDAL_BOX.width} ${MEDAL_BOX.height}`} aria-hidden focusable="false">
      {Array.from({ length: stars }, (_, i) => {
        const a = ((i - (stars - 1) / 2) * 16 * Math.PI) / 180;
        return <circle key={i} cx={Math.round(128 + 100 * Math.sin(a))} cy={Math.round(140 + 100 * Math.cos(a))} r={9} fill="var(--color-star)" stroke="var(--color-star-edge)" strokeWidth={2} />;
      })}
    </svg>
  );
}

export function BorderArt({ tier, width, height }: BorderArtProps) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${2 * OUTER} ${2 * OUTER}`} aria-hidden focusable="false">
      <circle cx={OUTER} cy={OUTER} r={(HOLE + OUTER) / 2} fill="none" stroke={tone(tier)} strokeWidth={OUTER - HOLE} />
    </svg>
  );
}
