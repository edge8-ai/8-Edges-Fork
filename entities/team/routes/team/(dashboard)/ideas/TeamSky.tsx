"use client";

import Link from "next/link";
import { useState } from "react";
import { KIND_LABEL, SKY, SKY_RADIUS as RADIUS, SKY_SPARKLE as SPARKLE, constellation, type SkyStage, type SkyStar, type SkyTick } from "./sparks-model";

// The team sky (ID.2.2, version 2 in ID.2.12, a baseline a designer will take
// further): every spark the team has shared, one star each, oldest on the left.
// Brightness is the spark's story: a soft point waiting for a build, a glow once
// echoed, a ring once picked up, a sparkle once shipped. It describes the work,
// never a person: no names on the sky, no counts per person. "Light up mine"
// draws the viewer's own constellation, in this browser only.
//
// Everything is SVG attributes and classes, never inline style, so every colour
// stays a token; a filter dims what it leaves out with one class per star.

type Filter = "new" | SkyStage | null;

const STAGE_LABEL: Record<SkyStage, string> = { spark: "Spark", echoed: "Echoed", picked_up: "Picked up", shipped: "Shipped" };
const CHIPS: { key: Exclude<Filter, null>; label: string }[] = [
  { key: "new", label: "New this week" },
  { key: "spark", label: "Waiting" },
  { key: "echoed", label: "Echoed" },
  { key: "picked_up", label: "Picked up" },
  { key: "shipped", label: "Shipped" },
];
const MEANING: Record<SkyStage, string> = {
  spark: "shared, and waiting for a teammate to build on it.",
  echoed: "a teammate built on it with a line of their own.",
  picked_up: "someone took it on as a Workboard card.",
  shipped: "the card landed, with the author's name on the spark.",
};

// Faint background dust, fixed by index so it never moves between renders. An
// R2 low-discrepancy sequence spreads it evenly; hashing near-identical keys
// ("dust-x-0", "dust-x-1") had clumped neighbours into visible dashes.
const R2_A = 0.7548776662466927;
const R2_B = 0.5698402909980532;
const frac = (v: number) => v - Math.floor(v);
const DUST = Array.from({ length: 48 }, (_, k) => ({
  x: Math.round(frac(0.5 + R2_A * (k + 1)) * SKY.w * 10) / 10,
  y: Math.round(frac(0.5 + R2_B * (k + 1)) * (SKY.h - SKY.floor) * 10) / 10,
  r: k % 7 === 0 ? 0.9 : 0.5,
}));


function matches(s: SkyStar, f: Filter): boolean {
  return f === null || (f === "new" ? s.isNew : s.stage === f);
}

