// A lighthouse on the night horizon (QS.6; prototype version 10, section 5):
// rock, tower, two bands, gallery, lamp and roof, and, once its Beacon is lit,
// a beam each way. Every fill is a class in app/styles/quests-lighthouses.css
// that reads a token, so the art follows the token set. The dark one is the
// ghost that stands where the reader's Beacon would.
import { useId } from "react";

export function LighthouseArt({ lit }: { lit: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg className={`qn-lh-art${lit ? "" : " qn-lh-art--dark"}`} viewBox="0 0 44 110" aria-hidden="true">
      {lit && (
        <>
          <defs>
            <linearGradient id={`${id}l`} x1="1" y1="0" x2="0" y2="0">
              <stop offset="0" className="qn-beam-a" />
              <stop offset="1" className="qn-beam-z" />
            </linearGradient>
            <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" className="qn-beam-a" />
              <stop offset="1" className="qn-beam-z" />
            </linearGradient>
          </defs>
          <g className="qn-beam">
            <path d="M22 24 L-78 2 L-78 46 Z" fill={`url(#${id}l)`} />
            <path d="M22 24 L122 2 L122 46 Z" fill={`url(#${id}r)`} />
          </g>
        </>
      )}
      <path className="qn-lh-rock" d="M3 110c2-9 8-13 19-13s17 4 19 13z" />
      <path className="qn-lh-tower" d="M14 100 L17 36 H27 L30 100 Z" />
      <path className="qn-lh-band" d="M15 80 L15.5 70 H28.5 L29 80 Z" />
      <path className="qn-lh-band" d="M16 58 L16.4 50 H27.6 L28 58 Z" />
      <rect className="qn-lh-gallery" x="12.5" y="32" width="19" height="4" rx="1" />
      <rect className="qn-lh-lamp" x="16" y="18" width="12" height="14" rx="1.5" />
      <path className="qn-lh-roof" d="M13.5 18.5 L22 9 L30.5 18.5 Z" />
    </svg>
  );
}

/** The sea under the horizon: a wave across the width and three glints. */
export function Sea() {
  const wave = "M0 7 Q 12.5 1 25 7 T 50 7 T 75 7 T 100 7 T 125 7 T 150 7 T 175 7 T 200 7 T 225 7 T 250 7 T 275 7 T 300 7 T 325 7 T 350 7 T 375 7 T 400 7";
  return (
    <div className="qn-sea" aria-hidden="true">
      <svg viewBox="0 0 400 14" preserveAspectRatio="none">
        <path className="qn-wave" d={`${wave} V14 H0 Z`} />
        <path className="qn-wave-line" vectorEffect="non-scaling-stroke" d={wave} />
      </svg>
      <i className="qn-glint qn-glint--1" />
      <i className="qn-glint qn-glint--2" />
      <i className="qn-glint qn-glint--3" />
    </div>
  );
}
