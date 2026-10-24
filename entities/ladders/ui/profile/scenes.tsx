// The four Quests-world scenes a person may pick for their profile's banner
// (LD.6; the approved v5 prototype's scene(); glossary "Banner"): the Slime
// meadow, the Dragon sky, the Hydra cave and the Lighthouse horizon, flat and
// drawn in tokens. Every fill and stroke is a class in
// app/styles/profile-dress.css that reads a token, because a literal colour
// fails check:tokens and an SVG presentation attribute cannot read a CSS
// variable. Opacity is a number, not a colour, so it stays an attribute.
//
// The art is not Edge8's private emblem set (that is ./emblems/); it is the
// Quests world's own, drawn here, and ships to the fork as it is.
import type { ReactNode } from "react";
import type { Banner } from "../../lib/rows";

export type Scene = Exclude<Banner, "photo">;

/** The picker's words for each banner, in its order. */
export const BANNER_WORDS: Record<Banner, string> = {
  meadow: "Slime meadow",
  dragon: "Dragon sky",
  hydra: "Hydra cave",
  lighthouse: "Lighthouse horizon",
  photo: "Your photo",
};

function SceneSvg({ id, stops, children }: { id: string; stops: [number, string][]; children: ReactNode }) {
  return (
    <svg className="pf-scene-art" viewBox="0 0 1000 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map(([at, token]) => (
            <stop key={at} offset={at} className={`pf-stop-${token}`} />
          ))}
        </linearGradient>
      </defs>
      <rect width="1000" height="440" fill={`url(#${id})`} />
      {children}
    </svg>
  );
}

function Slime({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse className="pf-f-primary-dark" cx="0" cy="2" rx="30" ry="5" opacity=".15" />
      <path className="pf-f-accent-mint-bright" d="M-28 0c0-26 12-44 28-44s28 18 28 44z" />
      <path className="pf-s-bg-primary" d="M-16-18c2-9 6-15 12-17" fill="none" strokeWidth="5" strokeLinecap="round" opacity=".6" />
      <circle className="pf-f-primary-dark" cx="-8" cy="-16" r="4" />
      <circle className="pf-f-primary-dark" cx="9" cy="-16" r="4" />
    </g>
  );
}

function Meadow({ id }: { id: string }) {
  return (
    <SceneSvg id={id} stops={[[0, "info-bg"], [1, "growth-soft"]]}>
      <circle className="pf-f-sky-picked" cx="860" cy="92" r="46" />
      <path className="pf-f-bg-primary" opacity=".92" d="M90 110h150a26 26 0 0 0-26-36 34 34 0 0 0-62-8 26 26 0 0 0-46 22 22 22 0 0 0-16 22z M560 72h110a20 20 0 0 0-20-26 26 26 0 0 0-46-6 20 20 0 0 0-44 32z" />
      <path className="pf-f-growth-line" d="M0 290C140 220 300 230 430 270S720 230 1000 250V440H0Z" />
      <path className="pf-f-accent-mint" d="M0 330C180 280 360 300 520 330S820 300 1000 320V440H0Z" />
      <path className="pf-f-growth" d="M0 380C200 350 420 370 620 390S880 370 1000 380V440H0Z" />
      <Slime x={560} y={330} s={1.1} />
      <Slime x={700} y={318} s={0.7} />
      <Slime x={820} y={386} s={1.4} />
      <Slime x={420} y={300} s={0.5} />
    </SceneSvg>
  );
}

const STARS = [[80, 60], [210, 120], [340, 40], [520, 90], [640, 30], [760, 140], [900, 60], [960, 160], [450, 170]];

