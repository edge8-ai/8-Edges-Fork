"use client";

// The Achievements tab (LD.7b; spec "The profile page"; the badges doc,
// sections 4 to 6): the owner's badge case, grouped Learn & Share, Builder and
// Both ladders, drawn from the model badge-case.ts built. Only the owner's
// page mounts it; a teammate's page has no Achievements tab.
//
// A found tile's switch puts the badge in the display case or takes it out,
// and is disabled with "Display case full" at five. A badge found and not yet
// seen (the replay found it, or it dropped on a page and was left) shows the
// drop's two answers instead, neither the default. Every choice shows at once
// and saves behind; a save that fails flips back and says why.
import { useState, useTransition } from "react";
import type { Result } from "@/kernel/data/result";
import { DISPLAY_CASE_HOLDS } from "../../lib/display-choices";
import { withAdded, withRemoved } from "../profile/case-choices";
import { BadgeMedal } from "./BadgeArt";
// Types only: the model is built on the server, so the catalogue never reaches the browser.
import type { BadgeCase, CaseTile, FoundTile } from "./badge-case";
import { keepInAchievements, putInCase, type DropActions } from "./drop-answers";

/** "You have 7. This one is found at 10." The owner's count, plainly: no bar, no share, no nudge. */
const countWords = (count: { have: number; at: number }): string => `You have ${count.have}. This one is found at ${count.at}.`;

function Lock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

type FoundProps = { tile: FoundTile; inCase: boolean; full: boolean; seen: boolean; onFlip: () => void; onAnswer: (put: boolean) => void; busy: boolean };

function Found({ tile, inCase, full, seen, onFlip, onAnswer, busy }: FoundProps) {
  const waiting = tile.waiting && !seen;
  const words = inCase || !full ? "In my display case" : "Display case full";
  return (
    <li className={`bd-tile bd--${tile.rarity}${waiting ? " bd-tile--new" : ""}`}>
      <BadgeMedal glyph={tile.glyph} glyphSize={20} />
      <div className="bd-tile-top">
        <h4 className="bd-n">{tile.name}</h4>
        <span className="bd-r">{tile.rarity}</span>
      </div>
      <p className="bd-d">{tile.flavour}</p>
      {tile.band ? <p className="bd-band">{tile.band}</p> : null}
      {waiting ? (
        <div className="bd-w">
          <span className="bd-new">New</span>
          <div className="bd-acts">
            <button type="button" className="bd-act" disabled={busy || (full && !inCase)} onClick={() => onAnswer(true)}>
              {full && !inCase ? "Display case full" : "Put in my display case"}
            </button>
            <button type="button" className="bd-act" disabled={busy} onClick={() => onAnswer(false)}>
              Keep it in Achievements
            </button>
          </div>
        </div>
      ) : (
        <div className="bd-w">
          <button type="button" className="yl-wear-sw" role="switch" aria-checked={inCase} aria-label={`${tile.name} in my display case`} disabled={!inCase && full} onClick={onFlip}>
            <span className="yl-wear-track" aria-hidden="true" />
          </button>
          {words}
        </div>
      )}
    </li>
  );
}

function Closed({ tile }: { tile: Exclude<CaseTile, FoundTile> }) {
  if (tile.state === "secret") {
    return (
      // Section 6: a dark tile, "???" and the hint. Its rarity would say something about the secret, so it stays unsaid until found.
      <li className="bd-tile bd-tile--secret">
        <BadgeMedal glyph="hidden" state="secret" glyphSize={20} />
        <div className="bd-tile-top">
          <h4 className="bd-n" aria-label="Secret badge">
            ???
          </h4>
        </div>
        <p className="bd-d">{tile.hint}</p>
      </li>
    );
  }
  return (
    <li className={`bd-tile bd-tile--locked bd--${tile.rarity}`}>
      <BadgeMedal glyph={tile.glyph} state="locked" glyphSize={20} />
      <div className="bd-tile-top">
        <h4 className="bd-n">{tile.name}</h4>
        <span className="bd-r">{tile.rarity}</span>
      </div>
      <p className="bd-d">
        <b>Found by:</b> {tile.rule}
      </p>
      {tile.count ? <p className="bd-count">{countWords(tile.count)}</p> : null}
    </li>
  );
}

export function AchievementsView({ model, actions, note }: { model: BadgeCase; actions: DropActions; note: string | null }) {
  const [caseIds, setCaseIds] = useState<string[]>(model.displayCase);
  // Customise on the hero changes the case too; take the case the page was drawn with when it changes.
  const savedCase = model.displayCase.join("|");
  const [seenCase, setSeenCase] = useState(savedCase);
  if (savedCase !== seenCase) {
    setSeenCase(savedCase);
    setCaseIds(model.displayCase);
  }
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const full = caseIds.length >= DISPLAY_CASE_HOLDS;

  const flip = (id: string) => {
    const before = caseIds;
    const next = before.includes(id) ? withRemoved(before, id) : withAdded(before, id);
    if (next.length === before.length && !before.includes(id)) return;
    setCaseIds(next);
    setError(null);
    start(async () => {
      const saved = await actions.setDisplay({ displayCase: next });
      if (!saved.ok) {
        setCaseIds(before);
        setError(saved.error);
      }
    });
  };
  const answer = (tile: FoundTile, put: boolean) => {
    setError(null);
    start(async () => {
      const done: Result & { caseIds?: string[] } = put ? await putInCase(tile.id, tile.unlockId, caseIds, actions) : await keepInAchievements([tile.unlockId], actions);
      if (!done.ok) {
        setError(done.error);
        return;
      }
      if (done.caseIds) setCaseIds(done.caseIds);
      setSeen((s) => new Set(s).add(tile.unlockId));
    });
  };

  return (
    <section className="bd-case" aria-labelledby="bd-case-h">
      <div className="bd-case-head">
        <h2 className="bd-case-h" id="bd-case-h">
          Your badge case
        </h2>
        <span className="bd-priv">
          <Lock />
          Only you see the ones still to find
        </span>
      </div>
      <p className="bd-case-hint">Switch one on and it joins your display case, up to five. The first three are the stickers on your postcard.</p>
      {note ? (
        <p className="bd-case-hint" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="bd-error" role="alert">
          {error}
        </p>
      ) : null}
      {model.groups.map((group) => (
        <section key={group.key} className="bd-group" aria-labelledby={`bd-g-${group.key}`}>
          <h3 className="bd-group-h" id={`bd-g-${group.key}`}>
            {group.label}
          </h3>
          <ul className="bd-grid">
            {group.tiles.map((tile) =>
              tile.state === "found" ? (
                <Found key={tile.id} tile={tile} inCase={caseIds.includes(tile.id)} full={full} seen={seen.has(tile.unlockId)} busy={busy} onFlip={() => flip(tile.id)} onAnswer={(put) => answer(tile, put)} />
              ) : (
                <Closed key={tile.id} tile={tile} />
              ),
            )}
          </ul>
        </section>
      ))}
    </section>
  );
}
