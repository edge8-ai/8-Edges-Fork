"use client";

// The training block at the top of My Training (TR.12, the canvas Khoa approved
// on 2026-11-03). Eight weeks of capsules (height is length, colour is type,
// hollow skipped, dashed still to come) over the member's own usual week; the
// goal they set with one tap, which fills the ring and stamps Block complete;
// and the shelf of certificates and firsts. Only the member sees any of it, and
// it never counts a streak or names a missed week.
import { useState, useTransition } from "react";
import type { Result } from "@/kernel/data/result";
import { GOAL_CHOICES, goalView, type BlockView, type BlockWeek, type ShelfBadge } from "../lib/training-block";

const RING = 2 * Math.PI * 60;

function Chart({ view, goal, width, capsule, narrow }: { view: BlockView; goal: number | null; width: number; capsule: number; narrow: boolean }) {
  const base = 196;
  const plot = 168;
  const y = (min: number) => base - (min / view.scale) * plot;
  const col = width / view.weeks.length;
  const summary = view.weeks.map((w) => `${w.label}: ${w.wentMinutes} minutes`).join("; ");
  const usual = view.usual ? ` Your usual week is ${view.usual.low} to ${view.usual.high} minutes.` : "";
  return (
    <svg className={`tr-hb-svg${narrow ? " is-narrow" : " is-wide"}`} viewBox={`0 0 ${width} ${base + 26}`} role="img" aria-label={`Your last eight weeks of training. ${summary}.${usual}`}>
      <rect className="tr-hb-now" x={col * (view.weeks.length - 1) + 4} y={6} width={col - 8} height={base - 2} rx={12} />
      {view.usual && (
        <>
          <rect className="tr-hb-band" x={0} y={y(view.usual.high)} width={width} height={y(view.usual.low) - y(view.usual.high)} rx={8} />
          {!narrow && (
            <text className="tr-hb-band-label" x={6} y={y(view.usual.high) - 6}>
              YOUR USUAL {view.usual.low}–{view.usual.high} MIN
            </text>
          )}
        </>
      )}
      <line className="tr-hb-base" x1={0} x2={width} y1={base + 2} y2={base + 2} />
      {goal !== null && <line className="tr-hb-goal-line" x1={0} x2={width} y1={y(goal)} y2={y(goal)} />}
      {view.weeks.map((w, i) => (
        <Week key={w.monday} week={w} index={i} cx={col * i + col / 2} capsule={capsule} base={base} plot={plot} scale={view.scale} narrow={narrow} />
      ))}
    </svg>
  );
}

function Week({ week, index, cx, capsule, base, plot, scale, narrow }: { week: BlockWeek; index: number; cx: number; capsule: number; base: number; plot: number; scale: number; narrow: boolean }) {
  let top = base;
  return (
    <g>
      {week.capsules.length === 0 && <rect className="tr-hb-ghost" x={cx - capsule / 2} y={base - (75 / scale) * plot} width={capsule} height={(75 / scale) * plot} rx={capsule / 2} />}
      {week.capsules.map((c) => {
        const h = Math.max((c.minutes / scale) * plot, capsule);
        top -= h;
        const what = c.state === "went" ? "went" : c.state === "skipped" ? "skipped" : "still to come";
        return (
          <rect key={c.key} className={`tr-hb-cap ${c.tone} is-${c.state} tr-hb-col-${index}`} x={cx - capsule / 2} y={top + 1.5} width={capsule} height={h - 3} rx={capsule / 2}>
            <title>{`${c.title} · ${c.typeName}, ${c.minutes} min, ${what}`}</title>
          </rect>
        );
      })}
      <text className={`tr-hb-wk${week.isNow ? " is-now" : ""}`} x={cx} y={base + 20}>
        {narrow ? (week.isNow ? "Now" : week.label.split(" ")[0]) : week.label}
      </text>
    </g>
  );
}

function Medal({ badge }: { badge: ShelfBadge }) {
  const tone = badge.kind === "certificate" ? "" : ` ${badge.tone}`;
  return (
    <svg className={`tr-hb-medal is-${badge.kind}${tone}`} viewBox="0 0 58 58" aria-hidden="true">
      {badge.kind === "certificate" && <path className="tr-hb-ribbon" d="M20 44l-4 12 7-4 4 5 3-11z M38 44l4 12-7-4-4 5-3-11z" />}
      <circle className="tr-hb-disc" cx={29} cy={27} r={22} />
      {badge.kind === "certificate" ? <path className="tr-hb-glyph" d="M21 27l5 5 11-11" /> : <path className="tr-hb-glyph" d="M29 15l3 8.5 9 .5-7 5.5 2.5 8.5-7.5-5-7.5 5 2.5-8.5-7-5.5 9-.5z" />}
    </svg>
  );
}