function Dragon({ id }: { id: string }) {
  return (
    <SceneSvg id={id} stops={[[0, "violet-ink"], [0.55, "violet"], [1, "quest-sky-violet"]]}>
      {STARS.map(([x, y]) => (
        <circle key={`${x}-${y}`} className="pf-f-bg-primary" cx={x} cy={y} r="2.4" opacity=".8" />
      ))}
      <circle className="pf-f-violet-soft" cx="820" cy="110" r="54" />
      <circle className="pf-f-violet" cx="842" cy="98" r="54" opacity=".55" />
      <path className="pf-f-client-7-ink" opacity=".7" d="M0 330L120 230L220 300L340 200L470 310L600 220L720 300L850 210L1000 310V440H0Z" />
      <path className="pf-f-violet-ink" d="M0 390L160 320L300 380L460 300L620 380L780 320L1000 390V440H0Z" />
      <g transform="translate(760 150) rotate(-6) scale(.72)">
        <path className="pf-f-violet-ink" d="M-40-6C-90-70-60-150 20-190C0-150 10-130 30-120C40-150 70-170 110-176C90-150 90-128 100-112C120-130 150-136 186-130C150-110 120-80 100-40C70-20 20-8-40-6Z" />
        <path className="pf-s-primary-dark" d="M-40-6C-60-40-50-90-10-130M30-120C10-80 0-40-10-10M100-112C70-80 40-40 20-10" fill="none" strokeWidth="4" strokeLinecap="round" opacity=".7" />
        <path className="pf-f-primary-dark" d="M-220 40C-180 10-140 0-100 4C-60 8-30 4 0 0C30-4 60-14 84-30C96-38 108-44 120-44L136-56L134-40C146-36 156-30 162-22C150-20 140-18 130-14C110 6 70 22 30 28C-20 36-70 34-120 30C-160 28-190 36-220 40Z" />
        <path className="pf-f-primary-dark" d="M-220 40C-240 44-256 56-262 72C-250 64-240 62-228 62L-240 50Z" />
        <path className="pf-f-primary-dark" d="M-262 72L-276 62L-268 84Z" />
        <path className="pf-f-client-7-ink" d="M-30 10C-60-30-40-80 0-110C-10-80-4-60 6-50C14-70 34-84 60-88C46-66 46-50 54-40C70-50 90-52 110-48C84-30 60-6 40 14Z" />
        <path className="pf-s-primary-dark" d="M-30 28L-38 52M20 26L18 50" strokeWidth="10" strokeLinecap="round" />
        <circle className="pf-f-accent-mint" cx="140" cy="-34" r="3" />
        <path className="pf-f-primary-dark" d="M126-50L118-70L134-56Z M138-52L140-72L148-54Z" />
      </g>
    </SceneSvg>
  );
}

const STALACTITES = [[0, 70], [120, 50], [260, 90], [700, 80], [840, 60], [930, 100]];
const HYDRA_HEADS: [number, number, -1 | 0 | 1][] = [[400, 300, -1], [500, 270, 0], [600, 300, 1]];

function Hydra({ id }: { id: string }) {
  return (
    <SceneSvg id={id} stops={[[0, "grey-900"], [1, "primary-dark"]]}>
      <path className="pf-f-client-5-ink" opacity=".35" d="M160 440C160 220 300 90 500 90S840 220 840 440Z" />
      <path className="pf-f-primary-dark" opacity=".7" d="M220 440C220 260 340 150 500 150S780 260 780 440Z" />
      {STALACTITES.map(([x, h]) => (
        <path key={x} className="pf-f-grey-900" d={`M${x} 0h70l-35 ${h}z`} />
      ))}
      {HYDRA_HEADS.map(([x, y, d]) => (
        <g key={x}>
          <path className="pf-s-client-5-ink" d={`M${500 + d * 30} 440C${500 + d * 20} 380 ${x - d * 30} ${y + 60} ${x} ${y}`} fill="none" strokeWidth="34" strokeLinecap="round" />
          <ellipse className="pf-f-client-5-ink" cx={x} cy={y - 8} rx="34" ry="24" />
          <circle className="pf-f-accent-mint" cx={x - 12} cy={y - 14} r="5" />
          <circle className="pf-f-accent-mint" cx={x + 12} cy={y - 14} r="5" />
        </g>
      ))}
      <path className="pf-f-grey-900" d="M0 420C200 400 800 400 1000 420V440H0Z" />
    </SceneSvg>
  );
}

const WAVES = [320, 350, 384, 416];

function Lighthouse({ id }: { id: string }) {
  return (
    <SceneSvg id={id} stops={[[0, "sky-picked"], [0.6, "sky-echoed"], [1, "pink-bg"]]}>
      <circle className="pf-f-warn-bg" cx="640" cy="300" r="90" />
      <rect className="pf-f-primary-blue" y="300" width="1000" height="140" />
      {WAVES.map((y, k) => (
        <path key={y} className="pf-s-primary-blue-bright" d={`M${60 + k * 40} ${y}h${120 - k * 10}M${420 + k * 30} ${y + 8}h90M${740 - k * 20} ${y}h110`} strokeWidth="4" strokeLinecap="round" />
      ))}
      <path className="pf-f-primary-dark" d="M760 440L800 300L880 270L1000 300V440Z" />
      <path className="pf-f-bg-primary" d="M844 280L852 160H884L892 280Z" />
      <path className="pf-f-err-strong" d="M848 240h40v14h-40zM850 200h36v14h-36z" />
      <path className="pf-f-primary-dark" d="M846 160h44l-6-20h-32z" />
      <path className="pf-f-warn-bg" opacity=".5" d="M868 142L560 80V200Z" />
    </SceneSvg>
  );
}

const SCENES: Record<Scene, (props: { id: string }) => ReactNode> = { meadow: Meadow, dragon: Dragon, hydra: Hydra, lighthouse: Lighthouse };

/** One scene, filling its box; `id` names its gradient, so give each drawing on a page its own. */
export function BannerScene({ scene, id }: { scene: Scene; id: string }) {
  const Drawn = SCENES[scene];
  return <Drawn id={id} />;
}
