"use client";

// The cards Campfires draws (QS.5; prototype version 10, section 3): a cold
// fire with its Light it form, the hand button a wanted topic carries, and a
// burning fire with its Host and its seats. Campfires.tsx composes them into
// the section and holds the moves. Each Face wears its person's border from
// the page's one faces read (LD.4): the page counts the Host and the people
// by the fire among the faces it draws (peopleDrawn).
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useActPoints } from "./act-points";
import { addDays, BUSINESS_TIME_ZONE, businessDate } from "@/kernel/config/dates";
import { FireArt, Glyph } from "./art";
import { Face } from "./Face";
import { saigonInstant } from "@/kernel/config/dates";
import type { CampfireWords } from "./campfire-words";
import { FIRE_MINUTES, fireTime, type BurningFire as BurningFireValue, type WantedTopic } from "../lib/campfires-model";

/** The time a Light it form opens on: tomorrow at four in the afternoon, Saigon. */
const DEFAULT_TIME = "16:00";

export type HandMove = (t: WantedTopic) => void;

export function WantButton({ topic, onHand, busy, small = false }: { topic: WantedTopic; onHand: HandMove; busy: boolean; small?: boolean }) {
  return (
    <button type="button" className={`admin-btn${small ? " admin-btn--sm" : ""} qn-want`} aria-pressed={topic.mine} onClick={() => onHand(topic)} disabled={busy}>
      {topic.mine ? (
        <>
          <Glyph name="check" size={small ? 14 : 16} /> You want this too
        </>
      ) : small ? (
        "I want this too"
      ) : (
        <>
          <Glyph name="hand" /> I want this too
        </>
      )}
    </button>
  );
}

function LightForm({ topic, words, now, onLight, onCancel }: { topic: WantedTopic; words: CampfireWords; now: string; onLight: (startsAt: string) => Promise<string | null>; onCancel: () => void }) {
  const today = businessDate(now);
  const [date, setDate] = useState(addDays(today, 1));
  const [time, setTime] = useState(DEFAULT_TIME);
  const [error, setError] = useState<string | null>(null);
  const [lighting, startLight] = useTransition();
  const id = `qn-light-${topic.key.replace(/[^a-z0-9]+/gi, "-")}`;
  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const at = saigonInstant(date, time);
    if (!at) return setError("Pick a date and a time.");
    if (Date.parse(at) <= Date.now()) return setError("Pick a time that has not passed.");
    setError(null);
    startLight(async () => setError(await onLight(at)));
  };
  return (
    <form className="qn-light" onSubmit={submit}>
      <span className="qs-lab">When will you host it?</span>
      <div className="qs-head-form-due">
        <label className="qn-sr" htmlFor={`${id}-date`}>
          Date
        </label>
        <input id={`${id}-date`} className="qs-field" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
        <label className="qn-sr" htmlFor={`${id}-time`}>
          Time of day
        </label>
        <input id={`${id}-time`} className="qs-field" type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} />
        <span className="qs-tz" title={BUSINESS_TIME_ZONE}>
          Saigon · {FIRE_MINUTES} minutes
        </span>
      </div>
      {error && (
        <p className="qs-error" role="alert">
          {error}
        </p>
      )}
      <div className="qs-moves">
        <button type="button" className="admin-btn" onClick={onCancel} disabled={lighting}>
          Cancel
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={lighting}>
          {lighting ? words.lighting : words.light}
        </button>
      </div>
    </form>
  );
}

export function ColdFire({ topic, words, now, busy, onHand, lighting, onOpen, onClose, onLight }: { topic: WantedTopic; words: CampfireWords; now: string; busy: boolean; onHand: HandMove; lighting: boolean; onOpen: () => void; onClose: () => void; onLight: (startsAt: string) => Promise<string | null> }) {
  return (
    <li className={`qn-fire qn-fire--cold${words.art ? "" : " qn-fire--plain"}`}>
      {words.art && (
        <div className="qn-fire-art">
          <FireArt burning={false} />
        </div>
      )}
      <div className="qn-fire-body">
        <div className="qn-fire-kind">{words.coldKind}</div>
        <h3 className="qn-fire-title">{topic.topic}</h3>
        <div className="qn-fire-meta">
          <span>
            <b>{topic.hands}</b> {words.handsWord(topic.hands)}
          </span>
          <span>{words.noHost}</span>
        </div>
        {lighting ? (
          <LightForm topic={topic} words={words} now={now} onLight={onLight} onCancel={onClose} />
        ) : (
          <div className="qs-moves">
            <WantButton topic={topic} onHand={onHand} busy={busy} />
            <button type="button" className="admin-btn admin-btn--primary" onClick={onOpen} disabled={busy} data-move={`light-${topic.key}`}>
              {words.light}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function BurningFire({ fire, words, fresh, busy, onSeat, drop = null }: { fire: BurningFireValue; words: CampfireWords; fresh: boolean; busy: boolean; onSeat: (fire: BurningFireValue) => void; /** What lighting it landed for its Host, dropped by the fire (QS.15). */ drop?: ReactNode }) {
  // The Host's 100 is the ladders' figure, read through the page slot (QS.13); null without ladders.
  const firePoints = useActPoints()?.fire ?? null;
  const seats = words.seatsLine(fire.seats);
  return (
    <li className={`qn-fire qn-fire--burn${fire.youHost ? " qn-fire--mine" : ""}${fresh ? " qn-fire--fresh" : ""}${words.art ? "" : " qn-fire--plain"}`} data-fire={fire.questId}
      // Your next move scrolls to the fire its reader hosts and focuses it (QS.13).
      data-move={fire.youHost ? `host-${fire.questId}` : undefined} tabIndex={fire.youHost ? -1 : undefined}>
      {words.art && (
        <div className="qn-fire-art">
          <FireArt burning />
        </div>
      )}
      <div className="qn-fire-body">
        <div className="qn-fire-kind">{words.burningKind}</div>
        <h3 className="qn-fire-title">{fire.title}</h3>
        <div className="qn-host">
          <Face who={fire.host} />
          <span>
            Host <b>{fire.youHost ? "you" : fire.host.name}</b>
          </span>
        </div>
        <div className="qn-fire-meta">
          <span>{fireTime(fire.startsAt)}</span>
        </div>
        <div className="qn-seats">
          {fire.faces.length > 0 && (
            <span className="qs-mini">
              {fire.faces.map((f) => (
                <Face key={f.personId} who={f} size="sm" />
              ))}
            </span>
          )}
          <span>
            {seats.n !== null && <b>{seats.n}</b>} {seats.words}
          </span>
        </div>
        {fire.youHost ? (
          <p className="qn-said">
            <b>You host</b> · {words.youHost(firePoints)}
          </p>
        ) : (
          <div className="qs-moves">
            <button type="button" className={`admin-btn${fire.seated ? "" : " admin-btn--primary"}`} onClick={() => onSeat(fire)} disabled={busy}>
              {fire.seated ? (
                "Leave your seat"
              ) : (
                <>
                  <Glyph name="seat" /> Take a seat
                </>
              )}
            </button>
            {fire.seated && (
              <span className="qs-said">
                <b className="qs-said-strong">{words.seated}</b>
              </span>
            )}
          </div>
        )}
      </div>
      {drop}
    </li>
  );
}
