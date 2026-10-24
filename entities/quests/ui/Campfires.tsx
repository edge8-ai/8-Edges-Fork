"use client";

// Campfires on the Quests page (QS.5; spec "Wanted fires: hands", "Burning
// fires and seats"; prototype version 10, section 3). Wanted above Burning.
//
// Wanted: topics people raised a hand for. Under three hands a topic is a
// line, "2 hands · one more makes a fire", with I want this too; at three it is
// a cold fire card, logs and smoke, "<n> hands" and "no Host yet", with Light
// it. Below them the one-line ask, "I want to learn…", which joins a topic
// already wanted when its words match. Light it asks for a date and a time of
// day in Saigon (version 10 drew no picker, because a Training session cannot
// exist without a time; the inputs are the Summon drawer's) and lights the
// fire for twenty minutes, with the reader as its Host.
//
// Burning: each lit fire with its flame, the Host's face and "Host <name>",
// its Saigon time, "<n> by the fire" with up to five faces, and Take a seat or
// Leave your seat; its Host sees "You host · +100 when someone sits down".
//
// Nobody who raised a hand is ever named: a topic carries a count and whether
// the reader's own hand is up. The cards are campfire-cards.tsx's.
import { useEffect, useOptimistic, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Glyph } from "./art";
import { useGameStyle } from "./game-style";
import { useLands } from "./lands";
import { LandsRail } from "./LandsRail";
import { ActDrop, useDrop } from "./ActDrop";
import { dropWords } from "./lands-words";
import { questWords } from "./plain-model";
import { WANTED_EMPTY } from "./campfire-words";
import type { CampfireActions } from "./actions-type";
import { BurningFire, ColdFire, WantButton, type HandMove } from "./campfire-cards";
import { splitWanted, withHand, type BurningFire as BurningFireValue, type Campfires as CampfiresValue } from "../lib/campfires-model";

