"use client";

// The Evolve pill on the author's own learning in the Lore (QS.7; spec
// "Evolve: an unlock on your own learning"; prototype version 10, section 4).
// It fills the Lore's action row, and QuestsView draws it only on a learning
// the reader wrote, from a state the read computed only for their own; it is
// never sent to anyone, as a notification, a reminder or a line.
//
// It unlocks in three states and ends in a fourth, each in version 10's
// markup (.qn-evolve):
//
// - three will try: "Evolve · 3 will try → Host a 20-minute fire on this",
//   which opens the Light it move's own date and time form (version 10 drew
//   no time step; the spec says it asks for one, so the form is the cold
//   fire's);
// - the fire lit: "Fire · Lit. You host · …" and See it at Campfires;
// - the fire held: "Fire held <date> · <n> sat by it → Light it as a Beacon",
//   which opens the Beacon form in Lighthouses with the fire filled in, and
//   Write what you taught, a learning the Host shares through the composer's
//   own action;
// - the Beacon lit: "Beacon · Lit. It stands on the horizon."
//
// The points on each button are the ladders', from QS.13's page slot through
// act-points; without it no button shows a number.
import { useState, useTransition, type FormEvent } from "react";
import { SPARK_TITLE_MAX } from "@/entities/ideas/client";
import { Glyph } from "./art";
import { useActPoints } from "./act-points";
import { LightForm } from "./campfire-cards";
import { campfireWords } from "./campfire-words";
import { evolveWords } from "./evolve-words";
import { useGameStyle } from "./game-style";
import { loreWords } from "./lore-model";
import type { BeaconPrefill } from "./BeaconForm";
import type { EvolveActions, LoreActions } from "./actions-type";
import { fireDayAndHour } from "../lib/campfires-model";
import type { Evolve } from "../lib/evolve-model";
import type { LoreEntry } from "../lib/lore";

/** Scrolls to a fire's card under Campfires, or to the section when the card is not drawn. */
function seeFire(questId: string): void {
  const card = document.querySelector(`[data-fire="${questId}"]`) ?? document.getElementById("qn-fires-h");
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** The Host's notes on a held fire: one line, shared as their learning through the Lore composer's action. */
function TaughtForm({ id, share, points, onDone, onCancel }: { id: string; share: LoreActions["shareLearning"]; points: number | null; onDone: () => void; onCancel: () => void }) {
  const game = useGameStyle();
  const words = evolveWords(game);
  const lore = loreWords(game, points);
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const send = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const text = line.trim();
    if (!text) return setError(words.taughtEmpty);
    setError(null);
    startSend(async () => {
      const r = await share(text);
      if (!r.ok) return setError(r.error);
      onDone();
    });
  };
  return (
    <form className="qn-evolve-form" onSubmit={send}>
      <label className="qn-sr" htmlFor={`qn-taught-${id}`}>
        {words.taughtLabel}
      </label>
      <input id={`qn-taught-${id}`} className="qs-field" value={line} onChange={(e) => setLine(e.target.value)} placeholder={words.taughtPlaceholder} maxLength={SPARK_TITLE_MAX} autoComplete="off" autoFocus />
      {error && (
        <p className="qs-error" role="alert">
          {error}
        </p>
      )}
      <div className="qs-moves">
        <button type="button" className="admin-btn" onClick={onCancel} disabled={sending}>
          {words.cancel}
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={sending}>
          {sending ? lore.sharing : lore.share}
        </button>
      </div>
    </form>
  );
}

export function EvolvePill({
  entry,
  evolve,
  now,
  actions,
  share,
  onBeacon,
}: {
  entry: LoreEntry;
  evolve: Evolve;
  now: string;
  /** Hosting a fire on the learning; null draws the pill without it. */
  actions: EvolveActions | null;
  /** The Lore composer's action, for what the Host taught; null draws no way to write it. */
  share: LoreActions["shareLearning"] | null;
  /** Opens the Beacon form in Lighthouses with the held fire filled in; null when the page cannot light one. */
  onBeacon: ((prefill: BeaconPrefill) => void) | null;
}) {
  const game = useGameStyle();
  const words = evolveWords(game);
  const points = useActPoints();
  const pts = (n: number | undefined) => (n === undefined ? null : <b> · {n}</b>);
  const [open, setOpen] = useState<"time" | "taught" | null>(null);
  const [taught, setTaught] = useState(false);

  if (evolve.step === "fire") {
    const host = async (startsAt: string) => {
      if (!actions) return words.hostUnavailable;
      const r = await actions.hostFireOnLearning(entry.id, startsAt);
      if (!r.ok) return r.error;
      setOpen(null);
      return null;
    };
    return (
      <div className="qn-evolve" data-evolve="fire">
        <span className="qn-evolve-tag">{words.tag}</span>
        <span className="qn-evolve-why">
          <b>{evolve.willTry}</b> {words.willTry} <Glyph name="arrow" size={12} />
        </span>
        {open === "time" ? (
          <LightForm idBase={`evolve-${entry.id}`} words={campfireWords(game)} now={now} onLight={host} onCancel={() => setOpen(null)} />
        ) : (
          <button type="button" className="admin-btn admin-btn--sm" data-move="evolve-fire" onClick={() => setOpen("time")} disabled={!actions}>
            {words.host}
            {pts(points?.fire)}
          </button>
        )}
      </div>
    );
  }

  if (evolve.step === "lit") {
    return (
      <div className="qn-evolve qn-evolve--done" data-evolve="lit">
        <span className="qn-evolve-tag">
          {game && <Glyph name="raid" size={12} />} {words.litTag}
        </span>
        <span>
          <b>{words.lit}</b> {words.hostLine(points?.fire ?? null)}
        </span>
        <button type="button" className="qn-link" onClick={() => seeFire(evolve.questId)}>
          {words.see}
        </button>
      </div>
    );
  }

  if (evolve.step === "held") {
    const day = fireDayAndHour(evolve.heldAt).day;
    return (
      <div className="qn-evolve qn-evolve--beacon" data-evolve="held">
        <span className="qn-evolve-tag">{words.tag}</span>
        <span className="qn-evolve-why">
          {words.held(day, evolve.sat)} <Glyph name="arrow" size={12} />
        </span>
        <button type="button" className="admin-btn admin-btn--sm" data-move="evolve-beacon" onClick={() => onBeacon?.({ title: evolve.title, originQuestId: evolve.questId })} disabled={!onBeacon}>
          {words.toBeacon}
          {pts(points?.beacon)}
        </button>
        <span className="qn-evolve-note">{words.toBeaconWhy}</span>
        {open === "taught" && share ? (
          <TaughtForm
            id={entry.id}
            share={share}
            points={points?.learning ?? null}
            onDone={() => {
              setOpen(null);
              setTaught(true);
            }}
            onCancel={() => setOpen(null)}
          />
        ) : taught ? (
          <span className="qn-evolve-note" role="status">
            {words.taughtDone}
          </span>
        ) : (
          share && (
            <button type="button" className="qn-link" onClick={() => setOpen("taught")}>
              {words.taught}
            </button>
          )
        )}
      </div>
    );
  }

  return (
    <div className="qn-evolve qn-evolve--done" data-evolve="beacon">
      <span className="qn-evolve-tag">
        {game && <Glyph name="beacon" size={12} />} {words.beaconTag}
      </span>
      <span>
        <b>{words.beaconLit}</b> {words.beaconWhere}
      </span>
    </div>
  );
}
