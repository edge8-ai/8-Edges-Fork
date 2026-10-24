"use client";

// Lighthouses on the Quests page (QS.6; spec "Lighthouses"; prototype version
// 10, section 5). A night horizon above a sea, one lighthouse for each lit
// Beacon, lamp and beam lit and its author's face at its foot, wearing the
// border its owner chose (the page's one faces call). Tapping one shows the
// author and the title, and Open link goes outside. With none lit the horizon
// is never blank: the moon, and a ghost lighthouse with the reader's own face,
// bare, where their Beacon would stand.
//
// Light a Beacon opens the form (BeaconForm). A fire the reader hosted that
// was held and has no Beacon yet is offered on one line above the button, and
// opens the same form with the fire's title filled in. The lighthouses stand
// evenly spaced by the stylesheet (auto margins), so a horizon with more than
// fits scrolls inside itself and the page never does. Nothing counts views,
// likes or reach. With the game style off the same Beacons are a plain list.
import { useEffect, useState, type ReactNode } from "react";
import { Glyph } from "./art";
import { BeaconForm, type BeaconPrefill } from "./BeaconForm";
import { Face } from "./Face";
import { LighthouseArt, Sea } from "./lighthouse-art";
import { useGameStyle } from "./game-style";
import { useLands } from "./lands";
import { LandsRail } from "./LandsRail";
import { ActDrop, useDrop } from "./ActDrop";
import { dropWords } from "./lands-words";
import { questWords } from "./plain-model";
import type { BeaconActions } from "./actions-type";
import type { LighthouseWords } from "./lighthouse-words";
import type { Portrait } from "../lib/quests-read";
import { handsFireOffers, tipSide, type LitBeacon, type Lighthouses as LighthousesValue } from "../lib/lighthouse-model";

function Lighthouse({ beacon, side, open, fresh, words, onToggle }: { beacon: LitBeacon; side: string; open: boolean; fresh: boolean; words: LighthouseWords; onToggle: () => void }) {
  const by = beacon.mine ? words.you : beacon.author.name;
  const tip = `qn-lh-tip-${beacon.questId}`;
  return (
    <div className={`qn-lh${open ? " is-open" : ""}${fresh ? " qn-lh--fresh" : ""}`} data-side={side} data-beacon={beacon.questId}>
      <button type="button" className="qn-lh-btn" aria-expanded={open} aria-controls={tip} aria-label={`${beacon.title}, by ${beacon.mine ? "you" : beacon.author.name}`} onClick={onToggle}>
        <LighthouseArt lit />
        <Face who={beacon.author} size="sm" />
      </button>
      <div className="qn-lh-tip" id={tip}>
        <small>{by}</small>
        <span className="qn-lh-tip-t">{beacon.title}</span>
        {beacon.url && (
          <a className="qn-lh-open" href={beacon.url} target="_blank" rel="noopener noreferrer">
            {words.openLink}
          </a>
        )}
      </div>
    </div>
  );
}

function Horizon({ lit, me, words, open, fresh, onToggle, drop }: { lit: LitBeacon[]; me: Portrait; words: LighthouseWords; open: string | null; fresh: string | null; onToggle: (id: string) => void; drop: ReactNode }) {
  return (
    <div className="qn-horizon" role="group" aria-label={words.litLabel(lit.length)}>
      <span className="qn-moon" aria-hidden="true" />
      {lit.length > 0 ? (
        <div className="qn-lh-track">
          {lit.map((b, i) => (
            <Lighthouse key={b.questId} beacon={b} side={tipSide(i, lit.length)} open={open === b.questId} fresh={fresh === b.questId} words={words} onToggle={() => onToggle(b.questId)} />
          ))}
        </div>
      ) : (
        <>
          <div className="qn-lh-ghost" aria-hidden="true">
            <LighthouseArt lit={false} />
            <Face who={me} size="sm" bare />
          </div>
          <p className="qn-horizon-note">
            {words.empty} <b>{words.emptyBold}</b>
          </p>
        </>
      )}
      <Sea />
      {drop}
    </div>
  );
}

