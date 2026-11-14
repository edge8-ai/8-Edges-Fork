// The game's art (QS.1), lifted from the approved prototype (version 8). Every
// fill is a class in app/styles/quests.css that reads a token, because a
// literal colour fails check:tokens and an SVG presentation attribute cannot
// read a CSS variable. The animations (bob, flap, blink, swish) are CSS too,
// and are stilled under prefers-reduced-motion there.
import type { HeadCard, Monster } from "../lib/quests-read";
import { headDown, type Mood } from "./quests-model";

/** The boss of a bounty to everyone. Defeated, its eyes cross and its grin turns over. */
export function DragonArt({ defeated = false, label = "The bounty dragon" }: { defeated?: boolean; label?: string }) {
  return (
    <svg className="qs-dragon" viewBox="0 0 160 150" role="img" aria-label={label}>
      <ellipse className="qs-f-shadow" cx="80" cy="142" rx="44" ry="6" />
      <g className="qs-tail">
        <path className="qs-f-violet-deep" d="M106 104c18 4 30-2 36-14 2 10-2 20-12 26-8 5-20 5-30 0z" />
        <path className="qs-f-amber" d="M140 86l8-6-2 12z" />
      </g>
      <g className="qs-wing qs-wing--l">
        <path className="qs-f-violet-deep" d="M64 72C44 40 18 40 10 56c10-3 18 1 20 9 6-6 14-4 18 4 4-4 10-3 16 3z" />
      </g>
      <g className="qs-wing qs-wing--r">
        <path className="qs-f-violet-deep" d="M96 72c20-32 46-32 54-16-10-3-18 1-20 9-6-6-14-4-18 4-4-4-10-3-16 3z" />
      </g>
      <ellipse className="qs-f-violet" cx="80" cy="102" rx="34" ry="32" />
      <ellipse className="qs-f-violet-soft" cx="80" cy="110" rx="21" ry="21" />
      <path className="qs-s-violet-line" d="M66 100h28M64 109h32M67 118h26" strokeWidth="2" strokeLinecap="round" />
      <ellipse className="qs-f-violet-deep" cx="60" cy="132" rx="10" ry="6" />
      <ellipse className="qs-f-violet-deep" cx="100" cy="132" rx="10" ry="6" />
      <path className="qs-f-amber" d="M62 34l-6-16 14 10z" />
      <path className="qs-f-amber" d="M98 34l6-16-14 10z" />
      <ellipse className="qs-f-violet" cx="80" cy="54" rx="30" ry="25" />
      <path className="qs-f-mint" d="M74 30l6-8 6 8z" />
      <ellipse className="qs-f-blush" cx="62" cy="60" rx="5" ry="3" />
      <ellipse className="qs-f-blush" cx="98" cy="60" rx="5" ry="3" />
      {defeated ? (
        <>
          <path className="qs-s-ink" d="M64 46l7 7M71 46l-7 7M89 46l7 7M96 46l-7 7" strokeWidth="3" strokeLinecap="round" />
          <path className="qs-s-ink" d="M74 64q6-4 12 0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle className="qs-f-white" cx="68" cy="49" r="7" />
          <circle className="qs-f-white" cx="92" cy="49" r="7" />
          <circle className="qs-f-ink" cx="69.5" cy="50" r="3.6" />
          <circle className="qs-f-ink" cx="93.5" cy="50" r="3.6" />
          <circle className="qs-f-white" cx="71" cy="48.5" r="1.2" />
          <circle className="qs-f-white" cx="95" cy="48.5" r="1.2" />
          <rect className="qs-lid qs-f-violet" x="60" y="41" width="16" height="16" rx="8" />
          <rect className="qs-lid qs-f-violet" x="84" y="41" width="16" height="16" rx="8" />
          <path className="qs-s-ink" d="M72 62q8 7 16 0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path className="qs-f-white" d="M76 64.5l2 3 2-3" />
        </>
      )}
      <circle className="qs-f-violet-ink" cx="76" cy="57" r="1.3" />
      <circle className="qs-f-violet-ink" cx="84" cy="57" r="1.3" />
    </svg>
  );
}

type SlimeTone = "mint" | "amber" | "violet";

