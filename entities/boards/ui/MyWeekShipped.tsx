"use client";
// Shipped this sprint (W.173), as an achievement rather than a list (review,
// 2026-10-07: "made like a game achievement, not a list"). Every finished card
// feeds the sprint's plant a leaf, and the sprint's own milestones unlock
// badges. What fed the plant since the last visit grows in with an animation
// and a "+N" — the moment the page gives back for the work.
//
// "Since the last visit" is this browser's memory, not the server's: the count
// and badges last seen are kept in localStorage per sprint week. That is a
// per-viewer convenience by design — nobody else reads it, and when storage is
// blocked the page simply shows the plant as it is, without the animation.
//
// The server renders the settled plant; the effect only decides what to
// animate, so the page is whole before hydration and without JavaScript.
import { useEffect, useState } from "react";
import type { Badge, BadgeId } from "@/entities/boards/lib/my-week-sprint";
import { PLANT_BLOOM_AT, PLANT_LEAVES } from "@/entities/boards/lib/my-week-sprint";
import { MyWeekSprout, sproutStage } from "./MyWeekSprout";

type Seen = { n: number; badges: string[] };

function readSeen(key: string): Seen | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Seen>;
    return { n: typeof v.n === "number" ? v.n : 0, badges: Array.isArray(v.badges) ? v.badges.filter((b): b is string => typeof b === "string") : [] };
  } catch {
    return null;
  }
}

function writeSeen(key: string, seen: Seen) {
  try {
    window.localStorage.setItem(key, JSON.stringify(seen));
  } catch {
    // Private window or blocked storage: the animation is a convenience.
  }
}

/** What the next card does to the plant: the goal is always one step away. */
function nextGrowth(fed: number): string {
  if (fed < PLANT_LEAVES) return fed === 0 ? "Finish a card to plant it." : "Your next card grows a leaf.";
  if (fed < PLANT_BLOOM_AT - 1) return "One more card sets a bud.";
  if (fed < PLANT_BLOOM_AT) return "One more card and it blooms.";
  return "It is in full bloom for this sprint.";
}

export function MyWeekShipped({ week, fed, badges }: { week: string; fed: { id: string; title: string }[]; badges: Badge[] }) {
  const n = fed.length;
  // A string, so the effect below re-runs when the set changes and not on every render.
  const earnedKey = badges.filter((b) => b.earned).map((b) => b.id).join(",");
  const [fresh, setFresh] = useState(0);
  const [newBadges, setNewBadges] = useState<BadgeId[]>([]);

  useEffect(() => {
    const key = `edge8.myweek.fed.${week}`;
    const earned = (earnedKey ? earnedKey.split(",") : []) as BadgeId[];
    // On the next frame, so the settled plant has painted before the new
    // leaves start again from nothing; and the memory is written in the same
    // callback, so an effect that is cancelled (Strict Mode runs it twice)
    // leaves the last visit as it was.
    const frame = window.requestAnimationFrame(() => {
      const seen = readSeen(key) ?? { n: 0, badges: [] };
      // A count lower than last time means a card was reopened: nothing to
      // celebrate, and nothing to take away either.
      setFresh(Math.max(0, n - seen.n));
      setNewBadges(earned.filter((id) => !seen.badges.includes(id)));
      writeSeen(key, { n, badges: earned });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [week, n, earnedKey]);

  return (
    <section className="admin-myweek-card admin-myweek-shipped" aria-labelledby="my-week-shipped-h">
      <h2 className="admin-myweek-rail-h" id="my-week-shipped-h">
        Shipped this sprint
        {n > 0 && <span className="admin-myweek-count">{n}</span>}
      </h2>
      <div className="admin-myweek-plant">
        <div className="admin-myweek-plant-pot">
          {fresh > 0 && (
            <span className="admin-myweek-drops" aria-hidden="true">
              {Array.from({ length: Math.min(fresh, 5) }, (_, i) => (
                <span key={i} className="admin-myweek-drop" />
              ))}
            </span>
          )}
          <MyWeekSprout fed={n} names={fed.map((f) => f.title)} fresh={fresh} />
        </div>
        <div className="admin-myweek-plant-words">
          <p className="admin-myweek-plant-stage">{sproutStage(n)}</p>
          <p className="admin-myweek-plant-fed">
            {n === 1 ? "1 card fed it" : `${n} cards fed it`}
            {fresh > 0 && (
              <span className="admin-myweek-plant-plus" role="status">
                +{fresh} since you last looked
              </span>
            )}
          </p>
          <p className="admin-myweek-plant-next">{nextGrowth(n)}</p>
        </div>
      </div>
      {/* The cards behind the leaves, for a screen reader: the drawing names
          them only in tooltips. */}
      {n > 0 && (
        <ul className="u-sr-only">
          {fed.map((f) => (
            <li key={f.id}>{f.title}</li>
          ))}
        </ul>
      )}
      <ul className="admin-myweek-badges" aria-label="Badges this sprint">
        {badges.map((b) => (
          // A locked badge's sentence is also its tooltip: the band hides the
          // sentence to keep the shelf one row tall, and hover still says it.
          <li
            key={b.id}
            className={`admin-myweek-badge${b.earned ? " is-earned" : ""}${newBadges.includes(b.id) ? " is-new" : ""}`}
            title={b.earned ? undefined : b.how}
          >
            <BadgeMedal id={b.id} />
            <span className="admin-myweek-badge-name">{b.name}</span>
            <span className="admin-myweek-badge-how">{b.earned ? "Earned" : b.how}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// One glyph per badge, drawn on a 24-unit grid in the medal's own stroke.
const GLYPHS: Record<BadgeId, string> = {
  first: "M7 20V5 M7 5h10l-2.5 3.5L17 12H7",
  five: "M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z",
  ten: "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5 M12 4.5v3 M12 16.5v3 M4.5 12h3 M16.5 12h3 M6.7 6.7l2.1 2.1 M15.2 15.2l2.1 2.1 M6.7 17.3l2.1-2.1 M15.2 8.8l2.1-2.1",
  p1: "M3 19l6-10 4 6 2.5-3.5L21 19z",
  early: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16 M12 8v4.5l3 2",
  comeback: "M5 12a7 7 0 1 0 2.2-5.1 M5 4.5v3.6h3.6",
};

function BadgeMedal({ id }: { id: BadgeId }) {
  return (
    <svg className="admin-myweek-medal" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle className="admin-myweek-medal-disc" cx="20" cy="20" r="17" />
      <g transform="translate(8 8)">
        <path className="admin-myweek-medal-glyph" d={GLYPHS[id]} />
      </g>
    </svg>
  );
}