export function TeamSky({ stars, ticks }: { stars: SkyStar[]; ticks: SkyTick[] }) {
  const [filter, setFilter] = useState<Filter>(null);
  const [mine, setMine] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const mineCount = stars.filter((s) => s.mine).length;
  const hovered = stars.find((s) => s.id === hoverId) ?? null;
  const lit = stars.filter((s) => matches(s, filter)).length;

  let caption: string;
  if (stars.length === 0) caption = "The sky is empty. The first spark lights the first star.";
  else if (mine) caption = `Your constellation: your ${mineCount === 1 ? "spark" : `${mineCount} sparks`} in the order you shared them. Only you see this.`;
  else if (filter === "new") caption = lit === 0 ? "Nothing new this week yet." : `${lit === 1 ? "1 spark" : `${lit} sparks`} shared this week.`;
  else if (filter) caption = `${STAGE_LABEL[filter]}: ${MEANING[filter]} ${lit === 1 ? "1 spark" : `${lit} sparks`}.`;
  else caption = "One star for every spark the team has shared, oldest on the left. Brighter means further along. Point at a star, or tab to it, to read it here; press or tap it to open.";

  return (
    <section className="sparks-sky" aria-labelledby="sky-h">
      <div className="sparks-sky-head">
        <h2 id="sky-h">The team sky</h2>
        {mineCount > 0 && (
          <button type="button" className="sparks-chip-dark" aria-pressed={mine} onClick={() => {
            setMine((m) => !m);
            setFilter(null);
          }}>
            Light up mine
          </button>
        )}
      </div>

      {/* Each star is a focusable link (W.191): keyboard users read a star by tabbing
          to it (the card below announces it) and open it with Enter; the decoration
          around the stars is hidden from assistive tech, the stars themselves are not. */}
      <svg className="sparks-sky-map" viewBox={`0 0 ${SKY.w} ${SKY.h}`} role="group" aria-label="The team sky: one star per spark" onMouseLeave={() => setHoverId(null)}>
        <g aria-hidden="true">
          {DUST.map((d, k) => (
            <circle key={k} className="sparks-dust" cx={d.x} cy={d.y} r={d.r} />
          ))}
          {ticks.map((t) => (
            <g key={`${t.label}-${t.x}`} className="sparks-tick">
              <line x1={t.x} x2={t.x} y1={SKY.h - SKY.floor + 4} y2={SKY.h - SKY.floor + 9} />
              <text x={t.x} y={SKY.h - 6} textAnchor={t.x <= SKY.pad ? "start" : "middle"}>
                {t.label}
              </text>
            </g>
          ))}
          {mine && <polyline className="sparks-mine-line" points={constellation(stars)} />}
        </g>
        {stars.map((s) => {
          const cls = [
            "sparks-star-g",
            `is-${s.stage}`,
            `is-${s.kind}`,
            s.mine ? "is-mine" : "",
            s.isNew ? "is-new" : "",
            s.fresh ? "is-fresh" : "",
            matches(s, filter) && (!mine || s.mine) ? "" : "is-dim",
          ].join(" ");
          return (
            <a
              key={s.id}
              href={`/team/ideas/${s.id}`}
              className={cls}
              aria-label={`${s.title}, ${STAGE_LABEL[s.stage]}`}
              onMouseEnter={() => setHoverId(s.id)}
              onFocus={() => setHoverId(s.id)}
              onBlur={() => setHoverId(null)}
            >
              {s.fresh && <line className="sparks-comet" x1={s.x - 46} y1={s.y - 26} x2={s.x} y2={s.y} />}
              {s.stage === "shipped" ? (
                <path className="sparks-star sparks-star--sparkle" d={SPARKLE} transform={`translate(${s.x} ${s.y})`} />
              ) : (
                <circle className="sparks-star" cx={s.x} cy={s.y} r={RADIUS[s.stage]} />
              )}
              {s.stage === "picked_up" && <circle className="sparks-star-ring" cx={s.x} cy={s.y} r={5.5} />}
              {/* A wider invisible target, so a 2px star is easy to point at. */}
              <circle className="sparks-star-hit" cx={s.x} cy={s.y} r={7} />
            </a>
          );
        })}
      </svg>

      <div className="sparks-sky-card" aria-live="polite">
        {hovered ? (
          <>
            <div className="sparks-chips">
              <span className={`sparks-kind-chip sparks-kind-chip--${hovered.kind}`}>{KIND_LABEL[hovered.kind]}</span>
              <span className="sparks-sky-stage">{STAGE_LABEL[hovered.stage]}</span>
            </div>
            <Link className="sparks-sky-card-title" href={`/team/ideas/${hovered.id}`}>
              {hovered.title}
            </Link>
          </>
        ) : (
          <p className="sparks-sky-caption">{caption}</p>
        )}
      </div>

      <div className="sparks-sky-chips" role="group" aria-label="Light up the sky">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`sparks-chip-dark sparks-chip-dark--${c.key}`}
            aria-pressed={!mine && filter === c.key}
            onClick={() => {
              setMine(false);
              setFilter((f) => (f === c.key ? null : c.key));
            }}
          >
            {/* A piece of the night with this stage's star in it, so the legend matches the sky (W.190). */}
            <span className="sparks-chip-sky" aria-hidden="true">
              <span className={`sparks-chip-star is-${c.key}`} />
            </span>
            {c.label}
          </button>
        ))}
      </div>
    </section>
  );
}
