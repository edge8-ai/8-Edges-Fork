"use client";

import { PLANT_STAGES, plantStage } from "@/entities/coaching/lib/growth";

// The plant on the Overview (K.30): one leaf per five commitments kept over
// the member's whole history. It never wilts and never counts a miss; the only
// input is a count of kept cards, which only grows. Inline SVG so there is
// nothing to load and the growth hue is the page's own token.
//
// Since K.50 it is a tall, narrow figure that lives in the board card's left
// gutter (plan §B.2, option 2) rather than a square parked in a flex gap. The
// shape is the point: a column of ink as tall as the column of work beside it,
// so the figure measures the board instead of decorating it. Its caption is the
// card's footer line, rendered by MyOverview, which is why there is no
// figcaption here and the drawing is aria-hidden — the sentence below the card
// is the accessible version of everything this picture says.
//
// The viewBox is fixed at every stage on purpose: the stem grows inside a box
// whose size never changes, so a member who keeps their fifth card sees the
// stem rise and nothing on the page move (no layout shift).

const SOIL_Y = 104;
// One stage is one leaf and one more step of stem. The values are in the
// viewBox's own units, not pixels; the gutter scales the whole drawing.
const STAGE_RISE = 18;

const LEAVES: { y: number; flip: boolean }[] = [
  { y: SOIL_Y - 12, flip: false },
  { y: SOIL_Y - 12 - STAGE_RISE, flip: true },
  { y: SOIL_Y - 12 - STAGE_RISE * 2, flip: false },
  { y: SOIL_Y - 12 - STAGE_RISE * 3, flip: true },
  { y: SOIL_Y - 12 - STAGE_RISE * 4, flip: false },
];

export function GrowthPlant({ totalKept }: { totalKept: number }) {
  const stage = plantStage(totalKept);
  // A seed has no stem; every stage after that adds a step plus a little head
  // room, so the topmost leaf is never sitting on the tip.
  const stemTop = SOIL_Y - stage * STAGE_RISE - (stage > 0 ? 8 : 0);
  return (
    <figure className="coach-plant">
      {/* 40 × 122 user units at 72 × 220 CSS pixels: the same ratio, so the
          gutter can stretch the figure without distorting it. */}
      <svg
        viewBox="30 -12 40 122"
        width="72"
        height="220"
        preserveAspectRatio="xMidYMax meet"
        aria-hidden="true"
        focusable="false"
      >
        <path className="coach-plant-soil" d={`M32 ${SOIL_Y} Q50 ${SOIL_Y - 7} 68 ${SOIL_Y} Z`} />
        <line className="coach-plant-stem" x1="50" y1={SOIL_Y} x2="50" y2={stemTop} />
        {LEAVES.slice(0, stage).map((l, i) => (
          <path
            key={i}
            className="coach-plant-leaf"
            d={l.flip ? `M50 ${l.y} q13 -11 18 2 q-11 7 -18 -2 z` : `M50 ${l.y} q-13 -11 -18 2 q11 7 18 -2 z`}
          />
        ))}
        {stage === 0 && <circle className="coach-plant-seed" cx="50" cy={SOIL_Y - 4} r="3.5" />}
        {stage >= PLANT_STAGES && <circle className="coach-plant-bloom" cx="50" cy={stemTop - 5} r="5" />}
      </svg>
    </figure>
  );
}