/** A slime: a small bounty. A learning bounty's slime is mint, any other amber. */
export function SlimeArt({ tone, size = 34 }: { tone: SlimeTone; size?: number }) {
  return (
    <svg className="qs-slime" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <ellipse className="qs-f-shadow-soft" cx="20" cy="37" rx="13" ry="2.5" />
      <path className={`qs-f-slime-${tone}`} d="M6 33c0-14 6-24 14-24s14 10 14 24z" />
      <path className="qs-s-shine" d="M11 22c1-5 3-8 6-9" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <circle className="qs-f-ink" cx="16" cy="24" r="2.2" />
      <circle className="qs-f-ink" cx="25" cy="24" r="2.2" />
      <path className="qs-s-ink" d="M18 28.5q2.5 2 5 0" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** The empty arena's slime, asleep: eyes closed and a small smile, waiting to be summoned. */
export function SleepySlimeArt({ size = 72 }: { size?: number }) {
  return (
    <svg className="qs-slime" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="A slime, asleep">
      <ellipse className="qs-f-shadow-soft" cx="20" cy="37" rx="13" ry="2.5" />
      <path className="qs-f-slime-mint" d="M6 33c0-14 6-24 14-24s14 10 14 24z" />
      <path className="qs-s-shine" d="M11 22c1-5 3-8 6-9" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path className="qs-s-ink" d="M13.5 24.5q2.5 1.8 5 0M21.5 24.5q2.5 1.8 5 0" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path className="qs-s-ink" d="M18 29q2 .8 4 0" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** The monster a bounty draws on a card or in the drawer's preview: a dragon is a violet slime at card size. */
export function MonsterArt({ monster, learning, size }: { monster: Monster; learning: boolean; size?: number }) {
  if (monster === "dragon" || monster === "hydra") return <SlimeArt tone="violet" size={size ?? 40} />;
  if (monster === "big_slime") return <SlimeArt tone={learning ? "mint" : "amber"} size={size ?? 38} />;
  return <SlimeArt tone={learning ? "mint" : "amber"} size={size ?? 32} />;
}

/**
 * The Hydra: one body, one neck and head per head of the Bounty, left to right
 * in the Giver's order. A head droops, its eyes crossed, once the party has it
 * down or it has closed. The heads spread across the body however many there
 * are; past five they crowd, which a bounty with that many asks deserves.
 */
export function HydraArt({ heads }: { heads: Pick<HeadCard, "id" | "hp" | "verdict" | "closed">[] }) {
  const n = heads.length;
  const spacing = n > 1 ? Math.min(44, 120 / (n - 1)) : 0;
  return (
    <svg className="qs-hydra-art" viewBox="0 0 200 150" role="img" aria-label={`The hydra, ${n} heads`}>
      <ellipse className="qs-f-shadow" cx="100" cy="142" rx="56" ry="6" />
      {heads.map((h, i) => {
        const x = 100 + (i - (n - 1) / 2) * spacing;
        const lean = x < 100 ? -10 : x > 100 ? 10 : 0;
        const down = headDown(h) || h.closed;
        return (
          <g key={h.id} className={`qs-neck ${lean < 0 ? "qs-neck--l" : "qs-neck--r"} ${down ? "qs-neck--down" : ""}`}>
            <path className="qs-s-violet" d={`M${x} 118c-6-30 2-52 ${lean} -70`} strokeWidth="18" strokeLinecap="round" fill="none" />
            <g transform={`translate(${x + lean} 44)`}>
              <ellipse className="qs-f-violet" rx="22" ry="18" />
              <path className="qs-f-amber" d="M-6-16l5-10 5 10z" />
              {down ? (
                <path className="qs-s-ink" d="M-12-4l5 5M-7-4l-5 5M7-4l5 5M12-4l-5 5" strokeWidth="2.6" strokeLinecap="round" />
              ) : (
                <>
                  <circle className="qs-f-white" cx="-8" cy="-3" r="5" />
                  <circle className="qs-f-white" cx="8" cy="-3" r="5" />
                  <circle className="qs-f-ink" cx="-7" cy="-2" r="2.6" />
                  <circle className="qs-f-ink" cx="9" cy="-2" r="2.6" />
                </>
              )}
              <path className="qs-s-ink" d="M-7 7q7 6 14 0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            </g>
          </g>
        );
      })}
      <ellipse className="qs-f-violet" cx="100" cy="112" rx="40" ry="30" />
      <ellipse className="qs-f-violet-soft" cx="100" cy="118" rx="24" ry="18" />
      <ellipse className="qs-f-violet-deep" cx="74" cy="136" rx="11" ry="6" />
      <ellipse className="qs-f-violet-deep" cx="126" cy="136" rx="11" ry="6" />
    </svg>
  );
}

/** The Giver's face beside their line: the bounty's mood. */
export function MoodFace({ mood }: { mood: Mood }) {
  const mouth = {
    sad: "M8 16.5c1.2-1.4 2.5-2 4-2s2.8.6 4 2",
    hopeful: "M9 15h6",
    pleased: "M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8",
    delighted: "M7.5 13.5c1.1 2.2 2.6 3.3 4.5 3.3s3.4-1.1 4.5-3.3z",
  }[mood];
  return (
    <svg className={`qs-face qs-face--${mood}`} width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <circle className="qs-face-eye" cx="9" cy="10" r=".9" />
      <circle className="qs-face-eye" cx="15" cy="10" r=".9" />
      <path className={mood === "delighted" ? "qs-face-fill" : undefined} d={mouth} />
    </svg>
  );
}

const GLYPHS = {
  bounty: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  raid: (
    <>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="m13 19 6-6M16 16l4 4M19 21l2-2" />
      <path d="M9.5 17.5 21 6V3h-3L6.5 14.5" />
      <path d="m11 19-6-6M8 16l-4 4M5 21l-2-2" />
    </>
  ),
  beacon: (
    <>
      <path d="M9 21h6M10 21l1-9h2l1 9" />
      <path d="M9 8h6l-1 4h-4z" />
      <path d="M12 4v1M5.6 5.6l.8.8M18.4 5.6l-.8.8M3 11h2M19 11h2" />
    </>
  ),
  page: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="m12 8 1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2z" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  hand: (
    <>
      <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </>
  ),
  seat: <path d="M5 20v-6h14v6M7 14V9a5 5 0 0 1 10 0v5" />,
  // What a learning evolves into next (QS.7; version 10, the Lore).
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
} as const;

/**
 * A campfire (QS.5; version 10, Campfires). Cold, it is logs and a curl of
 * smoke: a topic three people want, with no Host yet. Burning, it has its
 * flame and two sparks rising: a Raid lit for a time.
 */
export function FireArt({ burning }: { burning: boolean }) {
  const logs = (
    <g className={`qn-logs${burning ? " qn-logs--warm" : ""}`}>
      <rect x="13" y="45" width="46" height="9" rx="4.5" transform="rotate(-13 36 49.5)" />
      <rect x="13" y="45" width="46" height="9" rx="4.5" transform="rotate(13 36 49.5)" />
      <circle cx="15.6" cy="44.6" r="3.2" />
      <circle cx="56.4" cy="44.6" r="3.2" />
    </g>
  );
  const top = burning ? (
    <>
      <g className="qn-flame">
        <path className="qn-f-flame-o" d="M36 4c7 11 17 17 17 32a17 17 0 0 1-34 0c0-9 4-13 8-17 1 5 3 8 5 9-1-10 1-17 4-24z" />
        <path className="qn-f-flame-m" d="M36 19c4.5 7 11 11 11 21a11 11 0 0 1-22 0c0-5.5 3-9 5.5-11 .8 3.2 2 4.6 3.4 5.4-.4-6.4.2-11 2.1-15.4z" />
        <path className="qn-f-flame-i" d="M36 32c2.4 4 5.6 6.4 5.6 10.4a5.6 5.6 0 0 1-11.2 0c0-3.4 2.4-5.8 5.6-10.4z" />
      </g>
      <circle className="qn-spark" cx="26" cy="14" r="1.4" />
      <circle className="qn-spark" cx="47" cy="10" r="1.2" />
    </>
  ) : (
    <path className="qn-smoke" d="M36 40c-5-6 5-9 0-15s5-9 0-15" strokeWidth="2.2" strokeLinecap="round" />
  );
  return (
    <svg viewBox="0 0 72 66" width="72" height="66" aria-hidden="true">
      <ellipse className="qn-f-ash" cx="36" cy="55" rx="27" ry="6" />
      {burning ? (
        <>
          {top}
          {logs}
        </>
      ) : (
        <>
          {logs}
          {top}
        </>
      )}
      <g className="qn-stones">
        <ellipse cx="10" cy="57" rx="5.5" ry="3.6" />
        <ellipse cx="22" cy="60.5" rx="5.5" ry="3.4" />
        <ellipse cx="50" cy="60.5" rx="5.5" ry="3.4" />
        <ellipse cx="62" cy="57" rx="5.5" ry="3.6" />
      </g>
    </svg>
  );
}

export type GlyphName = keyof typeof GLYPHS;

/** A line icon from the prototype's set, in the current colour. */
export function Glyph({ name, size = 16 }: { name: GlyphName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[name]}
    </svg>
  );
}