export function Campfires({ campfires, now, actions, badgeDrop = null }: { campfires: CampfiresValue; now: string; actions: CampfireActions | null; /** A badge a fire found (Fire keeper), dropping under the section's heading (QS.15b). */ badgeDrop?: ReactNode }) {
  const game = useGameStyle();
  const words = questWords(game).campfires;
  // What a fire lands for its Host (QS.15): the rail beside the heading, and
  // the drop by the fire once the page's next read draws it. The drop clears
  // itself when its moment ends (useDrop) and nothing is kept, so a reload
  // never shows it again; `litFire` says which fire it belongs by.
  const landing = useLands("fire")?.lands ?? null;
  const [lit, showLit] = useDrop();
  const [litFire, setLitFire] = useState<string | null>(null);
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lightingKey, setLightingKey] = useState<string | null>(null);
  const [freshFire, setFreshFire] = useState<string | null>(null);
  const [asking, startAsk] = useTransition();
  const [moving, startMove] = useTransition();
  // A hand or a seat shows at once and settles when the page's new read
  // arrives; a refused save drops the optimistic state and says why.
  const [topics, setHand] = useOptimistic(campfires.wanted, (state, m: { key: string; up: boolean }) => withHand(state, m.key, m.up));
  const [fires, setSeat] = useOptimistic(campfires.burning, (state, m: { id: string; on: boolean }) =>
    state.map((f) => (f.questId === m.id && f.seated !== m.on ? { ...f, seated: m.on, seats: Math.max(0, f.seats + (m.on ? 1 : -1)) } : f)),
  );
  const { cold, lines } = splitWanted(topics);
  const busy = !actions || moving;

  // A fire just lit is drawn by the page's next read; bring it into view once it is there.
  useEffect(() => {
    if (!freshFire) return;
    const el = document.querySelector(`[data-fire="${freshFire}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [freshFire, campfires.burning]);

  const onHand: HandMove = (t) => {
    if (!actions) return;
    const up = !t.mine;
    setError(null);
    startMove(async () => {
      setHand({ key: t.key, up });
      const r = up ? await actions.raiseHand(t.topic) : await actions.lowerHand(t.key);
      if (!r.ok) setError(r.error);
    });
  };

  const onSeat = (f: BurningFireValue) => {
    if (!actions) return;
    const on = !f.seated;
    setError(null);
    startMove(async () => {
      setSeat({ id: f.questId, on });
      const r = on ? await actions.takeSeat(f.questId) : await actions.leaveSeat(f.questId);
      if (!r.ok) setError(r.error);
    });
  };

  const ask = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (!actions) return;
    const topic = line.trim();
    if (!topic) return setError("Name what you want to learn first.");
    setError(null);
    startAsk(async () => {
      const r = await actions.raiseHand(topic);
      if (!r.ok) return setError(r.error);
      setLine("");
    });
  };

  const light = (key: string) => async (startsAt: string) => {
    if (!actions) return "Lighting is not available here.";
    const r = await actions.lightFire(key, startsAt);
    if (!r.ok) return r.error;
    setLightingKey(null);
    setFreshFire(r.questId ?? null);
    if (r.questId) {
      setLitFire(r.questId);
      showLit(dropWords(landing, game, "when someone sits down"));
    }
    return null;
  };

  return (
    <section className="qn-sec" aria-labelledby="qn-fires-h">
      <div className="qs-sec-h qn-sec-h">
        <div>
          <h2 id="qn-fires-h" className="qn-h">
            {words.art && (
              <span className="qs-glyph qs-glyph--raid">
                <Glyph name="raid" />
              </span>
            )}
            {words.title}
          </h2>
          <p>{words.why}</p>
        </div>
        <LandsRail act="fire" />
      </div>
      {badgeDrop}
      <div className="qn-row-h">
        <span className="qn-row-lbl">{words.wanted}</span>
        <span className="qn-row-sub">{words.wantedWhy}</span>
      </div>
      {cold.length > 0 && (
        <ul className="qn-fires">
          {cold.map((t) => (
            <ColdFire
              key={t.key}
              topic={t}
              words={words}
              now={now}
              busy={busy}
              onHand={onHand}
              lighting={lightingKey === t.key}
              onOpen={() => setLightingKey(t.key)}
              onClose={() => setLightingKey(null)}
              onLight={light(t.key)}
            />
          ))}
        </ul>
      )}
      {lines.length > 0 && (
        <ul className="qn-lines">
          {lines.map((t) => {
            const h = words.handsLine(t.hands);
            return (
              <li key={t.key} className="qn-line">
                <span className="qn-line-t">{t.topic}</span>
                <span className="qn-line-n">
                  <b>{h.n}</b> {h.words}
                </span>
                <WantButton topic={t} onHand={onHand} busy={busy} small />
              </li>
            );
          })}
        </ul>
      )}
      {cold.length === 0 && lines.length === 0 && <p className="qn-none">{WANTED_EMPTY}</p>}
      <form className="qn-ask" onSubmit={ask}>
        <label className="qn-sr" htmlFor="qn-ask-in">
          I want to learn
        </label>
        <input id="qn-ask-in" className="qs-field" name="topic" placeholder="I want to learn…" autoComplete="off" value={line} onChange={(e) => setLine(e.target.value)} maxLength={120} disabled={!actions} />
        <button type="submit" className="admin-btn" disabled={!actions || asking}>
          <Glyph name="hand" /> Raise a hand
        </button>
      </form>
      {error && (
        <p className="qs-error" role="alert">
          {error}
        </p>
      )}
      <div className="qn-row-h">
        <span className="qn-row-lbl">{words.burning}</span>
        <span className="qn-row-sub">{words.burningWhy}</span>
      </div>
      {fires.length > 0 ? (
        <ul className="qn-fires">
          {fires.map((f) => (
            <BurningFire
              key={f.questId}
              fire={f}
              words={words}
              fresh={f.questId === freshFire}
              busy={busy}
              onSeat={onSeat}
              drop={lit && litFire === f.questId ? <ActDrop drop={lit} game={game} glyph="raid" /> : null}
            />
          ))}
        </ul>
      ) : (
        <p className="qn-none">{words.burningEmpty}</p>
      )}
    </section>
  );
}