export function TrainingBlock({ view, shelf, goal: saved, setGoal }: { view: BlockView; shelf: ShelfBadge[]; goal: number | null; setGoal: (minutes: number | null) => Promise<Result> }) {
  const [goal, setLocal] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ring = goalView(goal, view.thisWeek.went, view.thisWeek.waiting);
  const empty = view.weeks.every((w) => w.capsules.length === 0);

  const pick = (minutes: number | null) => {
    if (minutes === goal) return;
    const before = goal;
    setLocal(minutes);
    setError(null);
    start(async () => {
      const res = await setGoal(minutes);
      if (!res.ok) {
        setLocal(before);
        setError(res.error);
      }
    });
  };

  return (
    <section className="tr-hb" aria-labelledby="tr-hb-h">
      <h2 className="tr-hb-title" id="tr-hb-h">
        Your training block
      </h2>
      <p className="tr-hb-sub">{empty ? "Your weeks fill in as you log trainings. Your usual week shows once four weeks have one." : "Eight weeks, against your own usual week. No streaks, no ranks: only you see this."}</p>
      <div className="tr-hb-grid">
        <div className="tr-hb-chart">
          <Chart view={view} goal={goal} width={700} capsule={22} narrow={false} />
          <Chart view={view} goal={goal} width={340} capsule={16} narrow />
          <div className="tr-hb-legend">
            <span className="tr-hb-key">
              <i className="is-went" />
              Went (height is length)
            </span>
            <span className="tr-hb-key">
              <i />
              Skipped
            </span>
            <span className="tr-hb-key">
              <i className="is-waiting" />
              Still to come
            </span>
            <span className="tr-hb-key">
              <i className="is-band" />
              Your usual week
            </span>
            <span className="tr-hb-key">Colour is the type</span>
          </div>
        </div>
        <div className="tr-hb-goal">
          <p className="tr-hb-goal-t">This week&apos;s goal</p>
          <div className="tr-hb-ring-wrap">
            <svg className={`tr-hb-ring${ring.met ? " is-done" : ""}${ring.share === 0 ? " is-empty" : ""}`} viewBox="0 0 150 150" role="img" aria-label={goal === null ? `${view.thisWeek.went} minutes this week, no goal set` : `${view.thisWeek.went} of ${goal} minutes this week`}>
              <circle className="tr-hb-ring-track" cx={75} cy={75} r={60} />
              <circle className="tr-hb-ring-fill" cx={75} cy={75} r={60} strokeDasharray={`${(RING * Math.min(1, ring.share)).toFixed(1)} ${RING.toFixed(1)}`} transform="rotate(-90 75 75)" />
            </svg>
            <div className="tr-hb-ring-text" aria-hidden="true">
              <b>{view.thisWeek.went} min</b>
              <span>{goal === null ? "no goal set" : `of ${goal}`}</span>
            </div>
          </div>
          {ring.met && <span className="tr-hb-stamp">Block complete</span>}
          <div className="tr-hb-chips" role="group" aria-label="Your weekly goal">
            {[null, ...GOAL_CHOICES].map((g) => (
              <button key={g ?? "none"} type="button" className={`tr-hb-chip${goal === g ? " is-on" : ""}`} aria-pressed={goal === g} disabled={pending} onClick={() => pick(g)}>
                {g === null ? "No goal" : `${g} min`}
              </button>
            ))}
          </div>
          <p className="tr-hb-goal-note" role={error ? "alert" : undefined}>
            {error ?? ring.note}
          </p>
        </div>
      </div>
      {shelf.length > 0 && (
        <div className="tr-hb-shelf">
          <p className="tr-hb-shelf-t">Your shelf</p>
          <ul className="tr-hb-badges">
            {shelf.map((b) => (
              <li key={b.key} className={`tr-hb-badge${b.kind === "not-yet" ? " is-not-yet" : ""}`}>
                <Medal badge={b} />
                <span className="tr-hb-badge-name">{b.name}</span>
                <span className="tr-hb-badge-when">{b.kind === "not-yet" ? "Not yet" : b.when}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