function PlainList({ lit, words, drop }: { lit: LitBeacon[]; words: LighthouseWords; drop: ReactNode }) {
  if (lit.length === 0) {
    return (
      <p className="qn-none">
        {words.empty} {words.emptyBold}
        {drop}
      </p>
    );
  }
  return (
    <>
    {drop}
    <ul className="qn-out" aria-label={words.litLabel(lit.length)}>
      {lit.map((b) => (
        <li key={b.questId} className="qn-out-i">
          <Face who={b.author} size="sm" />
          <div className="qn-out-body">
            <b>{b.mine ? words.you : b.author.name}</b>
            <span>{b.title}</span>
          </div>
          {b.url && (
            <a className="qn-link" href={b.url} target="_blank" rel="noopener noreferrer">
              {words.openLink}
            </a>
          )}
        </li>
      ))}
    </ul>
    </>
  );
}

export function Lighthouses({
  lighthouses,
  me,
  actions,
  points = null,
  badgeDrop = null,
}: {
  lighthouses: LighthousesValue;
  me: Portrait;
  actions: BeaconActions | null;
  /** The points a Beacon earns, from the ladders through QS.13's page slot; null shows none, and is the default. */
  points?: number | null;
  /** A badge a Beacon found (Lighthouse, Keeper of the light), dropping under the horizon (QS.15b). */
  badgeDrop?: ReactNode;
}) {
  const game = useGameStyle();
  const words = questWords(game).lighthouses;
  // What a Beacon lands for the reader (QS.15): the rail beside the heading,
  // and the drop on the horizon once it is lit. Its words are read from the
  // Lands of this render, before the page's next read moves their place.
  const landing = useLands("beacon")?.lands ?? null;
  const landed = dropWords(landing, game);
  const [dropped, showDrop] = useDrop();
  const drop = <ActDrop drop={dropped} game={game} glyph="beacon" className={game ? "" : "qn-drop--line"} />;
  const [form, setForm] = useState<BeaconPrefill | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const offers = handsFireOffers(lighthouses.heldFires);
  const pts = points !== null ? <b> · {points}</b> : null;

  // Escape closes an open lighthouse's card.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const lit = (questId: string | null) => {
    setForm(null);
    showDrop(landed);
    // The new lighthouse arrives with the page's next read; it rises and opens its card.
    setFresh(questId);
    setOpen(questId);
  };

  return (
    <section className="qn-sec" id="qn-lighthouses" aria-labelledby="qn-lh-h">
      <div className="qs-sec-h qn-sec-h">
        <div>
          <h2 id="qn-lh-h" className="qn-h">
            {words.art && (
              <span className="qs-glyph qs-glyph--beacon">
                <Glyph name="beacon" />
              </span>
            )}
            {words.title}
          </h2>
          <p>{words.why}</p>
        </div>
        <LandsRail act="beacon" />
      </div>
      {words.art ? (
        <Horizon lit={lighthouses.lit} me={me} words={words} open={open} fresh={fresh} onToggle={(id) => setOpen((o) => (o === id ? null : id))} drop={drop} />
      ) : (
        <PlainList lit={lighthouses.lit} words={words} drop={drop} />
      )}
      {badgeDrop}
      {!form && offers.length > 0 && (
        <ul className="qn-held">
          {offers.map((f) => (
            <li key={f.questId}>
              <span>
                {words.heldBefore} <b>{f.title}</b> {words.heldAfter}
              </span>
              <button type="button" className="admin-btn admin-btn--sm" onClick={() => setForm({ title: f.title, originQuestId: f.questId })} disabled={!actions}>
                {words.heldLight}
                {pts}
              </button>
              <small>{words.heldWhy}</small>
            </li>
          ))}
        </ul>
      )}
      {!form && (
        <div className="qn-beacon-cta">
          <button type="button" id="qn-light-beacon" data-move="light-beacon" className="admin-btn admin-btn--primary" onClick={() => setForm({ title: "" })} disabled={!actions}>
            {words.art && <Glyph name="beacon" />} {words.light}
            {pts}
          </button>
          <p>{words.lightWhy}</p>
        </div>
      )}
      {form && <BeaconForm key={form.originQuestId ?? "new"} prefill={form.originQuestId ? form : null} actions={actions} points={points} onLit={lit} onCancel={() => setForm(null)} />}
    </section>
  );
}
