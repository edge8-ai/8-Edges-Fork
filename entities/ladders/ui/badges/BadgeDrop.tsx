"use client";

// A badge drop (LD.7b; the badges doc, section 5): what the badgeDrops page
// slot draws for the reader where their act landed.
//
// - Spark: a star falls from the team sky into a chip under the composer, and
//   the badge's tile rises in after it with the two answers.
// - The Workboard and My Training are the corporate side of the two design
//   languages, so the drop is one quiet line ("Badge found: Heavy lift I")
//   that links to the Achievements tab, with the two answers at its end. No
//   confetti, no star.
// - Several at once are one drop, "3 badges found", opening onto the
//   Achievements tab, where each waits with its answers.
//
// The answers are equal and neither is the default: Put in my display case,
// and Keep it in Achievements. A drop is shown once (the badges doc, section
// 5): the moment it is drawn in the reader's browser it is marked seen, so it
// never drops again, whether they answer it or walk away; walking away is
// Keep it in Achievements, where the badge waits with its switch. A mark that
// fails only means it drops once more later. With the reader's game style
// off, or under prefers-reduced-motion, nothing falls and the tile fades in.
// Nobody else is told anything.
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { BadgeMedal } from "./BadgeArt";
import { ACHIEVEMENTS_HREF, caseHasRoom, keepInAchievements, putInCase, type Drop, type DropActions } from "./drop-answers";

export type DropStyle = "spark" | "quiet";

function Star({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 2.5l2.8 6 6.6.8-4.9 4.5 1.3 6.5L12 17.1l-5.8 3.2 1.3-6.5-4.9-4.5 6.6-.8z" />
    </svg>
  );
}

/** The two equal answers; a failed save is reported to the drop, which says so outside the tile. */
function Answers({ drop, caseIds, actions, onDone, onError }: { drop: Drop; caseIds: string[]; actions: DropActions; onDone: () => void; onError: (error: string | null) => void }) {
  const [busy, start] = useTransition();
  const room = caseHasRoom(caseIds) || caseIds.includes(drop.id);
  const run = (put: boolean) => {
    onError(null);
    start(async () => {
      const done = put ? await putInCase(drop.id, drop.unlockId, caseIds, actions) : await keepInAchievements([drop.unlockId], actions);
      if (done.ok) onDone();
      else onError(done.error);
    });
  };
  return (
    <div className="bd-acts">
      <button type="button" className="bd-act" disabled={busy || !room} onClick={() => run(true)}>
        {room ? "Put in my display case" : "Display case full"}
      </button>
      <button type="button" className="bd-act" disabled={busy} onClick={() => run(false)}>
        Keep it in Achievements
      </button>
    </div>
  );
}

export function BadgeDrop({ drops, style, gameOn, caseIds, actions }: { drops: Drop[]; style: DropStyle; gameOn: boolean; caseIds: string[]; actions: DropActions }) {
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Drawn once is shown once: the unlocks are marked seen as soon as the drop
  // is on the reader's screen (the effect runs only in their browser), so the
  // next render of this page, answered or not, draws no drop.
  const unlockIds = drops.map((d) => d.unlockId).join(",");
  useEffect(() => {
    if (unlockIds) void actions.markShown(unlockIds.split(","));
  }, [unlockIds, actions]);
  if (gone || drops.length === 0) return null;
  const one = drops.length === 1 ? drops[0] : null;
  const many = `${drops.length} badges found`;
  const failed = error ? (
    <p className="bd-error" role="alert">
      {error}
    </p>
  ) : null;

  if (style === "quiet") {
    return (
      <div className="bd-line" role="status">
        {one ? <BadgeMedal glyph={one.glyph} rarity={one.rarity} glyphSize={14} /> : null}
        <span className="bd-line-t">
          {one ? (
            <>
              Badge found: <Link href={ACHIEVEMENTS_HREF}>{one.name}</Link>
            </>
          ) : (
            <Link href={ACHIEVEMENTS_HREF}>{many}</Link>
          )}
        </span>
        {one ? <Answers drop={one} caseIds={caseIds} actions={actions} onDone={() => setGone(true)} onError={setError} /> : null}
        {failed}
      </div>
    );
  }

  return (
    <div className={`bd-drop${gameOn ? "" : " bd-drop--still"}`} role="status">
      <span className="bd-chip">
        <span className="bd-chip-star">
          <Star size={16} />
        </span>
        {one ? "Badge found" : <Link href={ACHIEVEMENTS_HREF}>{many}</Link>}
        <span className="bd-fall" aria-hidden="true">
          <Star size={24} />
        </span>
      </span>
      {one ? (
        <div className={`bd-dtile bd--${one.rarity}`}>
          <BadgeMedal glyph={one.glyph} glyphSize={26} />
          <p className="bd-eyebrow">{one.rarity}</p>
          <h2 className="bd-n">{one.name}</h2>
          <p className="bd-d">{one.flavour}</p>
          <Answers drop={one} caseIds={caseIds} actions={actions} onDone={() => setGone(true)} onError={setError} />
        </div>
      ) : null}
      {failed}
    </div>
  );
}
